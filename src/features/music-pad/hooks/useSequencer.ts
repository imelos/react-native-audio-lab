import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Dimensions } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import GlobalSequencer, {
  ChannelDelegate,
  TransportState,
} from './GlobalSequencer';
import { VisualNote } from '../midi-visualiser/MidiVisualiser';
import performance from 'react-native-performance';
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

  // ── Visual notes ref (mutated from RAF, read by MidiVisualizer) ────────
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
      playheadX.value = (loopTimeMs / loopDuration) * windowWidth;
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

  // ── Subscribe to sequence changes for this channel ───────────────────────
  useEffect(() => {
    return sequencer.onChannelSequence((ch, seq) => {
      if (ch === channel) setSequence(seq);
    });
  }, [channel, sequencer]);

  // ── Actions exposed to the Player component ──────────────────────────────

  const startRecording = useCallback(() => {
    sequencer.startRecording(channel);
    setIsRecording(true);
  }, [channel, sequencer]);

  const clearRecording = useCallback(() => {
    sequencer.stopRecording(channel); // discard events
    setIsRecording(false);
  }, [channel, sequencer]);

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
    [channel, sequencer],
  );

  const deleteSequence = useCallback(() => {
    sequencer.setSequence(channel, null);
    visualNotesRef.current = [];
    // If nothing left to play, stop
    if (!sequencer.hasAnySequence()) {
      sequencer.stop();
    }
  }, [channel, sequencer]);

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
    [channel, sequencer],
  );

  // ── Recording event push (called by Player on pad touch) ─────────────────

  const pushNoteOn = useCallback(
    (note: number, velocity: number) => {
      sequencer.pushRecordEvent(channel, 'noteOn', note, velocity);

      // Use loop-relative time when master loop is playing (overdub),
      // so visual notes appear at the playhead position, not from the left
      const masterPlaying =
        sequencer.transportState === 'playing' &&
        sequencer.getMasterDuration() > 0;
      const startTime = masterPlaying
        ? currentMusicalMs.value
        : performance.now();

      const vn: VisualNote = {
        id: ++noteIdRef.current,
        note,
        startTime,
      };
      visualNotesRef.current = [...visualNotesRef.current, vn];
    },
    [channel, sequencer, currentMusicalMs],
  );

  const pushNoteOff = useCallback(
    (note: number) => {
      sequencer.pushRecordEvent(channel, 'noteOff', note, 0);

      const masterPlaying =
        sequencer.transportState === 'playing' &&
        sequencer.getMasterDuration() > 0;
      const endTime = masterPlaying
        ? currentMusicalMs.value
        : performance.now();

      // End live visual note
      for (let i = visualNotesRef.current.length - 1; i >= 0; i--) {
        const vn = visualNotesRef.current[i];
        if (vn.note === note && vn.endTime == null) {
          vn.endTime = endTime;
          break;
        }
      }
    },
    [channel, sequencer, currentMusicalMs],
  );

  // ── Internal helpers ─────────────────────────────────────────────────────

  function rebuildVisualNotes(loop: LoopSequence) {
    const pairs = pairNotes(loop.events);
    visualNotesRef.current = pairs.map(p => ({
      id: ++noteIdRef.current,
      note: p.note,
      startTime: p.start,
      endTime: p.end,
    }));
  }

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
    visualNotesRef,
    masterDuration: sequencer.getMasterDuration(),

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
