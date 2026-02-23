import performance from 'react-native-performance';
import NativeAudioModule from '../../../specs/NativeAudioModule';
import type { LoopSequence, NoteEvent } from '../utils/loopUtils';

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
  // Recording
  isRecording: boolean;
  recordingStartTime: number;
  recordingLoopOffset: number; // where in the active recording timeline we started
  recordingTimelineDuration: number; // seq.duration for overdub, else masterDuration
  recordedEvents: NoteEvent[];
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
      isRecording: false,
      recordingStartTime: 0,
      recordingLoopOffset: 0,
      recordingTimelineDuration: 0,
      recordedEvents: [],
    });
  }

  unregisterChannel(channel: number): void {
    const state = this.channels.get(channel);
    if (!state) return;
    // Silence anything still ringing
    state.activeNotes.forEach(n => NativeAudioModule.noteOff(channel, n));
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

    // Sequence replacement/removal must silence any currently playing notes
    // for this channel, otherwise notes can hang while transport continues.
    if (state.activeNotes.size > 0) {
      state.activeNotes.forEach(n => {
        NativeAudioModule.noteOff(channel, n);
        state.delegate.onNoteOff(n);
      });
      state.activeNotes.clear();
    }

    if (sequence) {
      // Ensure sorted for cursor-based playback.
      // noteOff MUST come before noteOn at the same timestamp — otherwise
      // pairNotes creates zero-length ghost notes when a note ends and
      // restarts at the same grid boundary (repeat mode chords).
      sequence.events = [...sequence.events].sort(
        (a, b) =>
          a.timestamp - b.timestamp ||
          (a.type === 'noteOff' ? -1 : 1),
      );
    }
    state.sequence = sequence;

    // While transport is running, replacing a sequence must NOT replay
    // events that are already in the past for the current loop position.
    if (
      sequence &&
      this._transportState === 'playing' &&
      sequence.duration > 0
    ) {
      const elapsed = performance.now() - this.globalStartTime;
      const loopTime = elapsed % sequence.duration;
      state.lastLoopTime = loopTime;

      let idx = 0;
      while (
        idx < sequence.events.length &&
        sequence.events[idx].timestamp <= loopTime
      ) {
        idx++;
      }
      state.eventIndex = idx;
    } else {
      state.eventIndex = 0;
      state.lastLoopTime = -1;
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

  // ── Recording helpers (per-channel) ──────────────────────────────────────

  startRecording(channel: number): void {
    const s = this.channels.get(channel);
    if (!s) return;
    s.isRecording = true;
    s.recordingStartTime = performance.now();
    s.recordedEvents = [];

    // Capture where in the active timeline we are so recorded events can
    // be placed at the correct loop-relative position when recording stops.
    if (this._transportState === 'playing') {
      const timelineDuration = s.sequence?.duration ?? this.masterDuration;
      const elapsed = performance.now() - this.globalStartTime;
      s.recordingTimelineDuration = timelineDuration > 0 ? timelineDuration : 0;
      s.recordingLoopOffset =
        timelineDuration > 0 ? elapsed % timelineDuration : 0;
    } else {
      s.recordingTimelineDuration = 0;
      s.recordingLoopOffset = 0;
      // Start the RAF loop so delegates receive onTick during recording
      // even when no sequence is playing yet.
      this.ensureRAF();
    }
  }

  stopRecording(channel: number): NoteEvent[] {
    const s = this.channels.get(channel);
    if (!s) return [];
    s.isRecording = false;
    const offset = s.recordingLoopOffset;
    // Offset events so they're timeline-aligned (sequence timeline for overdub,
    // master timeline for first-take while transport is running).
    const evts = s.recordedEvents.map(e => ({
      ...e,
      timestamp: e.timestamp + offset,
    }));
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
    let ts = rawTs;

    // During playback, explicit timestamps are loop-local musical times.
    // Convert to recording-relative so stopRecording() can re-apply the offset
    // uniformly for both explicit and wall-clock events.
    if (
      timestamp != null &&
      this._transportState === 'playing' &&
      s.recordingTimelineDuration > 0
    ) {
      ts = rawTs - s.recordingLoopOffset;
      if (ts < 0) {
        ts += s.recordingTimelineDuration;
      }
    }

    s.recordedEvents.push({ type, note, timestamp: ts, velocity });
  }

  // ── Transport ────────────────────────────────────────────────────────────

  play(): void {
    if (this._transportState === 'playing') return;
    if (this.masterDuration === 0) return;

    this._transportState = 'playing';

    this.channels.forEach(s => {
      s.eventIndex = 0;
      s.lastLoopTime = -1;
    });

    this.emitTransport();
    this.ensureRAF();
  }

  stop(): void {
    if (this._transportState === 'stopped') return;
    this._transportState = 'stopped';

    // Silence every channel
    this.channels.forEach((s, ch) => {
      s.activeNotes.forEach(n => {
        NativeAudioModule.noteOff(ch, n);
        s.delegate.onNoteOff(n);
      });
      s.activeNotes.clear();
      s.eventIndex = 0;
      s.lastLoopTime = -1;
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
    this.globalStartTime = performance.now();
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
        const seq = s.sequence;

        // ── Recording-only mode (no sequences playing yet) ────────
        if (!isPlaying) {
          if (s.isRecording) {
            // Elapsed time since recording started — drives MidiVisualizer
            const recElapsed = now - s.recordingStartTime;
            s.delegate.onTick(recElapsed, 0);
          }
          return;
        }

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

        const loopTime = elapsed % seq.duration;

        // ── Loop wrap ──────────────────────────────────────────────
        if (loopTime < s.lastLoopTime) {
          s.activeNotes.forEach(n => {
            NativeAudioModule.noteOff(ch, n);
            s.delegate.onNoteOff(n);
          });
          s.activeNotes.clear();
          s.eventIndex = 0;
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
   * which can be up to ~16ms stale.  This eliminates timing discrepancies
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
      const elapsed = performance.now() - this.globalStartTime;
      const dur = seq ? seq.duration : this.masterDuration;
      return dur > 0 ? elapsed % dur : elapsed;
    }
    if (s.isRecording) {
      return performance.now() - s.recordingStartTime;
    }
    return 0;
  }

  /**
   * Returns the absolute performance.now() timestamp of the next grid
   * boundary aligned to the global transport.  When the transport is not
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
    GlobalSequencer._instance = null;
  }
}

export default GlobalSequencer;
