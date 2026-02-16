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

interface NoteEvent {
  type: 'noteOn' | 'noteOff';
  note: number;
  timestamp: number;
  velocity: number;
}

interface RecordedSequence {
  events: NoteEvent[];
  duration: number;
  name: string;
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

export default function Player({
  channel,
  gridNotes,
  rows,
  cols,
  gridSize,
  useScale,
  scaleNotes,
}: PlayerProps) {
  // Track active notes for audio state
  const activeNotesRef = useRef<Set<number>>(new Set());

  // Grid ref for imperative pad control
  const gridRef = useRef<GridHandle>(null);

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [savedSequences, setSavedSequences] = useState<RecordedSequence[]>([]);
  const currentRecordingRef = useRef<NoteEvent[]>([]);
  const [showRecordingButtons, setShowRecordingButtons] = useState(false);

  const recordingStartTime = useRef<number>(0);
  const playbackIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const playbackStartTime = useRef<number>(0);

  // Visual notes
  const noteIdRef = useRef(0);
  const visualNotesRef = useRef<VisualNote[]>([]);

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

  // Recording functions
  const startRecording = () => {
    recordingStartTime.current = Date.now();
    currentRecordingRef.current = [];
    setIsRecording(true);
    setShowRecordingButtons(true);
  };

  const clearRecording = () => {
    currentRecordingRef.current = [];
    setIsRecording(false);
    setShowRecordingButtons(false);
  };

  const addRecording = () => {
    if (currentRecordingRef.current.length === 0) return;

    const duration =
      currentRecordingRef.current[currentRecordingRef.current.length - 1]
        .timestamp;
    const newSequence: RecordedSequence = {
      events: [...currentRecordingRef.current],
      duration,
      name: `Sequence ${savedSequences.length + 1}`,
    };

    setSavedSequences([...savedSequences, newSequence]);
    currentRecordingRef.current = [];
    setIsRecording(false);
    setShowRecordingButtons(false);

    playSequence(newSequence);
  };

  const recordNoteEvent = useCallback(
    (type: 'noteOn' | 'noteOff', note: number, velocity: number = 0.85) => {
      if (recordingStartTime.current === 0) return;

      const timestamp = Date.now() - recordingStartTime.current;
      const event: NoteEvent = {
        type,
        note,
        timestamp,
        velocity,
      };

      currentRecordingRef.current.push(event);
    },
    [],
  );

  // Grid note callbacks
  const handleNoteOn = useCallback(
    (note: number, velocity: number) => {
      // Auto-start recording on first touch
      if (
        !isRecording &&
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
    [
      channel,
      isRecording,
      savedSequences.length,
      createVisualNote,
      recordNoteEvent,
    ],
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
    if (playbackIntervalRef.current) {
      cancelAnimationFrame(playbackIntervalRef.current);
      playbackIntervalRef.current = null;
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
    (sequence: RecordedSequence) => {
      if (isPlaying) {
        stopPlayback();
        return;
      }

      setIsPlaying(true);
      let startTime = performance.now(); // Capture start timestamp
      let eventIndex = 0;
      let rafId: number;

      const tick = () => {
        const elapsed = performance.now() - startTime; // Calculate elapsed time

        // Process all events that should have fired by now
        while (
          eventIndex < sequence.events.length &&
          sequence.events[eventIndex].timestamp <= elapsed
        ) {
          const event = sequence.events[eventIndex];

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

        // Check if sequence is complete
        if (eventIndex >= sequence.events.length) {
          // Clean up any hanging notes
          activeNotesRef.current.forEach(n => {
            NativeAudioModule.noteOff(channel, n);
            endVisualNote(n);
            gridRef.current?.setPadActive(n, false);
          });
          activeNotesRef.current.clear();

          // Loop: restart with NEW start time
          eventIndex = 0;
          startTime = performance.now(); // Reset start time for loop
        }

        rafId = requestAnimationFrame(tick);
      };

      rafId = requestAnimationFrame(tick);
      playbackIntervalRef.current = rafId as any;
    },
    [channel, isPlaying, createVisualNote, endVisualNote, stopPlayback],
  );

  const deleteSequence = (index: number) => {
    if (isPlaying) {
      stopPlayback();
    }
    setSavedSequences(savedSequences.filter((_, i) => i !== index));
    if (savedSequences.length === 1) {
      currentRecordingRef.current = [];
      recordingStartTime.current = 0;
      setShowRecordingButtons(false);
    }
  };

  useEffect(() => {
    return () => {
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current);
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

  return (
    <>
      <View style={styles.midiVisualiser}>{MemoizedVisualizer}</View>

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
                disabled={currentRecordingRef.current.length === 0}
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
    width: '100%',
    justifyContent: 'center',
  },
  footerButton: {
    paddingHorizontal: 32,
    borderRadius: 12,
    minWidth: 140,
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
