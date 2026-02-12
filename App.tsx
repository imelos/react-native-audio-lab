import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Pressable,
  StyleSheet,
  Text,
  Button,
  ScrollView,
  Dimensions,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import NativeAudioModule from './src/specs/NativeAudioModule';

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
  onPress: (note: number) => void;
  onRelease: () => void;
  activeNote: number | null;
  setRef: (index: number, ref: View | null) => void;
}

function GridPad({
  note,
  index,
  onPress,
  onRelease,
  activeNote,
  setRef,
}: GridPadProps) {
  const isActive = activeNote === note;
  const scale = useSharedValue(1);
  const backgroundColor = useSharedValue(0);

  useEffect(() => {
    scale.value = withSpring(isActive ? 1.05 : 1, {
      damping: 15,
      stiffness: 150,
    });
    backgroundColor.value = withTiming(isActive ? 1 : 0, { duration: 100 });
  }, [isActive]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    backgroundColor: backgroundColor.value === 1 ? '#6200ee' : '#2a2a2a',
  }));

  return (
    <AnimatedPressable
      ref={ref => setRef(index, ref as any)}
      style={[styles.gridPad, animatedStyle]}
      onTouchStart={() => onPress(note)}
      onTouchEnd={onRelease}
    >
      <Text style={[styles.noteText, isActive && styles.noteTextActive]}>
        {note}
      </Text>
    </AnimatedPressable>
  );
}

export default function App() {
  const [currentWaveform, setCurrentWaveform] = useState<Waveform>('sine');
  const [gridSize, setGridSize] = useState<GridSize>('5x5');
  const [baseNote, setBaseNote] = useState(48); // C3

  const activeNoteRef = useRef<number | null>(null);
  const [activeNote, setActiveNote] = useState<number | null>(null);
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

  const handleTouchStart = (note: number) => {
    // Measure all pads on first touch
    if (keyLayoutsRef.current.size === 0) {
      gridNotes.forEach((_, index) => measureKey(index));
    }

    if (activeNoteRef.current !== null) {
      NativeAudioModule.noteOff(activeNoteRef.current);
    }
    NativeAudioModule.noteOn(note, 0.85);
    activeNoteRef.current = note;
    setActiveNote(note);
  };

  const handleTouchMove = (event: any) => {
    const { pageX, pageY } = event.nativeEvent;
    const note = findNoteAtPosition(pageX, pageY);

    if (note !== null && note !== activeNoteRef.current) {
      // Stop previous note
      if (activeNoteRef.current !== null) {
        NativeAudioModule.noteOff(activeNoteRef.current);
      }
      // Start new note
      NativeAudioModule.noteOn(note, 0.85);
      activeNoteRef.current = note;
      setActiveNote(note);
    }
  };

  const handleTouchEnd = () => {
    if (activeNoteRef.current !== null) {
      NativeAudioModule.noteOff(activeNoteRef.current);
      activeNoteRef.current = null;
      setActiveNote(null);
    }
  };

  const setRef = (index: number, ref: View | null) => {
    if (ref) {
      keyRefsRef.current.set(index, ref);
    }
  };

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
        <Text style={styles.label}>Base Note: {baseNote}</Text>
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

      {/* Grid */}
      <View
        style={[styles.gridContainer]}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {gridNotes.map((note, index) => (
          <GridPad
            key={`${gridSize}-${index}`}
            note={note}
            index={index}
            onPress={handleTouchStart}
            onRelease={handleTouchEnd}
            activeNote={activeNote}
            setRef={setRef}
          />
        ))}
      </View>

      <View style={{ height: 60 }} />
    </View>
  );
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
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignSelf: 'center',
    paddingHorizontal: 16,
    gap: 8,
    marginTop: 20,
  },
  gridPad: {
    width: 70,
    height: 70,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
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
