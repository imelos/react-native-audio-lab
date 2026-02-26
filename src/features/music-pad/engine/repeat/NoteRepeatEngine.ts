import { getIntervalMs, NoteRepeatMode } from './noteRepeatConfig';

type NoteOnEmitter = (
  note: number,
  velocity: number,
  duration?: number,
  /** Wall-clock time (performance.now() domain) of the grid boundary that
   *  triggered this note. Lets the recording layer compute the exact musical
   *  timestamp even when the RAF frame was late. */
  boundaryWallClock?: number,
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

    const dur = this.intervalMs;

    // Fire notes for every due boundary, including any that were missed because
    // the JS thread was busy and the RAF frame arrived late. Each boundary gets
    // its own noteOff/noteOn pair so the recording captures all grid positions.
    while (this.nextTrigger <= now) {
      const boundaryWallClock = this.nextTrigger;

      // Close notes sounding from the previous boundary.
      if (this.soundingNotes.size > 0) {
        this.soundingNotes.forEach(note => {
          this.deps.emitNoteOff(note);
        });
        this.soundingNotes.clear();
      }

      // If no notes remain after the final noteOff, stop.
      if (this.heldNotes.size === 0 && this.pendingNotes.size === 0) {
        this.running = false;
        return;
      }

      // Trigger held notes + pending one-shots for this boundary.
      this.heldNotes.forEach((velocity, note) => {
        this.deps.emitNoteOn(note, velocity, dur, boundaryWallClock);
        this.soundingNotes.add(note);
      });
      this.pendingNotes.forEach((velocity, note) => {
        if (!this.heldNotes.has(note)) {
          this.deps.emitNoteOn(note, velocity, dur, boundaryWallClock);
          this.soundingNotes.add(note);
        }
      });
      this.pendingNotes.clear();

      this.nextTrigger += this.intervalMs;
    }
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
