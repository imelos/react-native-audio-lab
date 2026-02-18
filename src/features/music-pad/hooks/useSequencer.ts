import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Dimensions } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import GlobalSequencer, {
  ChannelDelegate,
  LoopSequence,
  TransportState,
  NoteEvent,
} from './GlobalSequencer';
import { VisualNote } from '../midi-visualiser/MidiVisualiser';
import performance from 'react-native-performance';
import { GridHandle } from '../grid/Grid';
import { pairNotes, QuantizeGrid } from '../utils/loopUtils';

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

  // Keep the delegate's closure references fresh without replacing the object
  //   useEffect(() => {
  //     const d = delegateRef.current;
  //     // The delegate captures gridRef and shared values via closure,
  //     // which are themselves refs/shared-values and always current.
  //     // No update needed — this effect is here as a safety net.
  //     return undefined;
  //   }, [gridRef, currentMusicalMs, playheadX, windowWidth]);

  // ── Register / unregister ────────────────────────────────────────────────
  useEffect(() => {
    sequencer.registerChannel(channel, delegateRef.current);
    // return () => sequencer.unregisterChannel(channel);
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
      createLoopFn: (events: NoteEvent[], name: string) => LoopSequence | null,
    ) => {
      const events = sequencer.stopRecording(channel);
      if (events.length === 0) return;

      const existing = sequencer.getSequence(channel);
      const name = existing
        ? `${existing.name} (take ${Date.now()})`
        : `Ch ${channel} Loop`;

      const loop = createLoopFn(events, name);
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

      // Live visual feedback while recording (before sequence exists)
      const vn: VisualNote = {
        id: ++noteIdRef.current,
        note,
        startTime: performance.now(),
      };
      visualNotesRef.current = [...visualNotesRef.current, vn];
    },
    [channel, sequencer],
  );

  const pushNoteOff = useCallback(
    (note: number) => {
      sequencer.pushRecordEvent(channel, 'noteOff', note, 0);

      // End live visual note
      for (let i = visualNotesRef.current.length - 1; i >= 0; i--) {
        const vn = visualNotesRef.current[i];
        if (vn.note === note && vn.endTime == null) {
          vn.endTime = performance.now();
          break;
        }
      }
    },
    [channel, sequencer],
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
