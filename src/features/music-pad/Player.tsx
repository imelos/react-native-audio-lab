import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import NativeAudioModule from '../../specs/NativeAudioModule';
import { MidiVisualizer, VisualNote } from './midi-visualiser/MidiVisualiser';
import Grid, { GridHandle } from './grid/Grid';
import performance from 'react-native-performance';

// --- Type definitions ---
interface NoteEvent {
  type: 'noteOn' | 'noteOff';
  note: number;
  timestamp: number;
  velocity: number;
}

interface LoopSequence {
  events: NoteEvent[];
  duration: number;
  durationBars: number;
  name: string;
  bpm: number;
  confidence: number;
  downbeatOffset: number;
  timeSignature: [number, number];
}

interface BPMInfo {
  bpm: number;
  confidence: number;
  intervalMs: number;
}

interface PhaseInfo {
  downbeatOffset: number;
  confidence: number;
}

export interface PlayerProps {
  channel: number;
  gridNotes: number[];
  rows: number;
  cols: number;
  gridSize: string;
  useScale: boolean;
  scaleNotes: Set<number>;
}

const MIN_BPM = 40;
const MAX_BPM = 240;

export default function Player({
  channel,
  gridNotes,
  rows,
  cols,
  gridSize,
  useScale,
  scaleNotes,
}: PlayerProps) {
  const activeNotesRef = useRef<Set<number>>(new Set());
  const gridRef = useRef<GridHandle>(null);

  const isRecordingRef = useRef(false); // <-- SYNCHRONOUS FIX
  const [isPlaying, setIsPlaying] = useState(false);
  const [savedSequences, setSavedSequences] = useState<LoopSequence[]>([]);
  const [showRecordingButtons, setShowRecordingButtons] = useState(false);

  const currentRecordingRef = useRef<NoteEvent[]>([]);
  const recordingStartTime = useRef<number>(0);
  const playbackRafRef = useRef<number | null>(null);

  // Visual notes
  const noteIdRef = useRef(0);
  const visualNotesRef = useRef<VisualNote[]>([]);

  // --- BPM Detection ---
  const detectBPM = useCallback((events: NoteEvent[]): BPMInfo | null => {
    const noteOns = events
      .filter(e => e.type === 'noteOn')
      .map(e => e.timestamp);
    if (noteOns.length < 4) return null;

    const histogram = new Map<number, number>();
    const binSize = 10;
    for (let i = 0; i < noteOns.length; i++) {
      for (let j = i + 1; j < noteOns.length; j++) {
        const interval = noteOns[j] - noteOns[i];
        if (interval < 100 || interval > 2000) continue;
        const bin = Math.round(interval / binSize) * binSize;
        histogram.set(bin, (histogram.get(bin) || 0) + 1);
      }
    }
    if (histogram.size === 0) return null;

    const sortedBins = Array.from(histogram.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    let bestBPM = 120;
    let bestConfidence = 0;
    let bestInterval = 500;

    for (const [intervalMs, count] of sortedBins) {
      const baseBPM = 60000 / intervalMs;
      const candidates = [
        { bpm: baseBPM, interval: intervalMs, weight: count }, // Use exact interval
        { bpm: baseBPM * 2, interval: intervalMs / 2, weight: count * 0.8 },
        { bpm: baseBPM / 2, interval: intervalMs * 2, weight: count * 0.8 },
        { bpm: baseBPM * 3, interval: intervalMs / 3, weight: count * 0.6 },
        { bpm: baseBPM / 3, interval: intervalMs * 3, weight: count * 0.6 },
        { bpm: baseBPM * 4, interval: intervalMs / 4, weight: count * 0.5 },
        { bpm: baseBPM / 4, interval: intervalMs * 4, weight: count * 0.5 },
      ];

      for (const cand of candidates) {
        if (cand.bpm < MIN_BPM || cand.bpm > MAX_BPM) continue;

        // Use the candidate's interval directly, don't recalculate from BPM
        const beatMs = cand.interval;
        let hits = 0;
        for (const time of noteOns) {
          const nearestBeat = Math.round(time / beatMs) * beatMs;
          if (Math.abs(time - nearestBeat) < beatMs * 0.1) hits++;
        }
        const confidence =
          (hits / noteOns.length) * (cand.weight / count) * 0.8;

        if (confidence > bestConfidence) {
          bestConfidence = confidence;
          bestBPM = cand.bpm;
          bestInterval = cand.interval; // Store the exact interval from candidate
        }
      }
    }

    return {
      bpm: bestBPM,
      confidence: bestConfidence,
      intervalMs: bestInterval, // This is now the exact interval used
    };
  }, []);

  // --- Phase Detection ---
  const detectPhase = useCallback(
    (events: NoteEvent[], bpmInfo: BPMInfo): PhaseInfo | null => {
      const noteOns = events
        .filter(e => e.type === 'noteOn')
        .map(e => e.timestamp);
      if (noteOns.length === 0) return null;

      const beatMs = 60000 / bpmInfo.bpm;
      let bestOffset = 0;
      let bestError = Infinity;

      for (let offset = 0; offset < beatMs; offset += 5) {
        let totalError = 0;
        for (const time of noteOns) {
          const adjusted = time - offset;
          const beats = Math.round(adjusted / beatMs);
          const nearestBeat = beats * beatMs + offset;
          totalError += Math.abs(time - nearestBeat);
        }
        if (totalError < bestError) {
          bestError = totalError;
          bestOffset = offset;
        }
      }

      const avgError = bestError / noteOns.length;
      const confidence = Math.max(0, 1 - avgError / (beatMs * 0.2));
      return { downbeatOffset: bestOffset, confidence };
    },
    [],
  );

  // --- Create loop sequence ---
  const createLoopSequence = useCallback(
    (events: NoteEvent[], name: string): LoopSequence | null => {
      if (events.length === 0) return null;

      const firstNoteOnIndex = events.findIndex(e => e.type === 'noteOn');
      if (firstNoteOnIndex === -1) return null;

      const trimmedEvents = events.slice(firstNoteOnIndex);
      const firstTimestamp = trimmedEvents[0].timestamp;
      const normalizedEvents = trimmedEvents.map(e => ({
        ...e,
        timestamp: e.timestamp - firstTimestamp,
      }));

      const bpmInfo = detectBPM(normalizedEvents);
      if (!bpmInfo) return null;

      // Use the exact beat interval from detection
      const beatMs = bpmInfo.intervalMs;
      const barMs = beatMs * 4; // 4/4 time signature

      const phaseInfo = detectPhase(normalizedEvents, bpmInfo);
      const downbeatOffset = phaseInfo?.downbeatOffset ?? 0;

      // Find last note ON (more musically relevant)
      const lastNoteOn = Math.max(
        ...normalizedEvents
          .filter(e => e.type === 'noteOn')
          .map(e => e.timestamp),
      );

      // Try different bar lengths using exact barMs
      const barCandidates = [1, 2, 4, 8];
      let bestDuration = barMs * 4;
      let bestScore = Infinity;

      for (const bars of barCandidates) {
        const candidateDuration = bars * barMs;
        if (candidateDuration < lastNoteOn) continue;

        const timeAfterLastNote = candidateDuration - lastNoteOn;
        const silenceBeats = timeAfterLastNote / beatMs;
        const lengthPenalty = bars * 0.5;
        const silencePenalty = silenceBeats > 1 ? 10 : silenceBeats;
        const score = lengthPenalty + silencePenalty;

        if (score < bestScore) {
          bestScore = score;
          bestDuration = candidateDuration;
        }
      }

      return {
        events: normalizedEvents,
        duration: bestDuration,
        durationBars: bestDuration / barMs,
        name,
        bpm: bpmInfo.bpm,
        confidence: bpmInfo.confidence,
        downbeatOffset,
        timeSignature: [4, 4],
      };
    },
    [detectBPM, detectPhase],
  );

  // --- Recording functions ---
  const startRecording = () => {
    recordingStartTime.current = Date.now();
    currentRecordingRef.current = [];
    isRecordingRef.current = true; // <-- SYNCHRONOUS
    setShowRecordingButtons(true);
  };

  const clearRecording = () => {
    currentRecordingRef.current = [];
    isRecordingRef.current = false; // <-- SYNCHRONOUS
    setShowRecordingButtons(false);
  };

  const addRecording = () => {
    if (currentRecordingRef.current.length === 0) return;
    const loopSequence = createLoopSequence(
      currentRecordingRef.current,
      `Sequence ${savedSequences.length + 1}`,
    );
    if (loopSequence) {
      setSavedSequences([...savedSequences, loopSequence]);
      currentRecordingRef.current = [];
      isRecordingRef.current = false; // <-- SYNCHRONOUS
      setShowRecordingButtons(false);
      playSequence(loopSequence);
    }
  };

  const recordNoteEvent = useCallback(
    (type: 'noteOn' | 'noteOff', note: number, velocity: number = 0.85) => {
      if (!isRecordingRef.current || recordingStartTime.current === 0) return; // <-- USE REF
      const timestamp = Date.now() - recordingStartTime.current;
      currentRecordingRef.current.push({ type, note, timestamp, velocity });
    },
    [],
  );

  // --- Visual notes ---
  const createVisualNote = useCallback((note: number) => {
    const vn: VisualNote = {
      id: ++noteIdRef.current,
      note,
      startTime: Date.now(),
    };
    visualNotesRef.current = [...visualNotesRef.current, vn];
  }, []);

  const endVisualNote = useCallback((note: number) => {
    for (let i = visualNotesRef.current.length - 1; i >= 0; i--) {
      const vn = visualNotesRef.current[i];
      if (vn.note === note && vn.endTime == null) {
        vn.endTime = Date.now();
        break;
      }
    }
  }, []);

  // --- Grid callbacks ---
  const handleNoteOn = useCallback(
    (note: number, velocity: number) => {
      if (
        !isRecordingRef.current &&
        savedSequences.length === 0 &&
        currentRecordingRef.current.length === 0
      ) {
        startRecording();
      }

      NativeAudioModule.noteOn(channel, note, velocity);
      activeNotesRef.current.add(note);
      createVisualNote(note);
      recordNoteEvent('noteOn', note, velocity);
    },
    [channel, savedSequences.length, recordNoteEvent, createVisualNote],
  );

  const handleNoteOff = useCallback(
    (note: number) => {
      NativeAudioModule.noteOff(channel, note);
      activeNotesRef.current.delete(note);
      endVisualNote(note);
      recordNoteEvent('noteOff', note);
    },
    [channel, endVisualNote, recordNoteEvent],
  );

  const stopPlayback = useCallback(() => {
    if (playbackRafRef.current !== null) {
      cancelAnimationFrame(playbackRafRef.current);
      playbackRafRef.current = null;
    }
    activeNotesRef.current.forEach(note => {
      NativeAudioModule.noteOff(channel, note);
      endVisualNote(note);
      gridRef.current?.setPadActive(note, false);
    });
    activeNotesRef.current.clear();
    setIsPlaying(false);
  }, [channel, endVisualNote]);

  const playSequence = useCallback(
    (sequence: LoopSequence) => {
      if (isPlaying) {
        stopPlayback();
        return;
      }

      setIsPlaying(true);
      const events = [...sequence.events].sort(
        (a, b) => a.timestamp - b.timestamp,
      );
      let startTime = performance.now();
      let eventIndex = 0;

      const tick = () => {
        const elapsed = performance.now() - startTime;

        if (elapsed >= sequence.duration) {
          activeNotesRef.current.forEach(note => {
            NativeAudioModule.noteOff(channel, note);
            endVisualNote(note);
            gridRef.current?.setPadActive(note, false);
          });
          activeNotesRef.current.clear();

          eventIndex = 0;
          startTime = performance.now();
        } else {
          while (
            eventIndex < events.length &&
            events[eventIndex].timestamp <= elapsed
          ) {
            const event = events[eventIndex];

            if (event.type === 'noteOn') {
              NativeAudioModule.noteOn(channel, event.note, event.velocity);
              activeNotesRef.current.add(event.note);
              createVisualNote(event.note);
              gridRef.current?.setPadActive(event.note, true);
            } else {
              NativeAudioModule.noteOff(channel, event.note);
              activeNotesRef.current.delete(event.note);
              endVisualNote(event.note);
              gridRef.current?.setPadActive(event.note, false);
            }
            eventIndex++;
          }
        }

        playbackRafRef.current = requestAnimationFrame(tick);
      };

      playbackRafRef.current = requestAnimationFrame(tick);
    },
    [channel, isPlaying, createVisualNote, endVisualNote, stopPlayback],
  );

  // --- Sequence management ---
  const deleteSequence = (index: number) => {
    if (isPlaying) stopPlayback();
    setSavedSequences(savedSequences.filter((_, i) => i !== index));
    if (savedSequences.length === 1) {
      currentRecordingRef.current = [];
      recordingStartTime.current = 0;
      setShowRecordingButtons(false);
    }
  };

  useEffect(() => {
    return () => {
      if (playbackRafRef.current !== null) {
        cancelAnimationFrame(playbackRafRef.current);
      }
    };
  }, []);

  const MemoizedVisualizer = useMemo(
    () => (
      <MidiVisualizer
        height={50}
        width={Dimensions.get('window').width}
        notesRef={visualNotesRef}
      />
    ),
    [],
  );

  const currentSequenceInfo = useMemo(() => {
    if (savedSequences.length === 0) return null;
    const seq = savedSequences[savedSequences.length - 1];
    return {
      bpm: Math.round(seq.bpm),
      bars: seq.durationBars,
      duration: (seq.duration / 1000).toFixed(2),
      confidence: (seq.confidence * 100).toFixed(0),
    };
  }, [savedSequences]);

  // --- RENDER ---
  return (
    <>
      <View style={styles.midiVisualiser}>{MemoizedVisualizer}</View>

      {currentSequenceInfo && (
        <View style={styles.sequenceInfo}>
          <Text style={styles.sequenceInfoText}>
            BPM: {currentSequenceInfo.bpm} | Bars: {currentSequenceInfo.bars} |
            Duration: {currentSequenceInfo.duration}s | Confidence:{' '}
            {currentSequenceInfo.confidence}%
          </Text>
        </View>
      )}

      <Grid
        ref={gridRef}
        gridNotes={gridNotes}
        rows={rows}
        cols={cols}
        gridSize={gridSize}
        useScale={useScale}
        scaleNotes={scaleNotes}
        onNoteOn={handleNoteOn}
        onNoteOff={handleNoteOff}
      />

      <View style={styles.footer} pointerEvents="box-none">
        {showRecordingButtons && (
          <View style={styles.footerButtons} pointerEvents="auto">
            <View style={styles.footerButtonRow}>
              <TouchableOpacity
                style={[styles.footerButton, styles.addButton]}
                onPress={addRecording}
              >
                <Text style={styles.footerButtonText}>ADD</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.footerButton, styles.clearButton]}
                onPress={clearRecording}
              >
                <Text style={styles.footerButtonText}>CLEAR</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {savedSequences.length > 0 && !showRecordingButtons && (
          <View style={styles.footerButtons} pointerEvents="auto">
            <TouchableOpacity
              style={[
                styles.footerButton,
                isPlaying ? styles.stopButton : styles.playButton,
              ]}
              onPress={() => {
                if (isPlaying) {
                  stopPlayback();
                } else if (savedSequences.length > 0) {
                  playSequence(savedSequences[savedSequences.length - 1]);
                }
              }}
            >
              <Text style={styles.footerButtonText}>
                {isPlaying ? '■ STOP' : '▶ PLAY'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.footerButton, styles.deleteButton]}
              onPress={() => deleteSequence(savedSequences.length - 1)}
            >
              <Text style={styles.footerButtonText}>DELETE</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  midiVisualiser: {
    height: 50,
  },
  sequenceInfo: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  sequenceInfoText: {
    color: '#ffffff',
    fontSize: 14,
    fontFamily: 'monospace',
  },
  footer: {
    bottom: 0,
    left: 0,
    right: 0,
    height: 50,
    paddingHorizontal: 16,
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  footerButtons: {
    alignItems: 'center',
    gap: 12,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  footerButtonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  footerButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    minWidth: 90,
    alignItems: 'center',
  },
  footerButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  addButton: {
    backgroundColor: '#4caf50',
  },
  clearButton: {
    backgroundColor: '#757575',
  },
  playButton: {
    backgroundColor: '#4caf50',
  },
  stopButton: {
    backgroundColor: '#f44336',
  },
  deleteButton: {
    backgroundColor: '#d32f2f',
  },
});
