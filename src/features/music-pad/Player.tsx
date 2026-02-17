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
import { useSharedValue } from 'react-native-reanimated';

interface NoteEvent {
  type: 'noteOn' | 'noteOff';
  note: number;
  timestamp: number;
  velocity: number;
}

export interface LoopSequence {
  events: NoteEvent[];
  duration: number;
  durationBars: number;
  name: string;
  bpm: number;
  confidence: number;
  downbeatOffset: number;
  timeSignature: [number, number];
  beatIntervalMs: number;
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

  const playheadX = useSharedValue(0);
  const currentMusicalMs = useSharedValue(0);

  const windowWidth = Dimensions.get('window').width;

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

        const EPS = 0.05; // 5% confidence tolerance

        if (
          confidence > bestConfidence + EPS ||
          (Math.abs(confidence - bestConfidence) <= EPS &&
            cand.interval > bestInterval) // ⬅️ prefer slower beat
        ) {
          bestConfidence = confidence;
          bestBPM = cand.bpm;
          bestInterval = cand.interval;
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

      const beatMs = bpmInfo.intervalMs;
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

      const lastNoteOff = Math.max(
        ...normalizedEvents
          .filter(e => e.type === 'noteOff')
          .map(e => e.timestamp),
      );

      const phaseInfo = detectPhase(normalizedEvents, bpmInfo);
      const downbeatOffset = phaseInfo?.downbeatOffset ?? 0;

      // Find last note ON (more musically relevant)
      // const lastNoteOn = Math.max(
      //   ...normalizedEvents
      //     .filter(e => e.type === 'noteOn')
      //     .map(e => e.timestamp),
      // );

      // Try different bar lengths using exact barMs
      const rawBars = lastNoteOff / barMs;
      const bars = nextPowerOfTwo(Math.ceil(rawBars)); //
      const bestDuration = bars * barMs;

      const firstEventTime = Math.min(
        ...normalizedEvents.map(e => e.timestamp),
      );

      normalizedEvents.forEach(e => {
        e.timestamp -= firstEventTime;
      });

      return {
        events: normalizedEvents,
        duration: bestDuration,
        durationBars: bars,
        name,
        bpm: bpmInfo.bpm,
        confidence: bpmInfo.confidence,
        downbeatOffset,
        timeSignature: [4, 4],
        beatIntervalMs: bpmInfo.intervalMs,
      };
    },
    [detectBPM, detectPhase],
  );

  // --- Recording functions ---
  const startRecording = () => {
    recordingStartTime.current = performance.now();
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
      const timestamp = performance.now() - recordingStartTime.current;
      currentRecordingRef.current.push({ type, note, timestamp, velocity });
    },
    [],
  );

  // --- Visual notes ---
  const createVisualNote = useCallback((note: number) => {
    const vn: VisualNote = {
      id: ++noteIdRef.current,
      note,
      startTime: performance.now(),
    };
    visualNotesRef.current = [...visualNotesRef.current, vn];
  }, []);

  const endVisualNote = useCallback((note: number) => {
    for (let i = visualNotesRef.current.length - 1; i >= 0; i--) {
      const vn = visualNotesRef.current[i];
      if (vn.note === note && vn.endTime == null) {
        vn.endTime = performance.now();
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
      stopPlayback();
      setIsPlaying(true);

      const events = [...sequence.events].sort(
        (a, b) => a.timestamp - b.timestamp,
      );

      let eventIndex = 0;
      let lastLoopTime = 0;
      const startTime = performance.now();

      const tick = () => {
        const now = performance.now();
        const rawElapsed = now - startTime;

        const loopTime =
          (rawElapsed + sequence.downbeatOffset) % sequence.duration;

        // 🔁 LOOP WRAP — THIS FIXES THE GAP
        if (loopTime < lastLoopTime) {
          activeNotesRef.current.forEach(note => {
            NativeAudioModule.noteOff(channel, note);
            gridRef.current?.setPadActive(note, false);
          });
          activeNotesRef.current.clear();
          eventIndex = 0;
        }

        // ▶️ SCHEDULE EVENTS
        while (
          eventIndex < events.length &&
          events[eventIndex].timestamp <= loopTime
        ) {
          const e = events[eventIndex];

          if (e.type === 'noteOn') {
            NativeAudioModule.noteOn(channel, e.note, e.velocity);
            activeNotesRef.current.add(e.note);
            gridRef.current?.setPadActive(e.note, true);
          } else {
            NativeAudioModule.noteOff(channel, e.note);
            activeNotesRef.current.delete(e.note);
            gridRef.current?.setPadActive(e.note, false);
          }

          eventIndex++;
        }

        currentMusicalMs.value = loopTime;
        const progress = loopTime / sequence.duration; // 0…1
        playheadX.value = progress * windowWidth; // ← cheap write!

        lastLoopTime = loopTime;
        playbackRafRef.current = requestAnimationFrame(tick);
      };

      playbackRafRef.current = requestAnimationFrame(tick);
    },
    [channel, stopPlayback, currentMusicalMs, playheadX, windowWidth],
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

  function roundToGrid(time: number, gridMs: number) {
    return Math.round(time / gridMs) * gridMs;
  }

  const quantizeSequence = () => {
    if (savedSequences.length === 0) return;

    const seqIndex = savedSequences.length - 1;
    const sequence = savedSequences[seqIndex];

    const beatMs = sequence.beatIntervalMs;
    const sixteenthMs = beatMs / 4;

    // 1️⃣ Pair noteOn / noteOff
    type NotePair = {
      note: number;
      velocity: number;
      start: number;
      end: number;
    };

    const active = new Map<number, NoteEvent>();
    const pairs: NotePair[] = [];

    for (const e of sequence.events) {
      if (e.type === 'noteOn') {
        active.set(e.note, e);
      } else {
        const on = active.get(e.note);
        if (on) {
          pairs.push({
            note: e.note,
            velocity: on.velocity,
            start: on.timestamp,
            end: e.timestamp,
          });
          active.delete(e.note);
        }
      }
    }

    // 2️⃣ Quantize pairs
    const quantizedEvents: NoteEvent[] = [];

    for (const p of pairs) {
      const originalLength = p.end - p.start;

      const qStart = roundToGrid(p.start, sixteenthMs);
      const qEnd = Math.max(
        qStart + sixteenthMs * 0.25, // minimum length safety
        qStart + originalLength,
      );

      quantizedEvents.push(
        {
          type: 'noteOn',
          note: p.note,
          timestamp: qStart,
          velocity: p.velocity,
        },
        {
          type: 'noteOff',
          note: p.note,
          timestamp: qEnd,
          velocity: 0,
        },
      );
    }

    // 3️⃣ Sort events
    quantizedEvents.sort((a, b) => a.timestamp - b.timestamp);

    // 4️⃣ Replace sequence
    const quantizedSequence: LoopSequence = {
      ...sequence,
      events: quantizedEvents,
    };

    const next = [...savedSequences];
    next[seqIndex] = quantizedSequence;
    setSavedSequences(next);

    // 5️⃣ Update visual notes
    visualNotesRef.current = quantizedEvents
      .filter(e => e.type === 'noteOn')
      .map(e => ({
        id: ++noteIdRef.current,
        note: e.note,
        startTime: e.timestamp,
        endTime:
          quantizedEvents.find(
            x =>
              x.type === 'noteOff' &&
              x.note === e.note &&
              x.timestamp > e.timestamp,
          )?.timestamp ?? e.timestamp + sixteenthMs,
      }));
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
        width={windowWidth}
        notesRef={visualNotesRef}
        currentMusicalMs={currentMusicalMs}
        playheadX={playheadX}
        sequence={savedSequences[savedSequences.length - 1]}
      />
    ),
    [savedSequences, currentMusicalMs, playheadX, windowWidth],
  );

  const currentSequenceInfo = useMemo(() => {
    if (savedSequences.length === 0) return null;
    const seq = savedSequences[savedSequences.length - 1];
    return {
      bpm: seq.bpm.toFixed(2), // display 2 decimals
      bars: seq.durationBars,
      duration: (seq.duration / 1000).toFixed(3), // show 3 decimals
      confidence: (seq.confidence * 100).toFixed(0),
    };
  }, [savedSequences]);

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
              style={[styles.footerButton, styles.playButton]}
              onPress={quantizeSequence}
            >
              <Text style={styles.footerButtonText}>QUANTIZE</Text>
            </TouchableOpacity>
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

function nextPowerOfTwo(n: number) {
  return Math.pow(2, Math.ceil(Math.log2(n)));
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
    paddingVertical: 3,
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
