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
  recordingLoopOffset: number; // where in the master loop recording started
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

    if (sequence) {
      // Ensure sorted for cursor-based playback
      sequence.events = [...sequence.events].sort(
        (a, b) => a.timestamp - b.timestamp,
      );
    }
    state.sequence = sequence;
    state.eventIndex = 0;
    state.lastLoopTime = -1;
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

    // Capture where in the master loop we are so recorded events
    // can be placed at the correct loop-relative position
    if (this._transportState === 'playing' && this.masterDuration > 0) {
      const elapsed = performance.now() - this.globalStartTime;
      s.recordingLoopOffset = elapsed % this.masterDuration;
    } else {
      s.recordingLoopOffset = 0;
    }
  }

  stopRecording(channel: number): NoteEvent[] {
    const s = this.channels.get(channel);
    if (!s) return [];
    s.isRecording = false;
    const offset = s.recordingLoopOffset;
    // Offset events so they're loop-aligned (e.g. if recording started at
    // 2000ms into a 4000ms loop, a note played immediately gets timestamp 2000ms)
    const evts = s.recordedEvents.map(e => ({
      ...e,
      timestamp: e.timestamp + offset,
    }));
    s.recordedEvents = [];
    return evts;
  }

  isChannelRecording(channel: number): boolean {
    return this.channels.get(channel)?.isRecording ?? false;
  }

  /** Called by the Player when the user touches a pad during recording. */
  pushRecordEvent(
    channel: number,
    type: 'noteOn' | 'noteOff',
    note: number,
    velocity = 0.85,
  ): void {
    const s = this.channels.get(channel);
    if (!s?.isRecording) return;
    const ts = performance.now() - s.recordingStartTime;
    s.recordedEvents.push({ type, note, timestamp: ts, velocity });
  }

  // ── Transport ────────────────────────────────────────────────────────────

  play(): void {
    if (this._transportState === 'playing') return;
    if (this.masterDuration === 0) return;

    this._transportState = 'playing';
    this.globalStartTime = performance.now();

    this.channels.forEach(s => {
      s.eventIndex = 0;
      s.lastLoopTime = -1;
    });

    this.emitTransport();
    this.startRAF();
  }

  stop(): void {
    if (this._transportState === 'stopped') return;
    this._transportState = 'stopped';

    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

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

  private startRAF(): void {
    const tick = () => {
      if (this._transportState !== 'playing') return;

      const now = performance.now();
      const elapsed = now - this.globalStartTime;

      this.channels.forEach((s, ch) => {
        const seq = s.sequence;

        // Channels without a sequence still get tick updates so the
        // playhead tracks the global position while recording
        if (!seq) {
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
