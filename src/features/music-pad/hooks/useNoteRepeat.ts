import { useRef, useCallback, useEffect } from 'react';
import performance from 'react-native-performance';
import GlobalSequencer from './GlobalSequencer';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type NoteRepeatMode =
  | 'off'
  | '1/4'
  | '1/4T'
  | '1/8'
  | '1/8T'
  | '1/16'
  | '1/16T'
  | '1/32'
  | '1/32T';

export const NOTE_REPEAT_MODES: NoteRepeatMode[] = [
  '1/4',
  '1/4T',
  '1/8',
  '1/8T',
  '1/16',
  '1/16T',
  '1/32',
  '1/32T',
  'off',
];

const DEFAULT_BPM = 120;

// ─────────────────────────────────────────────────────────────────────────────
// Interval calculation
// ─────────────────────────────────────────────────────────────────────────────

export function getIntervalMs(mode: NoteRepeatMode, bpm: number): number {
  if (mode === 'off') return 0;
  const beatMs = 60000 / bpm;
  switch (mode) {
    case '1/4':
      return beatMs;
    case '1/4T':
      return (beatMs * 2) / 3;
    case '1/8':
      return beatMs / 2;
    case '1/8T':
      return beatMs / 3;
    case '1/16':
      return beatMs / 4;
    case '1/16T':
      return beatMs / 6;
    case '1/32':
      return beatMs / 8;
    case '1/32T':
      return beatMs / 12;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

interface UseNoteRepeatOptions {
  mode: NoteRepeatMode;
  /** Called to trigger a note. 3rd arg is the predicted visual duration (ms). */
  onNoteOn: (note: number, velocity: number, duration?: number) => void;
  onNoteOff: (note: number) => void;
}

/**
 * Ableton Note–style note repeat driven by requestAnimationFrame with
 * additive timestamps (zero drift).
 *
 * - First pad press (when clock is idle) plays immediately and starts the
 *   RAF clock.
 * - Any pad pressed while the clock is already running is queued and only
 *   fires on the NEXT grid tick — all held notes re-trigger together.
 * - Releasing a pad does NOT cut the note short. It sustains until the next
 *   grid tick where it receives a proper noteOff (full grid-division length).
 * - After the last pad is released the clock runs one final tick to close
 *   all sounding notes, then stops.
 */
export function useNoteRepeat({
  mode,
  onNoteOn,
  onNoteOff,
}: UseNoteRepeatOptions) {
  // Currently held notes (finger down): note → velocity
  const heldNotesRef = useRef<Map<number, number>>(new Map());
  // Notes currently sounding (received noteOn, awaiting noteOff)
  const soundingNotesRef = useRef<Set<number>>(new Set());
  // RAF handle (non-null while the clock is running)
  const rafIdRef = useRef<number | null>(null);
  // Next grid boundary (absolute performance.now timestamp)
  const nextTriggerRef = useRef(0);
  // Cached interval
  const intervalMsRef = useRef(0);

  const modeRef = useRef(mode);
  modeRef.current = mode;

  const onNoteOnRef = useRef(onNoteOn);
  onNoteOnRef.current = onNoteOn;
  const onNoteOffRef = useRef(onNoteOff);
  onNoteOffRef.current = onNoteOff;

  const getBpm = useCallback(() => {
    return GlobalSequencer.getInstance().getGlobalBPM() ?? DEFAULT_BPM;
  }, []);

  // ── RAF clock ──────────────────────────────────────────────────────────

  const stopClock = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
  }, []);

  /** Single RAF tick — checks if we've crossed a grid boundary. */
  const tick = useCallback(() => {
    const now = performance.now();

    if (now >= nextTriggerRef.current) {
      // ── Grid boundary crossed ────────────────────────────────────────

      // 1. NoteOff all sounding notes (completes their full duration)
      soundingNotesRef.current.forEach(note => {
        onNoteOffRef.current(note);
      });
      soundingNotesRef.current.clear();

      // Advance past any missed boundaries (e.g. if a frame took too long)
      while (nextTriggerRef.current <= now) {
        nextTriggerRef.current += intervalMsRef.current;
      }

      // 2. If no fingers are held, we just sent the final noteOffs — done
      if (heldNotesRef.current.size === 0) {
        rafIdRef.current = null;
        return;
      }

      // 3. Re-trigger all held notes together on this grid tick
      const dur = intervalMsRef.current;
      heldNotesRef.current.forEach((velocity, note) => {
        onNoteOnRef.current(note, velocity, dur);
        soundingNotesRef.current.add(note);
      });
    }

    // Schedule next check
    rafIdRef.current = requestAnimationFrame(tick);
  }, []);

  const startClock = useCallback(() => {
    const intervalMs = intervalMsRef.current;
    if (intervalMs <= 0) return;

    nextTriggerRef.current = performance.now() + intervalMs;
    rafIdRef.current = requestAnimationFrame(tick);
  }, [tick]);

  // ── Lifecycle ──────────────────────────────────────────────────────────

  // When mode changes, stop clock and silence everything cleanly
  useEffect(() => {
    soundingNotesRef.current.forEach(note => {
      onNoteOffRef.current(note);
    });
    soundingNotesRef.current.clear();
    heldNotesRef.current.clear();
    stopClock();
  }, [mode, stopClock]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopClock();
      heldNotesRef.current.clear();
      soundingNotesRef.current.clear();
    };
  }, [stopClock]);

  // ── Wrapped handlers ───────────────────────────────────────────────────

  const handleNoteOn = useCallback(
    (note: number, velocity: number) => {
      if (modeRef.current === 'off') {
        onNoteOnRef.current(note, velocity);
        return;
      }

      heldNotesRef.current.set(note, velocity);

      const clockRunning = rafIdRef.current !== null;

      if (!clockRunning) {
        // First note — compute interval, play immediately, start clock
        const bpm = getBpm();
        const intervalMs = getIntervalMs(modeRef.current, bpm);
        intervalMsRef.current = intervalMs;

        onNoteOnRef.current(
          note,
          velocity,
          intervalMs > 0 ? intervalMs : undefined,
        );
        soundingNotesRef.current.add(note);
        startClock();
      } else {
        // Clock already running — play immediately with duration trimmed
        // to the next grid boundary (like Ableton Note: initial trigger is
        // always instant, only repeats are grid-aligned).
        const remaining = nextTriggerRef.current - performance.now();
        const dur =
          remaining > 0 ? remaining : intervalMsRef.current;

        onNoteOnRef.current(note, velocity, dur);
        soundingNotesRef.current.add(note);
      }
    },
    [startClock, getBpm],
  );

  const handleNoteOff = useCallback(
    (note: number) => {
      if (modeRef.current === 'off') {
        onNoteOffRef.current(note);
        return;
      }

      // Remove from held — note sustains until the next grid tick.
      heldNotesRef.current.delete(note);
    },
    [],
  );

  return { handleNoteOn, handleNoteOff };
}
