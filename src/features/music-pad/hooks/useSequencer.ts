import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Dimensions } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import GlobalSequencer, {
  ChannelDelegate,
  TransportState,
} from './GlobalSequencer';
import { VisualNote } from '../midi-visualiser/MidiVisualiser';
import { GridHandle } from '../grid/Grid';
import {
  pairNotes,
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

export function useSequencer({ channel, gridRef }: UseSequencerOptions) {
  const sequencer = useMemo(() => GlobalSequencer.getInstance(), []);

  // ── Shared values for the visualizer (driven from RAF, no re-renders) ──
  const playheadX = useSharedValue(0);
  const currentMusicalMs = useSharedValue(0);
  const windowWidth = Dimensions.get('window').width;

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
      if (loopDuration > 0) {
        playheadX.value = (loopTimeMs / loopDuration) * windowWidth;
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
    setIsRecording(true);
  }, [channel, sequencer]);

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
    ) => {
      const events = sequencer.stopRecording(channel);
      if (events.length === 0) return;

      const existing = sequencer.getSequence(channel);
      const name = existing
        ? `${existing.name} (take ${Date.now()})`
        : `Ch ${channel} Loop`;

      // Use global BPM and master duration so all channels stay in sync
      const globalBPM = sequencer.getGlobalBPM();
      const masterDuration = sequencer.getMasterDuration();
      const loop = createLoopFn(
        events,
        name,
        globalBPM ?? undefined,
        masterDuration > 0 ? masterDuration : undefined,
      );
      if (!loop) return;

      sequencer.setSequence(channel, loop);
      setIsRecording(false);

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
      let startTime = currentMusicalMs.value;

      if (duration != null) {
        // Repeat mode: snap to the previous endTime for the SAME pitch so
        // notes are perfectly back-to-back without RAF-jitter micro-gaps.
        for (let i = arr.length - 1; i >= 0; i--) {
          if (arr[i].note === note && arr[i].endTime != null) {
            startTime = arr[i].endTime!;
            break;
          }
        }
      }

      // Pass the snapped startTime to the recording so committed sequences
      // are grid-aligned (no wall-clock RAF jitter).
      sequencer.pushRecordEvent(
        channel,
        'noteOn',
        note,
        velocity,
        duration != null ? startTime : undefined,
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
    [channel, sequencer, currentMusicalMs, visualNotes],
  );

  const pushNoteOff = useCallback(
    (note: number) => {
      const endTime = currentMusicalMs.value;
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
        snappedEnd,
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
    [channel, sequencer, currentMusicalMs, visualNotes],
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
