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
const GATE = 1.0; // note plays for 80% of the interval, silent for 20%

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
// Internal types
// ─────────────────────────────────────────────────────────────────────────────

interface NoteTimer {
  intervalId: ReturnType<typeof setInterval>;
  gateTimeoutId: ReturnType<typeof setTimeout> | null;
}

interface UseNoteRepeatOptions {
  mode: NoteRepeatMode;
  onNoteOn: (note: number, velocity: number) => void;
  onNoteOff: (note: number) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Wraps noteOn/noteOff handlers to add Ableton Note–style note repeat.
 *
 * When mode !== 'off', holding a pad re-triggers the note at the selected
 * grid division (BPM-aware). Each repeat uses an 80 % gate so the ADSR
 * envelope re-attacks cleanly.
 */
export function useNoteRepeat({
  mode,
  onNoteOn,
  onNoteOff,
}: UseNoteRepeatOptions) {
  const timersRef = useRef<Map<number, NoteTimer>>(new Map());
  const modeRef = useRef(mode);
  modeRef.current = mode;

  // Keep stable refs to the latest callbacks so timers always call current fns
  const onNoteOnRef = useRef(onNoteOn);
  onNoteOnRef.current = onNoteOn;
  const onNoteOffRef = useRef(onNoteOff);
  onNoteOffRef.current = onNoteOff;

  const getBpm = useCallback(() => {
    return GlobalSequencer.getInstance().getGlobalBPM() ?? DEFAULT_BPM;
  }, []);

  // ── Timer management ────────────────────────────────────────────────────

  const clearNoteTimer = useCallback((note: number) => {
    const timer = timersRef.current.get(note);
    if (!timer) return;
    clearInterval(timer.intervalId);
    if (timer.gateTimeoutId) clearTimeout(timer.gateTimeoutId);
    timersRef.current.delete(note);
  }, []);

  const clearAllTimers = useCallback(() => {
    timersRef.current.forEach(timer => {
      clearInterval(timer.intervalId);
      if (timer.gateTimeoutId) clearTimeout(timer.gateTimeoutId);
    });
    timersRef.current.clear();
  }, []);

  // When mode changes, kill all running timers.
  // User must release and re-press pads for the new division.
  useEffect(() => {
    clearAllTimers();
  }, [mode, clearAllTimers]);

  // Cleanup on unmount
  useEffect(() => {
    return () => clearAllTimers();
  }, [clearAllTimers]);

  // ── Wrapped handlers ───────────────────────────────────────────────────

  const handleNoteOn = useCallback(
    (note: number, velocity: number) => {
      // Always fire the initial note immediately
      onNoteOnRef.current(note, velocity);

      if (modeRef.current === 'off') return;

      // Tear down any existing timer for this note (e.g. rapid re-press)
      clearNoteTimer(note);

      const bpm = getBpm();
      const intervalMs = getIntervalMs(modeRef.current, bpm);
      if (intervalMs <= 0) return;

      const gateMs = intervalMs * GATE;

      // Gate-off for the initial note
      const initialGateTimeout = setTimeout(() => {
        onNoteOffRef.current(note);
      }, gateMs);

      // Repeating re-trigger
      const intervalId = setInterval(() => {
        onNoteOnRef.current(note, velocity);

        const gateTimeout = setTimeout(() => {
          onNoteOffRef.current(note);
        }, gateMs);

        const timer = timersRef.current.get(note);
        if (timer) timer.gateTimeoutId = gateTimeout;
      }, intervalMs);

      timersRef.current.set(note, {
        intervalId,
        gateTimeoutId: initialGateTimeout,
      });
    },
    [clearNoteTimer, getBpm],
  );

  const handleNoteOff = useCallback(
    (note: number) => {
      if (modeRef.current === 'off') {
        onNoteOffRef.current(note);
        return;
      }

      // Stop repeating and silence
      clearNoteTimer(note);
      onNoteOffRef.current(note);
    },
    [clearNoteTimer],
  );

  return { handleNoteOn, handleNoteOff };
}
