import { useRef, useCallback, useEffect } from 'react';
import performance from 'react-native-performance';
import GlobalSequencer from './GlobalSequencer';
import { NoteRepeatEngine } from '../engine/repeat/NoteRepeatEngine';
import {
  NoteRepeatMode,
  NOTE_REPEAT_MODES,
  getIntervalMs,
} from '../engine/repeat/noteRepeatConfig';

export type { NoteRepeatMode };
export { NOTE_REPEAT_MODES, getIntervalMs };

const DEFAULT_BPM = 120;
const CHORD_WINDOW_MS = 10;

interface UseNoteRepeatOptions {
  mode: NoteRepeatMode;
  /** Called to trigger a note. 3rd arg is the predicted visual duration (ms),
   *  4th arg is the wall-clock time of the grid boundary that fired it. */
  onNoteOn: (note: number, velocity: number, duration?: number, boundaryWallClock?: number) => void;
  onNoteOff: (note: number) => void;
}

export function useNoteRepeat({
  mode,
  onNoteOn,
  onNoteOff,
}: UseNoteRepeatOptions) {
  const rafIdRef = useRef<number | null>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const onNoteOnRef = useRef(onNoteOn);
  onNoteOnRef.current = onNoteOn;
  const onNoteOffRef = useRef(onNoteOff);
  onNoteOffRef.current = onNoteOff;

  const getBpm = useCallback(() => {
    return GlobalSequencer.getInstance().getGlobalBPM() ?? DEFAULT_BPM;
  }, []);
  const getBpmRef = useRef(getBpm);
  getBpmRef.current = getBpm;

  const engineRef = useRef<NoteRepeatEngine | null>(null);
  if (!engineRef.current) {
    engineRef.current = new NoteRepeatEngine({
      now: () => performance.now(),
      getBpm: () => getBpmRef.current(),
      getNextGridTime: intervalMs =>
        GlobalSequencer.getInstance().getNextGridTime(intervalMs),
      emitNoteOn: (note, velocity, duration, boundaryWallClock) =>
        onNoteOnRef.current(note, velocity, duration, boundaryWallClock),
      emitNoteOff: note => onNoteOffRef.current(note),
      chordWindowMs: CHORD_WINDOW_MS,
    });
  }

  const stopClock = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
  }, []);

  const tick = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;

    engine.tick();
    if (engine.isRunning()) {
      rafIdRef.current = requestAnimationFrame(tick);
    } else {
      rafIdRef.current = null;
    }
  }, []);

  const ensureClock = useCallback(() => {
    const engine = engineRef.current;
    if (!engine || !engine.isRunning() || rafIdRef.current !== null) return;
    rafIdRef.current = requestAnimationFrame(tick);
  }, [tick]);

  // Mode changes are delegated to the pure engine. This hook only controls
  // the RAF driver for the engine lifecycle.
  useEffect(() => {
    engineRef.current?.setMode(mode);
    stopClock();
  }, [mode, stopClock]);

  useEffect(() => {
    return () => {
      stopClock();
      engineRef.current?.resetWithoutEmit();
    };
  }, [stopClock]);

  const handleNoteOn = useCallback(
    (note: number, velocity: number) => {
      const engine = engineRef.current;
      if (!engine) return;
      engine.onPadNoteOn(note, velocity);
      ensureClock();
    },
    [ensureClock],
  );

  const handleNoteOff = useCallback((note: number) => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.onPadNoteOff(note);
  }, []);

  const getActiveBpm = useCallback((): number | null => {
    if (modeRef.current === 'off') return null;
    return getBpmRef.current();
  }, []);

  const flushRepeat = useCallback(() => {
    engineRef.current?.flush();
    stopClock();
  }, [stopClock]);

  return { handleNoteOn, handleNoteOff, getActiveBpm, flushRepeat };
}
