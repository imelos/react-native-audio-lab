import React, { useState, useRef, useEffect } from 'react';
import { View, StyleSheet, Text, Button } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  // withSpring,
  withTiming,
} from 'react-native-reanimated';
import NativeAudioModule from '../specs/NativeAudioModule';
import { AnimatedView } from 'react-native-reanimated/lib/typescript/component/View';

const WAVEFORMS = ['sine', 'saw', 'square', 'triangle'] as const;
type Waveform = (typeof WAVEFORMS)[number];

const GRID_CONFIGS = {
  '4x4': { rows: 4, cols: 4 },
  '5x5': { rows: 5, cols: 5 },
  '6x6': { rows: 6, cols: 6 },
  '8x8': { rows: 8, cols: 8 },
} as const;

type GridSize = keyof typeof GRID_CONFIGS;

// Musical keys (root notes)
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

// Scale types with their interval patterns (semitones from root)
const SCALES = {
  Major: [0, 2, 4, 5, 7, 9, 11],
  Minor: [0, 2, 3, 5, 7, 8, 10],
} as const;

type ScaleType = keyof typeof SCALES;

// Convert MIDI note number to note name
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

// Generate scale notes from a root note
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

// const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

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
  // const scale = useSharedValue(1);
  const backgroundColor = useSharedValue(0);

  useEffect(() => {
    // scale.value = withSpring(isActive ? 1.05 : 1, {
    //   damping: 15,
    //   stiffness: 150,
    // });
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

  const keyRefsRef = useRef<Map<number, View>>(new Map());
  const keyLayoutsRef = useRef<
    Map<number, { x: number; y: number; width: number; height: number }>
  >(new Map());

  const { rows, cols } = GRID_CONFIGS[gridSize];
  const totalPads = rows * cols;

  // Calculate root note MIDI number (C3 = 48)
  const baseOctave = 3;
  const keyOffset = KEYS.indexOf(selectedKey);
  const rootNote = 12 * (baseOctave + 1) + keyOffset; // C3 = 48

  // Generate notes for the grid based on scale
  const gridNotes = useScale
    ? generateScale(rootNote, scaleType, totalPads)
    : Array.from({ length: totalPads }, (_, i) => rootNote + i);

  // For visual feedback on chromatic mode
  const scaleNotes = new Set(generateScale(rootNote, scaleType, 88)); // All scale notes

  const changeWaveform = () => {
    const currentIndex = WAVEFORMS.indexOf(currentWaveform);
    const nextIndex = (currentIndex + 1) % WAVEFORMS.length;
    const nextWave = WAVEFORMS[nextIndex];

    setCurrentWaveform(nextWave);
    NativeAudioModule.setWaveform(nextWave);
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
    setActiveNotes(new Set(activeNotesRef.current.values()));
  };

  const handleTouchStart = (event: any) => {
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
          NativeAudioModule.noteOn(note, 0.85);
          activeNotesRef.current.set(touchId, note);
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
            NativeAudioModule.noteOff(previousNote);
          }
          NativeAudioModule.noteOn(note, 0.85);
        }

        currentTouchedNotes.set(touchId, note);
      }
    }

    for (const [touchId, note] of activeNotesRef.current.entries()) {
      if (!currentTouchedNotes.has(touchId)) {
        NativeAudioModule.noteOff(note);
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
        NativeAudioModule.noteOff(note);
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

  // Create rows for flex layout
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

        {/* Grid Controls */}
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
              onPress={() => NativeAudioModule.setADSR(0.005, 0.1, 0.0, 0.2)}
            />
            <Button
              title="Pad"
              onPress={() => NativeAudioModule.setADSR(0.3, 1.5, 0.7, 2.0)}
            />
            <Button
              title="Organ"
              onPress={() => NativeAudioModule.setADSR(0.01, 0.05, 1.0, 0.4)}
            />
          </View>
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

        <View style={{ height: 60 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
});
