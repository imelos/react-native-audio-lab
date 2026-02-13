import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Text,
  Button,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import NativeAudioModule from '../specs/NativeAudioModule';
import { AnimatedView } from 'react-native-reanimated/lib/typescript/component/View';
import {
  MidiVisualizer,
  VisualNote,
} from './features/midi-visualiser/MidiVisualiser';

const WAVEFORMS = ['sine', 'saw', 'square', 'triangle'] as const;
type Waveform = (typeof WAVEFORMS)[number];

const GRID_CONFIGS = {
  '4x4': { rows: 4, cols: 4 },
  '5x5': { rows: 5, cols: 5 },
  '6x6': { rows: 6, cols: 6 },
  '8x8': { rows: 8, cols: 8 },
} as const;

type GridSize = keyof typeof GRID_CONFIGS;

const KEYS = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
] as const;
type Key = (typeof KEYS)[number];

const SCALES = {
  Major: [0, 2, 4, 5, 7, 9, 11],
  Minor: [0, 2, 3, 5, 7, 8, 10],
} as const;

type ScaleType = keyof typeof SCALES;

// Recording types
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

// CHANNEL CONSTANTS - Define which channel to use
const MAIN_CHANNEL = 1; // Main instrument on channel 1
// const PLAYBACK_CHANNEL = 2; // Playback on channel 2 (optional - can use same channel)

function midiToNoteName(midiNote: number): string {
  const noteNames = [
    'C',
    'C#',
    'D',
    'D#',
    'E',
    'F',
    'F#',
    'G',
    'G#',
    'A',
    'A#',
    'B',
  ];
  const octave = Math.floor(midiNote / 12) - 1;
  const noteName = noteNames[midiNote % 12];
  return `${noteName}${octave}`;
}

function generateScale(
  rootNote: number,
  scaleType: ScaleType,
  count: number,
): number[] {
  const intervals = SCALES[scaleType];
  const notes: number[] = [];

  let octaveOffset = 0;
  for (let i = 0; i < count; i++) {
    const scaleIndex = i % intervals.length;
    if (i > 0 && scaleIndex === 0) {
      octaveOffset += 12;
    }
    notes.push(rootNote + intervals[scaleIndex] + octaveOffset);
  }

  return notes;
}

interface GridPadProps {
  note: number;
  index: number;
  activeNotes: Set<number>;
  setRef: (index: number, ref: View | null) => void;
  isInScale?: boolean;
}

function GridPad({
  note,
  index,
  activeNotes,
  setRef,
  isInScale = true,
}: GridPadProps) {
  const isActive = activeNotes.has(note);
  const backgroundColor = useSharedValue(0);

  useEffect(() => {
    backgroundColor.value = withTiming(isActive ? 1 : 0, { duration: 0 });
  }, [isActive, backgroundColor]);

  const animatedStyle = useAnimatedStyle(() => ({
    backgroundColor:
      backgroundColor.value === 1
        ? '#6200ee'
        : isInScale
        ? '#2a2a2a'
        : '#1a1a1a',
  }));

  return (
    <Animated.View
      ref={(ref: AnimatedView) => setRef(index, ref)}
      style={[styles.gridPad, animatedStyle]}
    >
      <Text
        style={[
          styles.noteText,
          isActive && styles.noteTextActive,
          !isInScale && styles.noteTextOutOfScale,
        ]}
      >
        {midiToNoteName(note)}
      </Text>
    </Animated.View>
  );
}

export default function App() {
  const [currentWaveform, setCurrentWaveform] = useState<Waveform>('sine');
  const [gridSize, setGridSize] = useState<GridSize>('5x5');
  const [selectedKey, setSelectedKey] = useState<Key>('C');
  const [scaleType, setScaleType] = useState<ScaleType>('Major');
  const [useScale, setUseScale] = useState(true);

  // Track multiple active notes
  const activeNotesRef = useRef<Map<string, number>>(new Map());
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [savedSequences, setSavedSequences] = useState<RecordedSequence[]>([]);
  const [currentRecording, setCurrentRecording] = useState<NoteEvent[]>([]);
  const [showRecordingButtons, setShowRecordingButtons] = useState(false);

  const recordingStartTime = useRef<number>(0);
  const playbackIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const playbackStartTime = useRef<number>(0);
  const playbackActiveNotes = useRef<Set<number>>(new Set());
  const keyRefsRef = useRef<Map<number, View>>(new Map());
  const keyLayoutsRef = useRef<
    Map<number, { x: number; y: number; width: number; height: number }>
  >(new Map());

  const noteIdRef = useRef(0);
  const visualNotesRef = useRef<VisualNote[]>([]);

  const { rows, cols } = GRID_CONFIGS[gridSize];
  const totalPads = rows * cols;

  const baseOctave = 3;
  const keyOffset = KEYS.indexOf(selectedKey);
  const rootNote = 12 * (baseOctave + 1) + keyOffset;

  const gridNotes = useScale
    ? generateScale(rootNote, scaleType, totalPads)
    : Array.from({ length: totalPads }, (_, i) => rootNote + i);

  const scaleNotes = new Set(generateScale(rootNote, scaleType, 88));

  // Initialize audio engine on mount
  useEffect(() => {
    // Create main instrument on channel 1
    NativeAudioModule.createInstrument(MAIN_CHANNEL, 'Main Synth', 16, 'sine');

    // Optionally create a separate channel for playback with different sound
    // NativeAudioModule.createInstrument(PLAYBACK_CHANNEL, 'Playback', 8, 'sine');

    // Set initial ADSR
    NativeAudioModule.setADSR(MAIN_CHANNEL, 0.01, 0.1, 0.8, 0.3);

    return () => {
      // Cleanup: stop all notes and remove instruments
      NativeAudioModule.allNotesOffAllChannels();
    };
  }, []);

  const createVisualNote = (note: number) => {
    const vn: VisualNote = {
      id: ++noteIdRef.current,
      note,
      startTime: Date.now(),
    };
    visualNotesRef.current.push(vn);
  };

  const endVisualNote = (note: number) => {
    for (let i = visualNotesRef.current.length - 1; i >= 0; i--) {
      const vn = visualNotesRef.current[i];
      if (vn.note === note && vn.endTime == null) {
        vn.endTime = Date.now();
        break;
      }
    }
  };

  // Recording functions
  const startRecording = () => {
    recordingStartTime.current = Date.now();
    setCurrentRecording([]);
    setIsRecording(true);
    setShowRecordingButtons(true);
  };

  const clearRecording = () => {
    setCurrentRecording([]);
    setIsRecording(false);
    setShowRecordingButtons(false);
  };

  const addRecording = () => {
    if (currentRecording.length === 0) return;

    const duration = currentRecording[currentRecording.length - 1].timestamp;
    const newSequence: RecordedSequence = {
      events: [...currentRecording],
      duration,
      name: `Sequence ${savedSequences.length + 1}`,
    };

    setSavedSequences([...savedSequences, newSequence]);
    setCurrentRecording([]);
    setIsRecording(false);
    setShowRecordingButtons(false);
  };

  const playSequence = (sequence: RecordedSequence) => {
    if (isPlaying) {
      stopPlayback();
      return;
    }

    setIsPlaying(true);
    playbackStartTime.current = Date.now();
    playbackActiveNotes.current.clear();

    let eventIndex = 0;

    const playNextEvents = () => {
      const currentTime = Date.now() - playbackStartTime.current;

      while (
        eventIndex < sequence.events.length &&
        sequence.events[eventIndex].timestamp <= currentTime
      ) {
        const event = sequence.events[eventIndex];

        if (event.type === 'noteOn') {
          // Use MAIN_CHANNEL for playback (or PLAYBACK_CHANNEL if you want different sound)
          NativeAudioModule.noteOn(MAIN_CHANNEL, event.note, event.velocity);
          createVisualNote(event.note);
          playbackActiveNotes.current.add(event.note);
        } else {
          NativeAudioModule.noteOff(MAIN_CHANNEL, event.note);
          endVisualNote(event.note);
          playbackActiveNotes.current.delete(event.note);
        }

        eventIndex++;
      }

      updateActiveNotesDisplay();

      if (eventIndex >= sequence.events.length) {
        playbackActiveNotes.current.forEach(note => {
          NativeAudioModule.noteOff(MAIN_CHANNEL, note);
          endVisualNote(note);
        });
        playbackActiveNotes.current.clear();

        eventIndex = 0;
        playbackStartTime.current = Date.now();
      }
    };

    playbackIntervalRef.current = setInterval(playNextEvents, 10);
  };

  const stopPlayback = () => {
    if (playbackIntervalRef.current) {
      clearInterval(playbackIntervalRef.current);
      playbackIntervalRef.current = null;
    }

    playbackActiveNotes.current.forEach(note => {
      NativeAudioModule.noteOff(MAIN_CHANNEL, note);
      endVisualNote(note);
    });
    playbackActiveNotes.current.clear();
    updateActiveNotesDisplay();
    setIsPlaying(false);
  };

  const deleteSequence = (index: number) => {
    if (isPlaying) {
      stopPlayback();
    }
    setSavedSequences(savedSequences.filter((_, i) => i !== index));
  };

  useEffect(() => {
    return () => {
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current);
      }
    };
  }, []);

  const changeWaveform = () => {
    const currentIndex = WAVEFORMS.indexOf(currentWaveform);
    const nextIndex = (currentIndex + 1) % WAVEFORMS.length;
    const nextWave = WAVEFORMS[nextIndex];

    setCurrentWaveform(nextWave);
    // Update waveform on the main channel
    NativeAudioModule.setWaveform(MAIN_CHANNEL, nextWave);
  };

  const changeGridSize = () => {
    const sizes: GridSize[] = ['4x4', '5x5', '6x6', '8x8'];
    const currentIndex = sizes.indexOf(gridSize);
    const nextIndex = (currentIndex + 1) % sizes.length;
    setGridSize(sizes[nextIndex]);
    keyLayoutsRef.current.clear();
    keyRefsRef.current.clear();
  };

  const changeKey = () => {
    const currentIndex = KEYS.indexOf(selectedKey);
    const nextIndex = (currentIndex + 1) % KEYS.length;
    setSelectedKey(KEYS[nextIndex]);
  };

  const toggleScale = () => {
    setScaleType(current => (current === 'Major' ? 'Minor' : 'Major'));
  };

  const toggleScaleMode = () => {
    setUseScale(current => !current);
  };

  const measureKey = (index: number) => {
    const ref = keyRefsRef.current.get(index);
    if (ref) {
      ref.measure((x, y, width, height, pageX, pageY) => {
        keyLayoutsRef.current.set(index, { x: pageX, y: pageY, width, height });
      });
    }
  };

  const findNoteAtPosition = (pageX: number, pageY: number): number | null => {
    for (const [index, layout] of keyLayoutsRef.current.entries()) {
      if (
        pageX >= layout.x &&
        pageX <= layout.x + layout.width &&
        pageY >= layout.y &&
        pageY <= layout.y + layout.height
      ) {
        return gridNotes[index];
      }
    }
    return null;
  };

  const updateActiveNotesDisplay = () => {
    const combinedNotes = new Set([
      ...activeNotesRef.current.values(),
      ...playbackActiveNotes.current,
    ]);
    setActiveNotes(combinedNotes);
  };

  const recordNoteEvent = (
    type: 'noteOn' | 'noteOff',
    note: number,
    velocity: number = 0.85,
  ) => {
    if (recordingStartTime.current === 0) return;

    const timestamp = Date.now() - recordingStartTime.current;
    const event: NoteEvent = {
      type,
      note,
      timestamp,
      velocity,
    };

    setCurrentRecording(prev => [...prev, event]);
  };

  const handleTouchStart = (event: any) => {
    if (
      !isRecording &&
      savedSequences.length === 0 &&
      currentRecording.length === 0
    ) {
      startRecording();
    }

    if (keyLayoutsRef.current.size === 0) {
      gridNotes.forEach((_, index) => measureKey(index));
    }

    const touches = event.nativeEvent.touches;

    for (let i = 0; i < touches.length; i++) {
      const touch = touches[i];
      const { pageX, pageY, identifier } = touch;
      const note = findNoteAtPosition(pageX, pageY);

      if (note !== null) {
        const touchId = String(identifier);

        if (!activeNotesRef.current.has(touchId)) {
          // Play note on MAIN_CHANNEL
          NativeAudioModule.noteOn(MAIN_CHANNEL, note, 0.85);
          createVisualNote(note);
          activeNotesRef.current.set(touchId, note);
          recordNoteEvent('noteOn', note, 0.85);
        }
      }
    }

    updateActiveNotesDisplay();
  };

  const handleTouchMove = (event: any) => {
    const touches = event.nativeEvent.touches;
    const currentTouchedNotes = new Map<string, number>();

    for (let i = 0; i < touches.length; i++) {
      const touch = touches[i];
      const { pageX, pageY, identifier } = touch;
      const note = findNoteAtPosition(pageX, pageY);

      if (note !== null) {
        const touchId = String(identifier);
        const previousNote = activeNotesRef.current.get(touchId);

        if (previousNote !== note) {
          if (previousNote !== undefined) {
            NativeAudioModule.noteOff(MAIN_CHANNEL, previousNote);
            endVisualNote(previousNote);
            recordNoteEvent('noteOff', previousNote);
          }
          NativeAudioModule.noteOn(MAIN_CHANNEL, note, 0.85);
          createVisualNote(note);
          recordNoteEvent('noteOn', note, 0.85);
        }

        currentTouchedNotes.set(touchId, note);
      }
    }

    for (const [touchId, note] of activeNotesRef.current.entries()) {
      if (!currentTouchedNotes.has(touchId)) {
        NativeAudioModule.noteOff(MAIN_CHANNEL, note);
        endVisualNote(note);
        recordNoteEvent('noteOff', note);
      }
    }

    activeNotesRef.current = currentTouchedNotes;
    updateActiveNotesDisplay();
  };

  const handleTouchEnd = (event: any) => {
    const touches = event.nativeEvent.touches;
    const remainingTouches = new Map<string, number>();

    for (let i = 0; i < touches.length; i++) {
      const touch = touches[i];
      const { pageX, pageY, identifier } = touch;
      const note = findNoteAtPosition(pageX, pageY);

      if (note !== null) {
        remainingTouches.set(String(identifier), note);
      }
    }

    for (const [touchId, note] of activeNotesRef.current.entries()) {
      if (!remainingTouches.has(touchId)) {
        NativeAudioModule.noteOff(MAIN_CHANNEL, note);
        endVisualNote(note);
        recordNoteEvent('noteOff', note);
      }
    }

    activeNotesRef.current = remainingTouches;
    updateActiveNotesDisplay();
  };

  const setRef = (index: number, ref: View | null) => {
    if (ref) {
      keyRefsRef.current.set(index, ref);
    }
  };

  const gridRows = [];
  for (let i = 0; i < rows; i++) {
    const rowPads = gridNotes.slice(i * cols, (i + 1) * cols);
    gridRows.push(rowPads);
  }

  return (
    <View style={styles.container}>
      <View style={styles.contentContainer}>
        <Text style={styles.title}>Grid Synth</Text>

        {/* Scale Controls */}
        <View style={styles.controlRow}>
          <Text style={styles.label}>Key: {selectedKey}</Text>
          <Button title="Change Key" onPress={changeKey} color="#6200ee" />
        </View>

        <View style={styles.controlRow}>
          <Text style={styles.label}>Scale: {scaleType}</Text>
          <Button title="Major/Minor" onPress={toggleScale} color="#6200ee" />
        </View>

        <View style={styles.controlRow}>
          <Text style={styles.label}>
            Mode: {useScale ? 'Scale' : 'Chromatic'}
          </Text>
          <Button
            title="Toggle Mode"
            onPress={toggleScaleMode}
            color="#6200ee"
          />
        </View>

        <View style={styles.controlRow}>
          <Text style={styles.label}>Grid: {gridSize}</Text>
          <Button
            title="Change Grid"
            onPress={changeGridSize}
            color="#6200ee"
          />
        </View>

        <View style={styles.controlRow}>
          <Text style={styles.label}>Waveform: {currentWaveform}</Text>
          <Button
            title="Change Wave"
            onPress={changeWaveform}
            color="#6200ee"
          />
        </View>

        <View style={styles.controlRow}>
          <Text style={styles.label}>Presets:</Text>
          <View style={styles.buttonGroup}>
            <Button
              title="Pluck"
              onPress={() =>
                NativeAudioModule.setADSR(MAIN_CHANNEL, 0.005, 0.1, 0.0, 0.2)
              }
            />
            <Button
              title="Pad"
              onPress={() =>
                NativeAudioModule.setADSR(MAIN_CHANNEL, 0.3, 1.5, 0.7, 2.0)
              }
            />
            <Button
              title="Organ"
              onPress={() =>
                NativeAudioModule.setADSR(MAIN_CHANNEL, 0.01, 0.05, 1.0, 0.4)
              }
            />
          </View>
        </View>

        <View style={styles.midiVisualiser}>
          <MidiVisualizer
            height={50}
            width={Dimensions.get('window').width}
            notesRef={visualNotesRef}
          />
        </View>

        {/* Grid */}
        <View
          style={styles.gridWrapper}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {gridRows.map((rowPads, rowIndex) => (
            <View key={`row-${rowIndex}`} style={styles.gridRow}>
              {rowPads.map((note, colIndex) => {
                const index = rowIndex * cols + colIndex;
                const isInScale = useScale || scaleNotes.has(note);
                return (
                  <GridPad
                    key={`${gridSize}-${index}`}
                    note={note}
                    index={index}
                    activeNotes={activeNotes}
                    setRef={setRef}
                    isInScale={isInScale}
                  />
                );
              })}
            </View>
          ))}
        </View>

        {/* Footer with dynamic buttons */}
        <View style={styles.footer}>
          {showRecordingButtons && (
            <View style={styles.footerButtons}>
              {isRecording && (
                <Text style={styles.recordingIndicator}>
                  ● Recording... {currentRecording.length} events
                </Text>
              )}
              <View style={styles.footerButtonRow}>
                <TouchableOpacity
                  style={[styles.footerButton, styles.addButton]}
                  onPress={addRecording}
                  disabled={currentRecording.length === 0}
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
            <View style={styles.footerButtons}>
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
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  midiVisualiser: {
    height: 50,
  },
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  contentContainer: {
    paddingTop: 60,
  },
  title: {
    fontSize: 36,
    color: '#ffffff',
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 24,
  },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    gap: 12,
    flexWrap: 'wrap',
    paddingHorizontal: 16,
  },
  label: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '500',
  },
  buttonGroup: {
    flexDirection: 'row',
    gap: 8,
  },
  gridWrapper: {
    marginTop: 20,
    aspectRatio: 1,
    width: '100%',
  },
  gridRow: {
    flex: 1,
    flexDirection: 'row',
    gap: 1,
    height: 70,
  },
  gridPad: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noteText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
  noteTextActive: {
    color: '#ffffff',
  },
  noteTextOutOfScale: {
    color: '#666666',
  },
  footer: {
    minHeight: 100,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 40,
  },
  footerButtons: {
    alignItems: 'center',
    gap: 12,
  },
  footerButtonRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    justifyContent: 'center',
  },
  footerButton: {
    paddingHorizontal: 32,
    paddingVertical: 16,
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
  recordingIndicator: {
    color: '#f44336',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
});
