import { getIntervalMs, NoteRepeatMode } from './noteRepeatConfig';

type NoteOnEmitter = (
  note: number,
  velocity: number,
  duration?: number,
) => void;
type NoteOffEmitter = (note: number) => void;

export interface NoteRepeatEngineDeps {
  now: () => number;
  getBpm: () => number;
  getNextGridTime: (intervalMs: number) => number;
  emitNoteOn: NoteOnEmitter;
  emitNoteOff: NoteOffEmitter;
  chordWindowMs: number;
}

export class NoteRepeatEngine {
  private readonly deps: NoteRepeatEngineDeps;
  private mode: NoteRepeatMode = 'off';
  private running = false;

  // Currently held notes (finger down): note -> velocity
  private heldNotes = new Map<number, number>();
  // Pressed during repeat phase but released before next tick.
  private pendingNotes = new Map<number, number>();
  // Currently sounding notes (received noteOn, awaiting noteOff)
  private soundingNotes = new Set<number>();

  // Chord collection timestamp (0 = not collecting)
  private collectStart = 0;
  private intervalMs = 0;
  private nextTrigger = 0;

  constructor(deps: NoteRepeatEngineDeps) {
    this.deps = deps;
  }

  setMode(mode: NoteRepeatMode): void {
    this.mode = mode;
    this.flush();
  }

  getMode(): NoteRepeatMode {
    return this.mode;
  }

  isRunning(): boolean {
    return this.running;
  }

  onPadNoteOn(note: number, velocity: number): void {
    if (this.mode === 'off') {
      this.deps.emitNoteOn(note, velocity);
      return;
    }

    this.heldNotes.set(note, velocity);

    if (!this.running) {
      this.collectStart = this.deps.now();
      this.running = true;
      return;
    }

    // Still in chord collection: note already captured in heldNotes.
    if (this.collectStart > 0) return;

    // Already repeating: guarantee at least one hit on next grid tick.
    this.pendingNotes.set(note, velocity);
  }

  onPadNoteOff(note: number): void {
    if (this.mode === 'off') {
      this.deps.emitNoteOff(note);
      return;
    }

    // Released during collection window: keep as one-shot pending trigger.
    const heldVelocity = this.heldNotes.get(note);
    if (this.collectStart > 0 && heldVelocity != null) {
      this.pendingNotes.set(note, heldVelocity);
    }

    this.heldNotes.delete(note);
  }

  tick(): void {
    if (!this.running) return;

    const now = this.deps.now();

    // Chord collection phase
    if (this.collectStart > 0) {
      if (now - this.collectStart < this.deps.chordWindowMs) {
        return;
      }

      this.collectStart = 0;
      this.intervalMs = getIntervalMs(this.mode, this.deps.getBpm());
      if (this.intervalMs <= 0) {
        this.flush();
        return;
      }

      this.nextTrigger = this.deps.getNextGridTime(this.intervalMs);
      return;
    }

    if (this.intervalMs <= 0) {
      this.flush();
      return;
    }

    if (now < this.nextTrigger) return;

    // 1) Close all currently sounding notes.
    this.soundingNotes.forEach(note => {
      this.deps.emitNoteOff(note);
    });
    this.soundingNotes.clear();

    // 2) Advance through missed boundaries.
    while (this.nextTrigger <= now) {
      this.nextTrigger += this.intervalMs;
    }

    // 3) If no held/pending notes remain, we're done after final noteOff.
    if (this.heldNotes.size === 0 && this.pendingNotes.size === 0) {
      this.running = false;
      return;
    }

    // 4) Trigger held notes + pending one-shots.
    const dur = this.intervalMs;
    this.heldNotes.forEach((velocity, note) => {
      this.deps.emitNoteOn(note, velocity, dur);
      this.soundingNotes.add(note);
    });
    this.pendingNotes.forEach((velocity, note) => {
      if (!this.heldNotes.has(note)) {
        this.deps.emitNoteOn(note, velocity, dur);
        this.soundingNotes.add(note);
      }
    });
    this.pendingNotes.clear();
  }

  flush(): void {
    this.soundingNotes.forEach(note => {
      this.deps.emitNoteOff(note);
    });
    this.soundingNotes.clear();
    this.heldNotes.clear();
    this.pendingNotes.clear();
    this.collectStart = 0;
    this.intervalMs = 0;
    this.nextTrigger = 0;
    this.running = false;
  }

  resetWithoutEmit(): void {
    this.soundingNotes.clear();
    this.heldNotes.clear();
    this.pendingNotes.clear();
    this.collectStart = 0;
    this.intervalMs = 0;
    this.nextTrigger = 0;
    this.running = false;
  }
}
