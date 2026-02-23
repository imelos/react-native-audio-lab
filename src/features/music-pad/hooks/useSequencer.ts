import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import GlobalSequencer, {
  ChannelDelegate,
  TransportState,
} from './GlobalSequencer';
import { VisualNote } from '../midi-visualiser/MidiVisualiser';
import { GridHandle } from '../grid/Grid';
import {
  NotePair,
  pairNotes,
  pairsToEvents,
  QuantizeGrid,
  LoopSequence,
  NoteEvent,
} from '../utils/loopUtils';

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

interface UseSequencerOptions {
  channel: number;
  gridRef: React.RefObject<GridHandle | null>;
}

function wrapTimeToDuration(timeMs: number, durationMs: number): number {
  const wrapped = timeMs % durationMs;
  return wrapped < 0 ? wrapped + durationMs : wrapped;
}

function deduplicateOverlaps(pairs: NotePair[]): NotePair[] {
  const byNote = new Map<number, NotePair[]>();
  for (let i = 0; i < pairs.length; i++) {
    const p = pairs[i];
    const arr = byNote.get(p.note) ?? [];
    arr.push(p);
    byNote.set(p.note, arr);
  }

  const out: NotePair[] = [];
  byNote.forEach(notePairs => {
    notePairs.sort((a, b) => a.start - b.start);
    for (let i = 0; i < notePairs.length; i++) {
      const current = notePairs[i];
      const last = out.length > 0 ? out[out.length - 1] : undefined;
      if (last && last.note === current.note && current.start < last.end - 1) {
        last.end = Math.max(last.end, current.end);
        last.velocity = Math.max(last.velocity, current.velocity);
      } else {
        out.push({ ...current });
      }
    }
  });

  return out.sort((a, b) => a.start - b.start);
}

function mergeOverdubIntoSequence(
  base: LoopSequence,
  overdubEvents: NoteEvent[],
): LoopSequence {
  if (overdubEvents.length === 0 || base.duration <= 0) {
    return base;
  }

  const durationMs = base.duration;
  const sortedOverdub = [...overdubEvents].sort(
    (a, b) => a.timestamp - b.timestamp || (a.type === 'noteOff' ? -1 : 1),
  );
  const overdubPairs = pairNotes(sortedOverdub);
  if (overdubPairs.length === 0) {
    return base;
  }

  const wrappedOverdubPairs: NotePair[] = [];
  for (let i = 0; i < overdubPairs.length; i++) {
    const p = overdubPairs[i];
    const rawDuration = Math.max(0, p.end - p.start);
    if (rawDuration <= 0) continue;

    if (rawDuration >= durationMs) {
      wrappedOverdubPairs.push({
        note: p.note,
        velocity: p.velocity,
        start: 0,
        end: durationMs,
      });
      continue;
    }

    const start = wrapTimeToDuration(p.start, durationMs);
    const end = start + rawDuration;

    if (end <= durationMs) {
      wrappedOverdubPairs.push({
        note: p.note,
        velocity: p.velocity,
        start,
        end,
      });
      continue;
    }

    wrappedOverdubPairs.push({
      note: p.note,
      velocity: p.velocity,
      start,
      end: durationMs,
    });
    wrappedOverdubPairs.push({
      note: p.note,
      velocity: p.velocity,
      start: 0,
      end: end - durationMs,
    });
  }

  if (wrappedOverdubPairs.length === 0) {
    return base;
  }

  const mergedPairs = deduplicateOverlaps([
    ...pairNotes(base.events),
    ...wrappedOverdubPairs,
  ]);

  return {
    ...base,
    events: pairsToEvents(mergedPairs),
  };
}

export function useSequencer({ channel, gridRef }: UseSequencerOptions) {
  const sequencer = useMemo(() => GlobalSequencer.getInstance(), []);

  // ── Shared values for the visualizer (driven from RAF, no re-renders) ──
  const playheadX = useSharedValue(0);
  const currentMusicalMs = useSharedValue(0);
  const { width: windowWidth } = useWindowDimensions();
  const windowWidthRef = useRef(windowWidth);
  windowWidthRef.current = windowWidth;

  // ── Visual notes (SharedValue — drives MidiVisualizer reactively) ─────
  const visualNotes = useSharedValue<VisualNote[]>([]);
  // Plain JS ref mirrors visualNotes for immediate same-frame reads.
  // SharedValue .value reads can return stale data within the same JS frame,
  // which causes lost notes when multiple pushNoteOn calls happen in one tick
  // (e.g. chord re-triggers in repeat mode).
  const visualNotesRef = useRef<VisualNote[]>([]);
  const noteIdRef = useRef(0);

  // ── React state (only for UI that genuinely needs re-render) ───────────
  const [transportState, setTransportState] = useState<TransportState>(
    sequencer.transportState,
  );
  const [sequence, setSequence] = useState<LoopSequence | null>(
    sequencer.getSequence(channel),
  );
  const [isRecording, setIsRecording] = useState(false);
  const [masterDuration, setMasterDuration] = useState(
    sequencer.getMasterDuration(),
  );

  // ── Build the delegate (stable ref, mutated only internally) ───────────
  const delegateRef = useRef<ChannelDelegate>({
    onNoteOn(note: number, _velocity: number) {
      gridRef.current?.setPadActive(note, true);
    },

    onNoteOff(note: number) {
      gridRef.current?.setPadActive(note, false);
    },

    onTick(loopTimeMs: number, loopDuration: number) {
      currentMusicalMs.value = loopTimeMs;
      const width = windowWidthRef.current;
      if (loopDuration > 0 && width > 0) {
        playheadX.value = (loopTimeMs / loopDuration) * width;
      } else {
        playheadX.value = 0;
      }
    },

    onLoopWrap() {},
  });

  // ── Register / detach ───────────────────────────────────────────────────
  useEffect(() => {
    sequencer.registerChannel(channel, delegateRef.current);
    return () => sequencer.detachDelegate(channel);
  }, [channel, sequencer]);

  // ── Subscribe to transport changes ───────────────────────────────────────
  useEffect(() => {
    return sequencer.onTransport(state => setTransportState(state));
  }, [sequencer]);

  // ── Subscribe to sequence changes ───────────────────────────────────────
  useEffect(() => {
    return sequencer.onChannelSequence((ch, seq) => {
      if (ch === channel) setSequence(seq);
      // Keep masterDuration reactive — it changes when ANY channel's sequence changes
      setMasterDuration(sequencer.getMasterDuration());
    });
  }, [channel, sequencer]);

  // ── Internal helpers ─────────────────────────────────────────────────────

  const rebuildVisualNotes = useCallback(
    (loop: LoopSequence) => {
      const pairs = pairNotes(loop.events);
      const arr = pairs.map(p => ({
        id: ++noteIdRef.current,
        note: p.note,
        startTime: p.start,
        endTime: p.end,
      }));
      visualNotesRef.current = arr;
      visualNotes.value = arr;
    },
    [visualNotes],
  );

  // ── Actions exposed to the Player component ──────────────────────────────

  const startRecording = useCallback(() => {
    sequencer.startRecording(channel);
    // visualNotes now represent only the current recording pass (live overlay).
    visualNotesRef.current = [];
    visualNotes.value = [];
    setIsRecording(true);
  }, [channel, sequencer, visualNotes]);

  const clearRecording = useCallback(() => {
    sequencer.stopRecording(channel); // discard events
    setIsRecording(false);
    visualNotesRef.current = [];
    visualNotes.value = [];
  }, [channel, sequencer, visualNotes]);

  /**
   * Finalize a recording into a LoopSequence and assign it.
   * `createLoopSequence` is your existing function (import it).
   */
  const commitRecording = useCallback(
    (
      createLoopFn: (
        events: NoteEvent[],
        name: string,
        referenceBPM?: number,
        minDurationMs?: number,
      ) => LoopSequence | null,
      overrideBPM?: number,
    ) => {
      const events = sequencer.stopRecording(channel);
      setIsRecording(false);
      if (events.length === 0) return;

      const existing = sequencer.getSequence(channel);
      if (existing) {
        const merged = mergeOverdubIntoSequence(existing, events);
        sequencer.setSequence(channel, merged);
        rebuildVisualNotes(merged);
        return;
      }

      const name = `Ch ${channel} Loop`;

      // For first take on an empty channel:
      // keep global BPM (if present), but do not force current master duration.
      // This allows new channels to create longer clips when desired.
      const globalBPM = sequencer.getGlobalBPM();
      const loop = createLoopFn(
        events,
        name,
        overrideBPM ?? globalBPM ?? undefined,
        undefined,
      );
      if (!loop) return;

      sequencer.setSequence(channel, loop);

      // Build visual notes from the new sequence
      rebuildVisualNotes(loop);

      // Auto-play if not already
      if (sequencer.transportState !== 'playing') {
        sequencer.play();
      }
    },
    [channel, sequencer, rebuildVisualNotes],
  );

  const deleteSequence = useCallback(() => {
    sequencer.setSequence(channel, null);
    visualNotesRef.current = [];
    visualNotes.value = [];
    // If nothing left to play, stop
    if (!sequencer.hasAnySequence()) {
      sequencer.stop();
    }
  }, [channel, sequencer, visualNotes]);

  const quantize = useCallback(
    (
      quantizeFn: (
        events: NoteEvent[],
        beatMs: number,
        grid: QuantizeGrid,
        strength: number,
      ) => NoteEvent[],
    ) => {
      const seq = sequencer.getSequence(channel);
      if (!seq) return;

      const quantized = quantizeFn(
        seq.events,
        seq.beatIntervalMs,
        '1/16',
        0.75,
      );

      const updated: LoopSequence = { ...seq, events: quantized };
      sequencer.setSequence(channel, updated);
      rebuildVisualNotes(updated);
    },
    [channel, sequencer, rebuildVisualNotes],
  );

  // ── Recording event push (called by Player on pad touch) ─────────────────

  const pushNoteOn = useCallback(
    (note: number, velocity: number, duration?: number) => {
      const arr = visualNotesRef.current;
      // Use fresh performance.now()-based time instead of the stale
      // SharedValue (~16ms behind). This ensures all notes triggered in
      // the same synchronous tick get the same startTime, fixing chord
      // alignment permanently.
      let startTime = sequencer.getCurrentMusicalMs(channel);

      if (duration != null) {
        // Repeat mode: snap to previous endTime for the SAME pitch so notes
        // chain perfectly back-to-back without micro-overlap.
        let previousEnd: number | undefined;
        for (let i = arr.length - 1; i >= 0; i--) {
          if (arr[i].note === note && arr[i].endTime != null) {
            previousEnd = arr[i].endTime!;
            break;
          }
        }

        if (previousEnd != null) {
          const delta = startTime - previousEnd;
          const tolerance = duration * 0.5;
          const startsBeforePreviousEnd =
            delta < 0 && Math.abs(delta) < duration;
          if (
            Math.abs(delta) < tolerance ||
            startsBeforePreviousEnd
          ) {
            startTime = previousEnd;
          }
        } else if (duration > 0) {
          // First hit has no previous end to chain from: snap to NEAREST grid
          // (not floor) to avoid pushing consecutive hits into the same bucket.
          startTime = Math.round(startTime / duration) * duration;
        }
      }

      // Pass the snapped startTime to the recording so committed sequences
      // are grid-aligned (no wall-clock RAF jitter).
      const useExplicitTimestamp =
        duration != null && sequencer.transportState !== 'playing';
      sequencer.pushRecordEvent(
        channel,
        'noteOn',
        note,
        velocity,
        useExplicitTimestamp ? startTime : undefined,
      );

      const vn: VisualNote = {
        id: ++noteIdRef.current,
        note,
        startTime,
        endTime: duration != null ? startTime + duration : undefined,
      };
      const updated = [...arr, vn];
      visualNotesRef.current = updated;
      visualNotes.value = updated;
    },
    [channel, sequencer, visualNotes],
  );

  const pushNoteOff = useCallback(
    (note: number) => {
      const endTime = sequencer.getCurrentMusicalMs(channel);
      const arr = visualNotesRef.current;

      // Find the latest note for this pitch to get its predicted endTime
      // (repeat mode) for grid-aligned recording.
      let snappedEnd: number | undefined;
      for (let i = arr.length - 1; i >= 0; i--) {
        if (arr[i].note === note) {
          if (arr[i].endTime != null) {
            snappedEnd = arr[i].endTime!;
          }
          break;
        }
      }

      sequencer.pushRecordEvent(
        channel,
        'noteOff',
        note,
        0,
        sequencer.transportState !== 'playing' ? snappedEnd : undefined,
      );

      // Close the visual note (only needed for non-repeat mode where
      // endTime is not predicted).
      for (let i = arr.length - 1; i >= 0; i--) {
        if (arr[i].note === note && arr[i].endTime == null) {
          const updated = [...arr];
          updated[i] = { ...arr[i], endTime };
          visualNotesRef.current = updated;
          visualNotes.value = updated;
          return;
        }
      }
    },
    [channel, sequencer, visualNotes],
  );

  // ── Return ───────────────────────────────────────────────────────────────

  return {
    // State
    transportState,
    sequence,
    isRecording,
    isPlaying: transportState === 'playing',

    // Shared values (for Reanimated-driven UI)
    playheadX,
    currentMusicalMs,
    visualNotes,
    masterDuration,

    // Global transport (any Player can trigger these)
    play: () => sequencer.play(),
    stop: () => sequencer.stop(),
    togglePlayback: () => sequencer.togglePlayback(),

    // Per-channel actions
    startRecording,
    clearRecording,
    commitRecording,
    deleteSequence,
    quantize,

    // Recording event helpers
    pushNoteOn,
    pushNoteOff,
  };
}
