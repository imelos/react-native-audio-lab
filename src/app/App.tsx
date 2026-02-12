import React, { useState, useRef, useEffect } from 'react';
import { View, Pressable, StyleSheet, Text, Button } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import NativeAudioModule from '../specs/NativeAudioModule';

const WAVEFORMS = ['sine', 'saw', 'square', 'triangle'] as const;
type Waveform = (typeof WAVEFORMS)[number];

const GRID_CONFIGS = {
  '4x4': { rows: 4, cols: 4 },
  '5x5': { rows: 5, cols: 5 },
  '6x6': { rows: 6, cols: 6 },
  '8x8': { rows: 8, cols: 8 },
} as const;

type GridSize = keyof typeof GRID_CONFIGS;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface GridPadProps {
  note: number;
  index: number;
  activeNotes: Set<number>;
  setRef: (index: number, ref: View | null) => void;
}

function GridPad({ note, index, activeNotes, setRef }: GridPadProps) {
  const isActive = activeNotes.has(note);
  const scale = useSharedValue(1);
  const backgroundColor = useSharedValue(0);

  useEffect(() => {
    scale.value = withSpring(isActive ? 1.05 : 1, {
      damping: 15,
      stiffness: 150,
    });
    backgroundColor.value = withTiming(isActive ? 1 : 0, { duration: 0 });
  }, [isActive]);

  const animatedStyle = useAnimatedStyle(() => ({
    // transform: [{ scale: scale.value }],
    backgroundColor: backgroundColor.value === 1 ? '#6200ee' : '#2a2a2a',
  }));

  return (
    <AnimatedPressable
      ref={ref => setRef(index, ref as any)}
      style={[styles.gridPad, animatedStyle]}
    >
      <Text style={[styles.noteText, isActive && styles.noteTextActive]}>
        {midiToNoteName(note)}
      </Text>
    </AnimatedPressable>
  );
}

export default function App() {
  const [currentWaveform, setCurrentWaveform] = useState<Waveform>('sine');
  const [gridSize, setGridSize] = useState<GridSize>('5x5');
  const [baseNote, setBaseNote] = useState(48); // C3

  // Track multiple active notes
  const activeNotesRef = useRef<Map<string, number>>(new Map()); // touchId -> note
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());

  const keyRefsRef = useRef<Map<number, View>>(new Map());
  const keyLayoutsRef = useRef<
    Map<number, { x: number; y: number; width: number; height: number }>
  >(new Map());

  const { rows, cols } = GRID_CONFIGS[gridSize];
  const totalPads = rows * cols;

  // Generate notes for the grid
  const gridNotes = Array.from({ length: totalPads }, (_, i) => baseNote + i);

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
    // Clear measurements when grid changes
    keyLayoutsRef.current.clear();
    keyRefsRef.current.clear();
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
    // Measure all pads on first touch
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

        // Only trigger if not already playing
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

    // Track which notes are currently being touched
    const currentTouchedNotes = new Map<string, number>();

    for (let i = 0; i < touches.length; i++) {
      const touch = touches[i];
      const { pageX, pageY, identifier } = touch;
      const note = findNoteAtPosition(pageX, pageY);

      if (note !== null) {
        const touchId = String(identifier);
        const previousNote = activeNotesRef.current.get(touchId);

        // Only trigger if this touch moved to a different note
        if (previousNote !== note) {
          // Stop previous note for this touch
          if (previousNote !== undefined) {
            NativeAudioModule.noteOff(previousNote);
          }
          // Start new note
          NativeAudioModule.noteOn(note, 0.85);
        }

        currentTouchedNotes.set(touchId, note);
      }
    }

    // Stop notes that are no longer being touched
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

    // Keep only the touches that are still active
    for (let i = 0; i < touches.length; i++) {
      const touch = touches[i];
      const { pageX, pageY, identifier } = touch;
      const note = findNoteAtPosition(pageX, pageY);

      if (note !== null) {
        remainingTouches.set(String(identifier), note);
      }
    }

    // Stop notes that are no longer being touched
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
      <Text style={styles.title}>Grid Synth</Text>

      {/* Controls */}
      <View style={styles.controlRow}>
        <Text style={styles.label}>Grid: {gridSize}</Text>
        <Button title="Change Grid" onPress={changeGridSize} color="#6200ee" />
      </View>

      <View style={styles.controlRow}>
        <Text style={styles.label}>Waveform: {currentWaveform}</Text>
        <Button title="Change Wave" onPress={changeWaveform} color="#6200ee" />
      </View>

      <View style={styles.controlRow}>
        <Text style={styles.label}>Base Note: {midiToNoteName(baseNote)}</Text>
        <View style={styles.buttonGroup}>
          <Button
            title="-12"
            onPress={() => setBaseNote(n => Math.max(24, n - 12))}
          />
          <Button
            title="+12"
            onPress={() => setBaseNote(n => Math.min(84, n + 12))}
          />
        </View>
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

      {/* Grid with flex layout */}
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
              return (
                <GridPad
                  key={`${gridSize}-${index}`}
                  note={note}
                  index={index}
                  activeNotes={activeNotes}
                  setRef={setRef}
                />
              );
            })}
          </View>
        ))}
      </View>

      <View style={{ height: 60 }} />
    </View>
  );
}

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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
    paddingTop: 60,
  },
  title: {
    fontSize: 36,
    color: '#ffffff',
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 32,
  },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
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
    // flex: 1,
    marginTop: 20,
    aspectRatio: 1,
    width: '100%',
    // alignSelf: 'center',
  },
  gridRow: {
    flex: 1,
    flexDirection: 'row',
    gap: 1,
    height: 70,
  },
  gridPad: {
    flex: 1,
    aspectRatio: 1, // This ensures each pad is always square
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
});
