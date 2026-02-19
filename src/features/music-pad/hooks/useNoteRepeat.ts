import { useRef, useCallback, useEffect } from 'react';
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
  onNoteOn: (note: number, velocity: number) => void;
  onNoteOff: (note: number) => void;
}

/**
 * Ableton Note–style note repeat with a single shared grid clock.
 *
 * - First pad press (when clock is idle) plays immediately and starts the
 *   grid clock.
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
  // Notes that are currently sounding (have received noteOn, awaiting noteOff)
  const soundingNotesRef = useRef<Set<number>>(new Set());
  // The single shared grid clock
  const clockIdRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const modeRef = useRef(mode);
  modeRef.current = mode;

  const onNoteOnRef = useRef(onNoteOn);
  onNoteOnRef.current = onNoteOn;
  const onNoteOffRef = useRef(onNoteOff);
  onNoteOffRef.current = onNoteOff;

  const getBpm = useCallback(() => {
    return GlobalSequencer.getInstance().getGlobalBPM() ?? DEFAULT_BPM;
  }, []);

  // ── Clock management ───────────────────────────────────────────────────

  const stopClock = useCallback(() => {
    if (clockIdRef.current !== null) {
      clearInterval(clockIdRef.current);
      clockIdRef.current = null;
    }
  }, []);

  const startClock = useCallback(() => {
    const bpm = getBpm();
    const intervalMs = getIntervalMs(modeRef.current, bpm);
    if (intervalMs <= 0) return;

    clockIdRef.current = setInterval(() => {
      // 1. NoteOff ALL currently sounding notes (completes their full duration)
      soundingNotesRef.current.forEach(note => {
        onNoteOffRef.current(note);
      });
      soundingNotesRef.current.clear();

      // 2. If no fingers are held, we just sent the final noteOffs — done
      if (heldNotesRef.current.size === 0) {
        stopClock();
        return;
      }

      // 3. Re-trigger ALL held notes together on this grid tick
      heldNotesRef.current.forEach((velocity, note) => {
        onNoteOnRef.current(note, velocity);
        soundingNotesRef.current.add(note);
      });
    }, intervalMs);
  }, [stopClock, getBpm]);

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

      // Only play immediately + start clock if the clock is NOT running.
      // If the clock IS running (even if heldNotes was momentarily empty
      // between a release and a new press), the note waits for the next tick.
      if (clockIdRef.current === null) {
        onNoteOnRef.current(note, velocity);
        soundingNotesRef.current.add(note);
        startClock();
      }
      // Otherwise: queued — will fire on the next grid tick with all other
      // held notes.
    },
    [startClock],
  );

  const handleNoteOff = useCallback(
    (note: number) => {
      if (modeRef.current === 'off') {
        onNoteOffRef.current(note);
        return;
      }

      // Remove from held — the note keeps sounding until the next grid tick
      // where the clock sends a proper noteOff (full grid-division duration).
      // Do NOT call onNoteOff or stop the clock here.
      heldNotesRef.current.delete(note);
    },
    [],
  );

  return { handleNoteOn, handleNoteOff };
}
