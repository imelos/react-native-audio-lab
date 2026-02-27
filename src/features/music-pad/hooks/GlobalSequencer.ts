import performance from 'react-native-performance';
import NativeAudioModule from '../../../specs/NativeAudioModule';
import type { AutomationEvent, LoopSequence, NoteEvent } from '../utils/loopUtils';
import {
  computeLoopTime,
  findNextEventIndex,
  getRecordingTimelineContext,
  normalizeRecordedTimestamp,
} from '../engine/sequencer/timing';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Delegate interface — each Player implements this so the sequencer can
 * push real-time updates without knowing anything about React.
 */
export interface ChannelDelegate {
  onNoteOn(note: number, velocity: number): void;
  onNoteOff(note: number): void;
  /** Called every RAF frame with loop-local time (drives playhead / visualizer) */
  onTick(loopTimeMs: number, loopDuration: number): void;
  /** Called when the loop wraps — player should reset transient visual state */
  onLoopWrap(): void;
}

interface ChannelState {
  delegate: ChannelDelegate;
  sequence: LoopSequence | null;
  activeNotes: Set<number>;
  eventIndex: number;
  lastLoopTime: number;
  // Clip launch state
  clipLaunched: boolean;
  playbackStartTime: number;
  queuedLaunchTime: number | null;
  queuedLaunchSequence: LoopSequence | null;
  queuedStopTime: number | null;
  // Recording
  isRecording: boolean;
  recordingStartTime: number;
  recordingLoopOffset: number; // where in the active recording timeline we started
  recordingTimelineDuration: number; // seq.duration for overdub, else masterDuration
  recordedEvents: NoteEvent[];
  automationBuffer: AutomationEvent[];
  // Playback replay cursor for automation events (reset on loop wrap)
  lastAutomationIdx: number;
}

export interface ChannelPlaybackSnapshot {
  hasSequence: boolean;
  isLaunched: boolean;
  isPlayingNow: boolean;
  isQueuedToLaunch: boolean;
  isQueuedToStop: boolean;
  loopTimeMs: number;
  loopDurationMs: number;
  progress: number;
}

export type TransportState = 'stopped' | 'playing';
export type TransportListener = (state: TransportState) => void;
export type ChannelSequenceListener = (
  channel: number,
  sequence: LoopSequence | null,
) => void;

const NO_OP_DELEGATE: ChannelDelegate = {
  onNoteOn() {},
  onNoteOff() {},
  onTick() {},
  onLoopWrap() {},
};

const DEFAULT_LAUNCH_QUANTIZATION_MS = 2000; // 1 bar @ 120 BPM

function findNextAutomationIdx(automation: AutomationEvent[], loopTime: number): number {
  for (let i = 0; i < automation.length; i++) {
    if (automation[i].timestamp > loopTime) return i;
  }
  return automation.length;
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton
// ─────────────────────────────────────────────────────────────────────────────

class GlobalSequencer {
  private static _instance: GlobalSequencer | null = null;

  static getInstance(): GlobalSequencer {
    if (!GlobalSequencer._instance) {
      GlobalSequencer._instance = new GlobalSequencer();
    }
    return GlobalSequencer._instance;
  }

  // ── Internal state ───────────────────────────────────────────────────────

  private channels = new Map<number, ChannelState>();
  private rafId: number | null = null;
  private _transportState: TransportState = 'stopped';
  private globalStartTime = 0;
  private masterDuration = 0;

  private transportListeners = new Set<TransportListener>();
  private channelSequenceListeners = new Set<ChannelSequenceListener>();
  private automationListeners = new Map<number, Set<(paramId: string, value: number) => void>>();
  private recordingListeners = new Map<number, Set<(isRecording: boolean) => void>>();

  private constructor() {}

  // ── Channel registration ─────────────────────────────────────────────────

  registerChannel(channel: number, delegate: ChannelDelegate): void {
    const existing = this.channels.get(channel);
    if (existing) {
      // Hot-swap delegate (e.g. component remounted while sequence persists)
      existing.delegate = delegate;
      return;
    }
    this.channels.set(channel, {
      delegate,
      sequence: null,
      activeNotes: new Set(),
      eventIndex: 0,
      lastLoopTime: -1,
      clipLaunched: false,
      playbackStartTime: 0,
      queuedLaunchTime: null,
      queuedLaunchSequence: null,
      queuedStopTime: null,
      isRecording: false,
      recordingStartTime: 0,
      recordingLoopOffset: 0,
      recordingTimelineDuration: 0,
      recordedEvents: [],
      automationBuffer: [],
      lastAutomationIdx: 0,
    });
  }

  unregisterChannel(channel: number): void {
    const state = this.channels.get(channel);
    if (!state) return;
    this.silenceChannel(channel, state);
    this.channels.delete(channel);
    if (this.channels.size === 0) this.stop();
  }

  /** Detach the UI delegate but keep the channel (sequence + playback) alive. */
  detachDelegate(channel: number): void {
    const state = this.channels.get(channel);
    if (state) {
      state.delegate = NO_OP_DELEGATE;
    }
  }

  // ── Sequences ────────────────────────────────────────────────────────────

  setSequence(channel: number, sequence: LoopSequence | null): void {
    const state = this.channels.get(channel);
    if (!state) return;

    const hadSequence = !!state.sequence;

    // Sequence replacement/removal must silence any currently playing notes
    // for this channel, otherwise notes can hang while transport continues.
    this.silenceChannel(channel, state);

    if (sequence) {
      this.sortSequenceEvents(sequence);
    }

    state.sequence = sequence;
    state.queuedLaunchSequence = null;

    if (!sequence) {
      state.clipLaunched = false;
      state.playbackStartTime = 0;
      state.queuedLaunchTime = null;
      state.queuedStopTime = null;
      state.eventIndex = 0;
      state.lastLoopTime = -1;
      this.recalcMasterDuration();
      this.channelSequenceListeners.forEach(fn => fn(channel, sequence));
      return;
    }

    if (!hadSequence) {
      // New clips default to launched so first recording behaves as before.
      state.clipLaunched = true;
      state.playbackStartTime =
        this._transportState === 'playing'
          ? this.globalStartTime
          : performance.now();
      state.queuedLaunchTime = null;
      state.queuedStopTime = null;
    }

    // While transport is running, replacing a launched sequence must NOT replay
    // events that are already in the past for the current loop position.
    if (
      this._transportState === 'playing' &&
      state.clipLaunched &&
      sequence.duration > 0
    ) {
      const loopTime = computeLoopTime(
        performance.now(),
        this.getChannelPlaybackStartTime(state),
        sequence.duration,
      );
      state.lastLoopTime = loopTime;
      state.eventIndex = findNextEventIndex(sequence.events, loopTime);
      state.lastAutomationIdx = sequence.automation
        ? findNextAutomationIdx(sequence.automation, loopTime)
        : 0;
    } else {
      state.eventIndex = 0;
      state.lastLoopTime = -1;
      state.lastAutomationIdx = 0;
    }

    this.recalcMasterDuration();
    this.channelSequenceListeners.forEach(fn => fn(channel, sequence));
  }

  getSequence(channel: number): LoopSequence | null {
    return this.channels.get(channel)?.sequence ?? null;
  }

  private recalcMasterDuration(): void {
    let max = 0;
    this.channels.forEach(s => {
      if (s.sequence) max = Math.max(max, s.sequence.duration);
    });
    this.masterDuration = max;
  }

  getMasterDuration(): number {
    return this.masterDuration;
  }

  // ── Clip launch / stop (Ableton-style channel behavior) ────────────────

  launchChannelClip(channel: number): void {
    const state = this.channels.get(channel);
    if (!state?.sequence) return;
    this.launchChannelSequence(channel, state.sequence);
  }

  launchChannelSequence(channel: number, sequence: LoopSequence): void {
    const state = this.channels.get(channel);
    if (!state) return;

    this.sortSequenceEvents(sequence);

    if (this._transportState !== 'playing') {
      if (state.sequence !== sequence) {
        this.setSequence(channel, sequence);
      }
      state.clipLaunched = true;
      state.playbackStartTime = performance.now();
      state.queuedLaunchTime = null;
      state.queuedLaunchSequence = null;
      state.queuedStopTime = null;
      state.eventIndex = 0;
      state.lastLoopTime = -1;
      this.play();
      return;
    }

    const triggerAt = this.getNextGridTime(
      this.getLaunchQuantizationMs(state.sequence),
    );

    // Relaunch behavior: any currently sounding clip on this channel
    // is stopped exactly at the same quantized boundary as the relaunch.
    state.queuedStopTime =
      state.clipLaunched || state.queuedLaunchTime != null
        ? triggerAt
        : null;
    state.queuedLaunchTime = triggerAt;
    state.queuedLaunchSequence = sequence;
  }

  stopChannelClips(channel: number): void {
    const state = this.channels.get(channel);
    if (!state) return;

    // Stop should always cancel any pending launch.
    state.queuedLaunchTime = null;
    state.queuedLaunchSequence = null;

    if (!state.sequence || this._transportState !== 'playing') {
      this.forceStopChannel(channel, state);
      return;
    }

    if (!state.clipLaunched) {
      state.queuedStopTime = null;
      return;
    }

    state.queuedStopTime = this.getNextGridTime(
      this.getLaunchQuantizationMs(state.sequence),
    );
  }

  getChannelPlaybackSnapshot(channel: number): ChannelPlaybackSnapshot {
    const state = this.channels.get(channel);
    const sequence = state?.sequence ?? null;
    const hasSequence = sequence != null;
    const isLaunched = !!state?.clipLaunched && hasSequence;
    const isPlayingNow = isLaunched && this._transportState === 'playing';
    const loopDurationMs = sequence?.duration ?? 0;

    let loopTimeMs = 0;
    if (isPlayingNow && loopDurationMs > 0 && state) {
      loopTimeMs = computeLoopTime(
        performance.now(),
        this.getChannelPlaybackStartTime(state),
        loopDurationMs,
      );
    } else if (isLaunched && loopDurationMs > 0 && state && state.lastLoopTime >= 0) {
      loopTimeMs = state.lastLoopTime;
    }

    const progress =
      loopDurationMs > 0
        ? Math.max(0, Math.min(1, loopTimeMs / loopDurationMs))
        : 0;

    return {
      hasSequence,
      isLaunched,
      isPlayingNow,
      isQueuedToLaunch: state?.queuedLaunchTime != null,
      isQueuedToStop: state?.queuedStopTime != null,
      loopTimeMs,
      loopDurationMs,
      progress,
    };
  }

  // ── Recording helpers (per-channel) ──────────────────────────────────────

  startRecording(channel: number): void {
    const s = this.channels.get(channel);
    if (!s) return;
    if (s.isRecording) return; // already armed — don't reset buffers mid-recording
    s.isRecording = true;
    s.recordingStartTime = performance.now();
    s.recordedEvents = [];
    s.automationBuffer = [];
    this.recordingListeners.get(channel)?.forEach(fn => fn(true));

    // Capture where in the active timeline we are so recorded events can
    // be placed at the correct loop-relative position when recording stops.
    const now = performance.now();
    const timelineStartTime = s.sequence
      ? this.getChannelPlaybackStartTime(s)
      : this.globalStartTime;
    const timeline = getRecordingTimelineContext({
      isPlaying: this._transportState === 'playing',
      now,
      globalStartTime: timelineStartTime,
      sequenceDuration: s.sequence?.duration ?? 0,
      masterDuration: this.masterDuration,
    });
    s.recordingTimelineDuration = timeline.duration;
    s.recordingLoopOffset = timeline.offset;
    if (timeline.duration === 0) {
      // Start the RAF loop so delegates receive onTick during recording
      // even when no sequence is playing yet.
      this.ensureRAF();
    }
  }

  stopRecording(channel: number): NoteEvent[] {
    const s = this.channels.get(channel);
    if (!s) return [];
    s.isRecording = false;
    this.recordingListeners.get(channel)?.forEach(fn => fn(false));
    const offset = s.recordingLoopOffset;
    const timelineDuration = s.recordingTimelineDuration;
    // Offset events so they're timeline-aligned (sequence timeline for overdub,
    // master timeline for first-take while transport is running).
    let lastTimestamp = -Infinity;
    const evts = s.recordedEvents.map(e => {
      let timestamp = e.timestamp + offset;

      // Keep timestamps monotonic in recording order. This preserves pairs
      // that cross loop boundaries (e.g. first note starts before the
      // recording offset and ends after it) so they are not dropped later.
      if (timelineDuration > 0) {
        while (timestamp < lastTimestamp - 1) {
          timestamp += timelineDuration;
        }
      }
      lastTimestamp = timestamp;

      return {
        ...e,
        timestamp,
      };
    });
    s.recordedEvents = [];
    s.recordingTimelineDuration = 0;

    // Stop RAF if nothing else needs it
    if (this._transportState !== 'playing' && !this.isAnyChannelRecording()) {
      this.stopRAF();
    }
    return evts;
  }

  isChannelRecording(channel: number): boolean {
    return this.channels.get(channel)?.isRecording ?? false;
  }

  /** Record a normalized automation value at the current musical time for the channel. */
  pushAutomationEvent(channel: number, paramId: string, normalizedValue: number): void {
    const s = this.channels.get(channel);
    if (!s?.isRecording) return;
    const timestamp = performance.now() - s.recordingStartTime;
    s.automationBuffer.push({ timestamp, paramId, value: normalizedValue });
  }

  /** Finalize automation recording, apply the same loop-offset normalization as stopRecording(). */
  stopAutomationRecording(channel: number): AutomationEvent[] {
    const s = this.channels.get(channel);
    if (!s) return [];
    const offset = s.recordingLoopOffset;
    const timelineDuration = s.recordingTimelineDuration;
    let lastTimestamp = -Infinity;
    const evts = s.automationBuffer.map(e => {
      let timestamp = e.timestamp + offset;
      if (timelineDuration > 0) {
        while (timestamp < lastTimestamp - 1) {
          timestamp += timelineDuration;
        }
      }
      lastTimestamp = timestamp;
      return { ...e, timestamp };
    });
    s.automationBuffer = [];
    return evts.sort((a, b) => a.timestamp - b.timestamp);
  }

  /** Subscribe to recording state changes for a channel. Returns unsubscribe fn. */
  onChannelRecording(
    channel: number,
    fn: (isRecording: boolean) => void,
  ): () => void {
    let listeners = this.recordingListeners.get(channel);
    if (!listeners) {
      listeners = new Set();
      this.recordingListeners.set(channel, listeners);
    }
    listeners.add(fn);
    return () => {
      this.recordingListeners.get(channel)?.delete(fn);
    };
  }

  /** Subscribe to per-channel automation events fired during playback. Returns unsubscribe fn. */
  onChannelAutomation(
    channel: number,
    fn: (paramId: string, value: number) => void,
  ): () => void {
    let listeners = this.automationListeners.get(channel);
    if (!listeners) {
      listeners = new Set();
      this.automationListeners.set(channel, listeners);
    }
    listeners.add(fn);
    return () => {
      this.automationListeners.get(channel)?.delete(fn);
    };
  }

  /** Called by the Player when the user touches a pad during recording.
   *  Optional `timestamp` semantics:
   *   - while stopped: ms since recording start
   *   - while playing: loop-local musical ms
   *  Used by note-repeat to record grid-aligned events without RAF jitter. */
  pushRecordEvent(
    channel: number,
    type: 'noteOn' | 'noteOff',
    note: number,
    velocity = 0.85,
    timestamp?: number,
  ): void {
    const s = this.channels.get(channel);
    if (!s?.isRecording) return;
    const rawTs = timestamp ?? performance.now() - s.recordingStartTime;
    const ts = normalizeRecordedTimestamp({
      rawTimestamp: rawTs,
      hasExplicitTimestamp: timestamp != null,
      isPlaying: this._transportState === 'playing',
      recordingLoopOffset: s.recordingLoopOffset,
      recordingTimelineDuration: s.recordingTimelineDuration,
    });
    s.recordedEvents.push({ type, note, timestamp: ts, velocity });
  }

  // ── Transport ────────────────────────────────────────────────────────────

  play(): void {
    if (this._transportState === 'playing') return;
    if (this.masterDuration === 0) return;

    const startTime = performance.now();
    this._transportState = 'playing';
    this.globalStartTime = startTime;

    this.channels.forEach(s => {
      s.eventIndex = 0;
      s.lastLoopTime = -1;
      s.queuedLaunchTime = null;
      s.queuedLaunchSequence = null;
      s.queuedStopTime = null;
      if (s.sequence && s.clipLaunched) {
        s.playbackStartTime = startTime;
      }
    });

    this.emitTransport();
    this.ensureRAF();
  }

  stop(): void {
    if (this._transportState === 'stopped') return;
    this._transportState = 'stopped';

    // Silence every channel
    this.channels.forEach((s, ch) => {
      this.silenceChannel(ch, s);
      s.eventIndex = 0;
      s.lastLoopTime = -1;
      s.queuedLaunchTime = null;
      s.queuedLaunchSequence = null;
      s.queuedStopTime = null;
    });

    // Stop RAF if no channels are recording
    if (!this.isAnyChannelRecording()) {
      this.stopRAF();
    }

    this.emitTransport();
  }

  togglePlayback(): void {
    this._transportState === 'playing' ? this.stop() : this.play();
  }

  get transportState(): TransportState {
    return this._transportState;
  }

  // ── Listeners ────────────────────────────────────────────────────────────

  onTransport(fn: TransportListener): () => void {
    this.transportListeners.add(fn);
    return () => {
      this.transportListeners.delete(fn);
    };
  }

  onChannelSequence(fn: ChannelSequenceListener): () => void {
    this.channelSequenceListeners.add(fn);
    return () => {
      this.channelSequenceListeners.delete(fn);
    };
  }

  private emitTransport(): void {
    const st = this._transportState;
    this.transportListeners.forEach(fn => fn(st));
  }

  // ── The single RAF loop ──────────────────────────────────────────────────

  /** Start RAF if not already running. */
  private ensureRAF(): void {
    if (this.rafId !== null) return;
    this.startRAF();
  }

  private stopRAF(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private isAnyChannelRecording(): boolean {
    for (const [, s] of this.channels) {
      if (s.isRecording) return true;
    }
    return false;
  }

  private startRAF(): void {
    const tick = () => {
      const isPlaying = this._transportState === 'playing';
      const isRecording = this.isAnyChannelRecording();

      // Nothing needs the loop — stop it
      if (!isPlaying && !isRecording) return;

      const now = performance.now();
      const elapsed = now - this.globalStartTime;

      this.channels.forEach((s, ch) => {
        let seq = s.sequence;

        // ── Recording-only mode (no sequences playing yet) ────────
        if (!isPlaying) {
          if (s.isRecording) {
            // Elapsed time since recording started — drives MidiVisualizer
            const recElapsed = now - s.recordingStartTime;
            s.delegate.onTick(recElapsed, 0);
          }
          return;
        }

        // Apply queued clip stop/relaunch exactly on quantized boundary.
        if (s.queuedStopTime != null && now >= s.queuedStopTime) {
          this.forceStopChannel(ch, s);
        }
        if (s.queuedLaunchTime != null && now >= s.queuedLaunchTime) {
          if (
            s.queuedLaunchSequence &&
            s.sequence !== s.queuedLaunchSequence
          ) {
            // Swap clip contents exactly on the launch boundary so the newly
            // selected clip never leaks audio before the quantized restart.
            this.setSequence(ch, s.queuedLaunchSequence);
          }
          this.forceLaunchChannel(ch, s, s.queuedLaunchTime);
        }
        seq = s.sequence;

        // ── Channels without a sequence ────────────────────────────
        if (!seq) {
          // First-take recording on a new channel should use linear
          // recording time, not master loop time, so preview can extend
          // beyond existing channels before commit.
          if (s.isRecording) {
            const recElapsed = now - s.recordingStartTime;
            const musicalTime = recElapsed + s.recordingLoopOffset;
            s.delegate.onTick(musicalTime, this.masterDuration);
            return;
          }

          // Non-recording channels still follow global loop position.
          if (this.masterDuration > 0) {
            const loopTime = elapsed % this.masterDuration;
            s.delegate.onTick(loopTime, this.masterDuration);
          }
          return;
        }

        if (!s.clipLaunched) {
          if (s.isRecording) {
            const recElapsed = now - s.recordingStartTime;
            const musicalTime = recElapsed + s.recordingLoopOffset;
            s.delegate.onTick(musicalTime, seq.duration);
          } else {
            s.delegate.onTick(0, seq.duration);
          }
          return;
        }

        const loopTime = computeLoopTime(
          now,
          this.getChannelPlaybackStartTime(s),
          seq.duration,
        );

        // ── Loop wrap ──────────────────────────────────────────────
        if (loopTime < s.lastLoopTime) {
          this.silenceChannel(ch, s);
          s.eventIndex = 0;
          s.lastAutomationIdx = 0;
          s.delegate.onLoopWrap();
        }

        // ── Dispatch events ────────────────────────────────────────
        const evts = seq.events;
        while (
          s.eventIndex < evts.length &&
          evts[s.eventIndex].timestamp <= loopTime
        ) {
          const e = evts[s.eventIndex];
          if (e.type === 'noteOn') {
            NativeAudioModule.noteOn(ch, e.note, e.velocity);
            s.activeNotes.add(e.note);
            s.delegate.onNoteOn(e.note, e.velocity);
          } else {
            NativeAudioModule.noteOff(ch, e.note);
            s.activeNotes.delete(e.note);
            s.delegate.onNoteOff(e.note);
          }
          s.eventIndex++;
        }

        // ── Automation replay ──────────────────────────────────────
        const automation = seq.automation;
        if (automation && automation.length > 0) {
          const autoListeners = this.automationListeners.get(ch);
          if (autoListeners && autoListeners.size > 0) {
            while (
              s.lastAutomationIdx < automation.length &&
              automation[s.lastAutomationIdx].timestamp <= loopTime
            ) {
              const ev = automation[s.lastAutomationIdx];
              autoListeners.forEach(fn => fn(ev.paramId, ev.value));
              s.lastAutomationIdx++;
            }
          }
        }

        // ── Per-frame tick (playhead, visualizer) ──────────────────
        s.delegate.onTick(loopTime, seq.duration);
        s.lastLoopTime = loopTime;
      });

      this.rafId = requestAnimationFrame(tick);
    };

    this.rafId = requestAnimationFrame(tick);
  }

  // ── Utilities ────────────────────────────────────────────────────────────

  hasAnySequence(): boolean {
    for (const [, s] of this.channels) {
      if (s.sequence) return true;
    }
    return false;
  }

  getActiveChannels(): number[] {
    const out: number[] = [];
    this.channels.forEach((s, ch) => {
      if (s.sequence) out.push(ch);
    });
    return out;
  }

  /**
   * Returns the current musical time (ms) for a channel computed from a
   * fresh performance.now() call — NOT from the RAF-updated SharedValue
   * which can be up to ~16ms stale. This eliminates timing discrepancies
   * when multiple notes are triggered in the same synchronous loop.
   */
  getCurrentMusicalMs(channel: number): number {
    const s = this.channels.get(channel);
    if (!s) return 0;
    if (s.isRecording && !s.sequence) {
      return (
        performance.now() - s.recordingStartTime + s.recordingLoopOffset
      );
    }
    if (this._transportState === 'playing') {
      const seq = s.sequence;
      const dur = seq ? seq.duration : this.masterDuration;
      const timelineStart = seq
        ? this.getChannelPlaybackStartTime(s)
        : this.globalStartTime;
      const elapsed = performance.now() - timelineStart;
      return dur > 0 ? elapsed % dur : elapsed;
    }
    if (s.isRecording) {
      return performance.now() - s.recordingStartTime;
    }
    return 0;
  }

  /**
   * Like getCurrentMusicalMs but for a specific wall-clock time instead of
   * performance.now(). Used by the repeat engine to compute grid-aligned
   * recording timestamps for boundaries that were missed due to RAF jitter.
   */
  wallClockToMusicalMs(channel: number, wallClockTime: number): number {
    const s = this.channels.get(channel);
    if (!s) return 0;
    if (s.isRecording && !s.sequence) {
      return wallClockTime - s.recordingStartTime + s.recordingLoopOffset;
    }
    if (this._transportState === 'playing') {
      const seq = s.sequence;
      const dur = seq ? seq.duration : this.masterDuration;
      const timelineStart = seq
        ? this.getChannelPlaybackStartTime(s)
        : this.globalStartTime;
      const elapsed = wallClockTime - timelineStart;
      return dur > 0 ? elapsed % dur : elapsed;
    }
    if (s.isRecording) {
      return wallClockTime - s.recordingStartTime;
    }
    return 0;
  }

  /**
   * Returns the absolute performance.now() timestamp of the next grid
   * boundary aligned to the global transport. When the transport is not
   * playing, returns `now` (fire immediately).
   */
  getNextGridTime(intervalMs: number): number {
    const now = performance.now();
    if (this._transportState !== 'playing' || intervalMs <= 0) return now;
    const elapsed = now - this.globalStartTime;
    const nextGrid = Math.ceil(elapsed / intervalMs) * intervalMs;
    return this.globalStartTime + nextGrid;
  }

  /** Returns the BPM from the first channel that has a sequence, or null. */
  getGlobalBPM(): number | null {
    for (const [, s] of this.channels) {
      if (s.sequence) return s.sequence.bpm;
    }
    return null;
  }

  /** Hard reset — useful for hot-reload / dev */
  destroy(): void {
    this.stop();
    this.channels.clear();
    this.transportListeners.clear();
    this.channelSequenceListeners.clear();
    this.automationListeners.clear();
    this.recordingListeners.clear();
    GlobalSequencer._instance = null;
  }

  private getChannelPlaybackStartTime(state: ChannelState): number {
    return state.playbackStartTime > 0
      ? state.playbackStartTime
      : this.globalStartTime;
  }

  private getLaunchQuantizationMs(sequence: LoopSequence | null): number {
    if (sequence && sequence.beatIntervalMs > 0) {
      const beatsPerBar = Math.max(1, sequence.timeSignature[0] ?? 4);
      return Math.max(1, sequence.beatIntervalMs * beatsPerBar);
    }
    const bpm = this.getGlobalBPM();
    if (bpm && bpm > 0) {
      return (60000 / bpm) * 4;
    }
    return DEFAULT_LAUNCH_QUANTIZATION_MS;
  }

  private sortSequenceEvents(sequence: LoopSequence): void {
    // noteOff MUST come before noteOn at the same timestamp — otherwise
    // pairNotes creates zero-length ghost notes when a note ends and
    // restarts at the same grid boundary (repeat mode chords).
    sequence.events = [...sequence.events].sort(
      (a, b) =>
        a.timestamp - b.timestamp ||
        (a.type === 'noteOff' ? -1 : 1),
    );
  }

  private silenceChannel(channel: number, state: ChannelState): void {
    if (state.activeNotes.size === 0) return;
    state.activeNotes.forEach(n => {
      NativeAudioModule.noteOff(channel, n);
      state.delegate.onNoteOff(n);
    });
    state.activeNotes.clear();
  }

  private forceStopChannel(channel: number, state: ChannelState): void {
    this.silenceChannel(channel, state);
    state.clipLaunched = false;
    state.queuedStopTime = null;
    state.eventIndex = 0;
    state.lastLoopTime = -1;
  }

  private forceLaunchChannel(
    channel: number,
    state: ChannelState,
    launchTime: number,
  ): void {
    if (!state.sequence) return;
    this.silenceChannel(channel, state);
    state.clipLaunched = true;
    state.playbackStartTime = launchTime;
    state.queuedLaunchTime = null;
    state.queuedLaunchSequence = null;
    state.queuedStopTime = null;
    state.eventIndex = 0;
    state.lastLoopTime = -1;
  }
}

export default GlobalSequencer;
