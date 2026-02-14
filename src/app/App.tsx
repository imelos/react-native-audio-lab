import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Text,
  Button,
  TouchableOpacity,
  Dimensions,
  ScrollView,
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
import Slider from '@react-native-community/slider';

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

const FILTER_TYPES = ['LowPass', 'HighPass', 'BandPass'] as const;
type FilterType = (typeof FILTER_TYPES)[number];

type TabType = 'instrument' | 'filter' | 'fx';

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
const PLAYBACK_CHANNEL = 2; // Playback on channel 2 (optional - can use same channel)

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
  onLayout: (index: number, event: any) => void;
  isInScale?: boolean;
}

function GridPad({
  note,
  index,
  activeNotes,
  setRef,
  onLayout,
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
      onLayout={event => onLayout(index, event)}
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
  const [activeTab, setActiveTab] = useState<TabType>('instrument');
  const [currentWaveform, setCurrentWaveform] = useState<Waveform>('sine');
  const [gridSize, setGridSize] = useState<GridSize>('5x5');
  const [selectedKey, setSelectedKey] = useState<Key>('C');
  const [scaleType, setScaleType] = useState<ScaleType>('Major');
  const [useScale, setUseScale] = useState(true);

  // const insets = useSafeAreaInsets();

  // Filter state
  const [filterEnabled, setFilterEnabled] = useState(false);
  const filterEffectIdRef = useRef<number | null>(null);
  const [filterType, setFilterType] = useState<FilterType>('LowPass');
  const [filterCutoff, setFilterCutoff] = useState(1000); // 20 - 20000 Hz
  const [filterResonance, setFilterResonance] = useState(0.7); // 0.1 - 10

  // Reverb state
  const [reverbEnabled, setReverbEnabled] = useState(false);
  const reverbEffectIdRef = useRef<number | null>(null);
  const [reverbRoomSize, setReverbRoomSize] = useState(0.5); // 0 - 1
  const [reverbWetLevel, setReverbWetLevel] = useState(0.33); // 0 - 1

  // Delay state
  const [delayEnabled, setDelayEnabled] = useState(false);
  const delayEffectIdRef = useRef<number | null>(null);
  const [delayTime, setDelayTime] = useState(500); // 1 - 2000 ms
  const [delayFeedback, setDelayFeedback] = useState(0.4); // 0 - 0.95
  const [delayWetLevel, setDelayWetLevel] = useState(0.5); // 0 - 1

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
  const playbackIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const playbackStartTime = useRef<number>(0);
  const playbackActiveNotes = useRef<Set<number>>(new Set());

  const keyRefsRef = useRef<Map<number, View>>(new Map());
  const keyLayoutsRef = useRef<
    Map<number, { x: number; y: number; width: number; height: number }>
  >(new Map());

  const noteIdRef = useRef(0);
  const visualNotesRef = useRef<VisualNote[]>([]);

  // Effect ID counter to ensure unique IDs
  const nextEffectIdRef = useRef(1);

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
    NativeAudioModule.createOscillatorInstrument(MAIN_CHANNEL, 'Main Synth', 16, 'sine');

    // Set initial ADSR
    NativeAudioModule.setADSR(MAIN_CHANNEL, 0.01, 0.1, 0.8, 0.3);

    return () => {
      // Cleanup: stop all notes and remove instruments
      NativeAudioModule.allNotesOffAllChannels();
    };
  }, []);

  // Toggle Filter
  const toggleFilter = () => {
    if (!filterEnabled) {
      NativeAudioModule.addEffect(MAIN_CHANNEL, 'filter');
      const effectId = nextEffectIdRef.current++;
      filterEffectIdRef.current = effectId;
      NativeAudioModule.setEffectParameter(
        MAIN_CHANNEL,
        effectId,
        'cutoff',
        filterCutoff,
      );
      NativeAudioModule.setEffectParameter(
        MAIN_CHANNEL,
        effectId,
        'resonance',
        filterResonance,
      );
      NativeAudioModule.setEffectParameter(
        MAIN_CHANNEL,
        effectId,
        'type',
        FILTER_TYPES.indexOf(filterType),
      );

      setFilterEnabled(true);
    } else {
      if (filterEffectIdRef.current !== null) {
        NativeAudioModule.removeEffect(MAIN_CHANNEL, filterEffectIdRef.current);
      }
      setFilterEnabled(false);
      filterEffectIdRef.current = null;
    }
  };

  // Update filter parameters
  useEffect(() => {
    if (filterEnabled && filterEffectIdRef.current !== null) {
      NativeAudioModule.setEffectParameter(
        MAIN_CHANNEL,
        filterEffectIdRef.current,
        'cutoff',
        filterCutoff,
      );
    }
  }, [filterCutoff, filterEnabled]);

  useEffect(() => {
    if (filterEnabled && filterEffectIdRef.current !== null) {
      NativeAudioModule.setEffectParameter(
        MAIN_CHANNEL,
        filterEffectIdRef.current,
        'resonance',
        filterResonance,
      );
    }
  }, [filterResonance, filterEnabled]);

  useEffect(() => {
    if (filterEnabled && filterEffectIdRef.current !== null) {
      const typeIndex = FILTER_TYPES.indexOf(filterType);
      NativeAudioModule.setEffectParameter(
        MAIN_CHANNEL,
        filterEffectIdRef.current,
        'type',
        typeIndex,
      );
    }
  }, [filterType, filterEnabled]);

  // Toggle Reverb
  const toggleReverb = () => {
    if (!reverbEnabled) {
      NativeAudioModule.addEffect(MAIN_CHANNEL, 'reverb');
      const effectId = nextEffectIdRef.current++;
      reverbEffectIdRef.current = effectId;

      NativeAudioModule.setEffectParameter(
        MAIN_CHANNEL,
        effectId,
        'roomSize',
        reverbRoomSize,
      );
      NativeAudioModule.setEffectParameter(
        MAIN_CHANNEL,
        effectId,
        'wetLevel',
        reverbWetLevel,
      );

      setReverbEnabled(true);
    } else {
      if (reverbEffectIdRef.current !== null) {
        NativeAudioModule.removeEffect(MAIN_CHANNEL, reverbEffectIdRef.current);
      }
      setReverbEnabled(false);
      reverbEffectIdRef.current = null;
    }
  };

  // Update reverb parameters
  useEffect(() => {
    if (reverbEnabled && reverbEffectIdRef.current !== null) {
      NativeAudioModule.setEffectParameter(
        MAIN_CHANNEL,
        reverbEffectIdRef.current,
        'roomSize',
        reverbRoomSize,
      );
    }
  }, [reverbRoomSize, reverbEnabled]);

  useEffect(() => {
    if (reverbEnabled && reverbEffectIdRef.current !== null) {
      NativeAudioModule.setEffectParameter(
        MAIN_CHANNEL,
        reverbEffectIdRef.current,
        'wetLevel',
        reverbWetLevel,
      );
    }
  }, [reverbWetLevel, reverbEnabled]);

  // Toggle Delay
  const toggleDelay = () => {
    if (!delayEnabled) {
      NativeAudioModule.addEffect(MAIN_CHANNEL, 'delay');
      const effectId = nextEffectIdRef.current++;
      delayEffectIdRef.current = effectId;

      NativeAudioModule.setEffectParameter(
        MAIN_CHANNEL,
        effectId,
        'delayTime',
        delayTime,
      );
      NativeAudioModule.setEffectParameter(
        MAIN_CHANNEL,
        effectId,
        'feedback',
        delayFeedback,
      );
      NativeAudioModule.setEffectParameter(
        MAIN_CHANNEL,
        effectId,
        'wetLevel',
        delayWetLevel,
      );

      setDelayEnabled(true);
    } else {
      if (delayEffectIdRef.current !== null) {
        NativeAudioModule.removeEffect(MAIN_CHANNEL, delayEffectIdRef.current);
      }
      setDelayEnabled(false);
      delayEffectIdRef.current = null;
    }
  };

  // Update delay parameters
  useEffect(() => {
    if (delayEnabled && delayEffectIdRef.current !== null) {
      NativeAudioModule.setEffectParameter(
        MAIN_CHANNEL,
        delayEffectIdRef.current,
        'delayTime',
        delayTime,
      );
    }
  }, [delayTime, delayEnabled]);

  useEffect(() => {
    if (delayEnabled && delayEffectIdRef.current !== null) {
      NativeAudioModule.setEffectParameter(
        MAIN_CHANNEL,
        delayEffectIdRef.current,
        'feedback',
        delayFeedback,
      );
    }
  }, [delayFeedback, delayEnabled]);

  useEffect(() => {
    if (delayEnabled && delayEffectIdRef.current !== null) {
      NativeAudioModule.setEffectParameter(
        MAIN_CHANNEL,
        delayEffectIdRef.current,
        'wetLevel',
        delayWetLevel,
      );
    }
  }, [delayWetLevel, delayEnabled]);

  const changeFilterType = () => {
    const currentIndex = FILTER_TYPES.indexOf(filterType);
    const nextIndex = (currentIndex + 1) % FILTER_TYPES.length;
    setFilterType(FILTER_TYPES[nextIndex]);
  };

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
          NativeAudioModule.noteOn(MAIN_CHANNEL, event.note, event.velocity);
          playbackActiveNotes.current.add(event.note);
        } else {
          NativeAudioModule.noteOff(MAIN_CHANNEL, event.note);
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
    NativeAudioModule.setWaveform(MAIN_CHANNEL, nextWave);
  };

  const changeGridSize = () => {
    const sizes: GridSize[] = ['4x4', '5x5', '6x6', '8x8'];
    const currentIndex = sizes.indexOf(gridSize);
    const nextIndex = (currentIndex + 1) % sizes.length;
    setGridSize(sizes[nextIndex]);
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

  const measureKey = (index: number, event: any) => {
    const { x, y, width, height } = event.nativeEvent.layout;
    const ref = keyRefsRef.current.get(index);
    if (ref) {
      ref.measureInWindow((pageX, pageY) => {
        keyLayoutsRef.current.set(index, {
          x: pageX,
          y: pageY,
          width,
          height,
        });
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

    const touches = event.nativeEvent.touches;

    for (let i = 0; i < touches.length; i++) {
      const touch = touches[i];
      const { pageX, pageY, identifier } = touch;
      const note = findNoteAtPosition(pageX, pageY);

      if (note !== null) {
        const touchId = String(identifier);

        if (!activeNotesRef.current.has(touchId)) {
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

  const renderTabContent = () => {
    switch (activeTab) {
      case 'instrument':
        return (
          <ScrollView
            style={styles.tabContent}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled={true}
          >
            <View style={styles.controlRow}>
              <Text style={styles.label}>Key: {selectedKey}</Text>
              <Button title="Change Key" onPress={changeKey} color="#6200ee" />
            </View>

            <View style={styles.controlRow}>
              <Text style={styles.label}>Scale: {scaleType}</Text>
              <Button
                title="Major/Minor"
                onPress={toggleScale}
                color="#6200ee"
              />
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
                    NativeAudioModule.setADSR(
                      MAIN_CHANNEL,
                      0.005,
                      0.1,
                      0.0,
                      0.2,
                    )
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
                    NativeAudioModule.setADSR(
                      MAIN_CHANNEL,
                      0.01,
                      0.05,
                      1.0,
                      0.4,
                    )
                  }
                />
              </View>
            </View>
          </ScrollView>
        );

      case 'filter':
        return (
          <ScrollView
            style={styles.tabContent}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled={true}
          >
            <View style={styles.effectHeader}>
              <Text style={styles.effectTitle}>Filter</Text>
              <Button
                title={filterEnabled ? 'ON' : 'OFF'}
                onPress={toggleFilter}
                color={filterEnabled ? '#4caf50' : '#757575'}
              />
            </View>

            {filterEnabled && (
              <>
                <View style={styles.controlRow}>
                  <Text style={styles.label}>Type: {filterType}</Text>
                  <Button
                    title="Change Type"
                    onPress={changeFilterType}
                    color="#6200ee"
                  />
                </View>

                <View style={styles.sliderContainer}>
                  <Text style={styles.sliderLabel}>
                    Cutoff: {Math.round(filterCutoff)} Hz
                  </Text>
                  <Slider
                    style={styles.slider}
                    minimumValue={20}
                    maximumValue={20000}
                    value={filterCutoff}
                    onValueChange={setFilterCutoff}
                    minimumTrackTintColor="#6200ee"
                    maximumTrackTintColor="#444"
                  />
                </View>

                <View style={styles.sliderContainer}>
                  <Text style={styles.sliderLabel}>
                    Resonance: {filterResonance.toFixed(2)}
                  </Text>
                  <Slider
                    style={styles.slider}
                    minimumValue={0.1}
                    maximumValue={10}
                    value={filterResonance}
                    onValueChange={setFilterResonance}
                    minimumTrackTintColor="#6200ee"
                    maximumTrackTintColor="#444"
                  />
                </View>
              </>
            )}
          </ScrollView>
        );

      case 'fx':
        return (
          <ScrollView
            style={styles.tabContent}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled={true}
          >
            {/* Reverb */}
            <View style={styles.effectSection}>
              <View style={styles.effectHeader}>
                <Text style={styles.effectTitle}>Reverb</Text>
                <Button
                  title={reverbEnabled ? 'ON' : 'OFF'}
                  onPress={toggleReverb}
                  color={reverbEnabled ? '#4caf50' : '#757575'}
                />
              </View>

              {reverbEnabled && (
                <>
                  <View style={styles.sliderContainer}>
                    <Text style={styles.sliderLabel}>
                      Room Size: {(reverbRoomSize * 100).toFixed(0)}%
                    </Text>
                    <Slider
                      style={styles.slider}
                      minimumValue={0}
                      maximumValue={1}
                      value={reverbRoomSize}
                      onValueChange={setReverbRoomSize}
                      minimumTrackTintColor="#6200ee"
                      maximumTrackTintColor="#444"
                    />
                  </View>

                  <View style={styles.sliderContainer}>
                    <Text style={styles.sliderLabel}>
                      Wet: {(reverbWetLevel * 100).toFixed(0)}%
                    </Text>
                    <Slider
                      style={styles.slider}
                      minimumValue={0}
                      maximumValue={1}
                      value={reverbWetLevel}
                      onValueChange={setReverbWetLevel}
                      minimumTrackTintColor="#6200ee"
                      maximumTrackTintColor="#444"
                    />
                  </View>
                </>
              )}
            </View>

            {/* Delay */}
            <View style={styles.effectSection}>
              <View style={styles.effectHeader}>
                <Text style={styles.effectTitle}>Delay</Text>
                <Button
                  title={delayEnabled ? 'ON' : 'OFF'}
                  onPress={toggleDelay}
                  color={delayEnabled ? '#4caf50' : '#757575'}
                />
              </View>

              {delayEnabled && (
                <>
                  <View style={styles.sliderContainer}>
                    <Text style={styles.sliderLabel}>
                      Delay Time: {Math.round(delayTime)} ms
                    </Text>
                    <Slider
                      style={styles.slider}
                      minimumValue={1}
                      maximumValue={2000}
                      value={delayTime}
                      onValueChange={setDelayTime}
                      minimumTrackTintColor="#6200ee"
                      maximumTrackTintColor="#444"
                    />
                  </View>

                  <View style={styles.sliderContainer}>
                    <Text style={styles.sliderLabel}>
                      Feedback: {(delayFeedback * 100).toFixed(0)}%
                    </Text>
                    <Slider
                      style={styles.slider}
                      minimumValue={0}
                      maximumValue={0.95}
                      value={delayFeedback}
                      onValueChange={setDelayFeedback}
                      minimumTrackTintColor="#6200ee"
                      maximumTrackTintColor="#444"
                    />
                  </View>

                  <View style={styles.sliderContainer}>
                    <Text style={styles.sliderLabel}>
                      Wet: {(delayWetLevel * 100).toFixed(0)}%
                    </Text>
                    <Slider
                      style={styles.slider}
                      minimumValue={0}
                      maximumValue={1}
                      value={delayWetLevel}
                      onValueChange={setDelayWetLevel}
                      minimumTrackTintColor="#6200ee"
                      maximumTrackTintColor="#444"
                    />
                  </View>
                </>
              )}
            </View>
          </ScrollView>
        );
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.contentContainer}>
        <Text style={styles.title}>Grid Synth</Text>

        {/* Tab Navigation */}
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'instrument' && styles.activeTab]}
            onPress={() => setActiveTab('instrument')}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === 'instrument' && styles.activeTabText,
              ]}
            >
              Instrument
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'filter' && styles.activeTab]}
            onPress={() => setActiveTab('filter')}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === 'filter' && styles.activeTabText,
              ]}
            >
              Filter
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'fx' && styles.activeTab]}
            onPress={() => setActiveTab('fx')}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === 'fx' && styles.activeTabText,
              ]}
            >
              FX
            </Text>
          </TouchableOpacity>
        </View>

        {/* Tab Content */}
        <View style={styles.tabContentContainer}>{renderTabContent()}</View>

        <View style={styles.midiVisualiser}>
          <MidiVisualizer
            height={50}
            width={Dimensions.get('window').width}
            notesRef={visualNotesRef}
          />
        </View>

        {/* Grid - Fixed position container */}
        <View style={styles.gridContainer}>
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
                      onLayout={measureKey}
                      isInScale={isInScale}
                    />
                  );
                })}
              </View>
            ))}
          </View>
        </View>

        {/* Footer with absolute positioning */}
        <View style={[styles.footer]} pointerEvents="box-none">
          {showRecordingButtons && (
            <View style={styles.footerButtons} pointerEvents="auto">
              {/* {isRecording && (
                <Text style={styles.recordingIndicator}>
                  ● Recording... {currentRecording.length} events
                </Text>
              )} */}
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
    flex: 1,
    paddingTop: 60,
  },
  title: {
    fontSize: 36,
    color: '#ffffff',
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 16,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#6200ee',
  },
  tabText: {
    color: '#888',
    fontSize: 16,
    fontWeight: '600',
  },
  activeTabText: {
    color: '#ffffff',
  },
  tabContentContainer: {
    height: 150,
  },
  tabContent: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    gap: 12,
    flexWrap: 'wrap',
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
  effectSection: {
    backgroundColor: '#1e1e1e',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  effectHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  effectTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  sliderContainer: {
    marginBottom: 12,
  },
  sliderLabel: {
    color: '#ffffff',
    fontSize: 14,
    marginBottom: 4,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  gridContainer: {
    width: '100%',
    marginTop: 8,
    aspectRatio: 1,
  },
  gridWrapper: {
    flex: 1,
    width: '100%',
  },
  gridRow: {
    flex: 1,
    flexDirection: 'row',
    gap: 1,
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
    // position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 50,
    paddingHorizontal: 16,
    // paddingVertical: 20,
    justifyContent: 'center',
    backgroundColor: 'transparent',
    // marginBottom: 16
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
    // paddingVertical: 16,
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
