import React, {
  useRef,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from 'react';
import {View, StyleSheet, Text} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import {AnimatedView} from 'react-native-reanimated/lib/typescript/component/View';

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

interface GridPadHandle {
  setActive: (active: boolean) => void;
  view: View | null;
}

interface GridPadProps {
  note: number;
  index: number;
  onLayout: (index: number, event: any) => void;
  isInScale?: boolean;
}

const GridPad = forwardRef<GridPadHandle, GridPadProps>(
  ({note, index, onLayout, isInScale = true}, ref) => {
    const backgroundColor = useSharedValue(0);
    const viewRef = useRef<View>(null);

    useImperativeHandle(ref, () => ({
      setActive: (active: boolean) => {
        backgroundColor.value = withTiming(active ? 1 : 0, {duration: 0});
      },
      view: viewRef.current,
    }));

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
        ref={(r: AnimatedView) => {
          viewRef.current = r;
        }}
        style={[styles.gridPad, animatedStyle]}
        onLayout={event => onLayout(index, event)}>
        <Text
          style={[styles.noteText, !isInScale && styles.noteTextOutOfScale]}>
          {midiToNoteName(note)}
        </Text>
      </Animated.View>
    );
  },
);

export interface GridHandle {
  setPadActive: (note: number, active: boolean) => void;
}

export interface GridProps {
  gridNotes: number[];
  rows: number;
  cols: number;
  gridSize: string;
  useScale: boolean;
  scaleNotes: Set<number>;
  onNoteOn: (note: number, velocity: number) => void;
  onNoteOff: (note: number) => void;
}

const Grid = forwardRef<GridHandle, GridProps>(
  (
    {gridNotes, rows, cols, gridSize, useScale, scaleNotes, onNoteOn, onNoteOff},
    ref,
  ) => {
    const gridPadHandlesRef = useRef<Map<number, GridPadHandle>>(new Map());
    const touchNotesRef = useRef<Map<string, number>>(new Map());
    const keyLayoutsRef = useRef<
      Map<number, {x: number; y: number; width: number; height: number}>
    >(new Map());

    const setPadActive = useCallback((note: number, active: boolean) => {
      const handle = gridPadHandlesRef.current.get(note);
      if (handle) {
        handle.setActive(active);
      }
    }, []);

    useImperativeHandle(ref, () => ({
      setPadActive,
    }));

    const measureKey = useCallback(
      (index: number, event: any) => {
        const {width, height} = event.nativeEvent.layout;
        const note = gridNotes[index];
        const handle = gridPadHandlesRef.current.get(note);

        if (handle?.view) {
          handle.view.measureInWindow((pageX, pageY) => {
            keyLayoutsRef.current.set(index, {
              x: pageX,
              y: pageY,
              width,
              height,
            });
          });
        }
      },
      [gridNotes],
    );

    const findNoteAtPosition = useCallback(
      (pageX: number, pageY: number): number | null => {
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
      },
      [gridNotes],
    );

    const handleTouchStart = useCallback(
      (event: any) => {
        const touches = event.nativeEvent.touches;

        for (let i = 0; i < touches.length; i++) {
          const touch = touches[i];
          const {pageX, pageY, identifier} = touch;
          const note = findNoteAtPosition(pageX, pageY);

          if (note !== null) {
            const touchId = String(identifier);

            if (!touchNotesRef.current.has(touchId)) {
              setPadActive(note, true);
              touchNotesRef.current.set(touchId, note);
              onNoteOn(note, 0.85);
            }
          }
        }
      },
      [findNoteAtPosition, setPadActive, onNoteOn],
    );

    const handleTouchMove = useCallback(
      (event: any) => {
        const touches = event.nativeEvent.touches;
        const currentTouchedNotes = new Map<string, number>();

        for (let i = 0; i < touches.length; i++) {
          const touch = touches[i];
          const {pageX, pageY, identifier} = touch;
          const note = findNoteAtPosition(pageX, pageY);

          if (note !== null) {
            const touchId = String(identifier);
            const previousNote = touchNotesRef.current.get(touchId);

            if (previousNote !== note) {
              if (previousNote !== undefined) {
                setPadActive(previousNote, false);
                onNoteOff(previousNote);
              }
              setPadActive(note, true);
              onNoteOn(note, 0.85);
            }

            currentTouchedNotes.set(touchId, note);
          }
        }

        for (const [touchId, note] of touchNotesRef.current.entries()) {
          if (!currentTouchedNotes.has(touchId)) {
            setPadActive(note, false);
            onNoteOff(note);
          }
        }

        touchNotesRef.current = currentTouchedNotes;
      },
      [findNoteAtPosition, setPadActive, onNoteOn, onNoteOff],
    );

    const handleTouchEnd = useCallback(
      (event: any) => {
        const touches = event.nativeEvent.touches;
        const remainingTouches = new Map<string, number>();

        for (let i = 0; i < touches.length; i++) {
          const touch = touches[i];
          const {pageX, pageY, identifier} = touch;
          const note = findNoteAtPosition(pageX, pageY);

          if (note !== null) {
            remainingTouches.set(String(identifier), note);
          }
        }

        for (const [touchId, note] of touchNotesRef.current.entries()) {
          if (!remainingTouches.has(touchId)) {
            setPadActive(note, false);
            onNoteOff(note);
          }
        }

        touchNotesRef.current = remainingTouches;
      },
      [findNoteAtPosition, setPadActive, onNoteOff],
    );

    const setGridPadRef = useCallback(
      (index: number, handle: GridPadHandle | null) => {
        if (handle) {
          const note = gridNotes[index];
          gridPadHandlesRef.current.set(note, handle);
        }
      },
      [gridNotes],
    );

    const gridRows = [];
    for (let i = 0; i < rows; i++) {
      const rowPads = gridNotes.slice(i * cols, (i + 1) * cols);
      gridRows.push(rowPads);
    }

    return (
      <View style={styles.gridContainer}>
        <View
          style={styles.gridWrapper}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}>
          {gridRows.map((rowPads, rowIndex) => (
            <View key={`row-${rowIndex}`} style={styles.gridRow}>
              {rowPads.map((note, colIndex) => {
                const index = rowIndex * cols + colIndex;
                const isInScale = useScale || scaleNotes.has(note);
                return (
                  <GridPad
                    ref={handle => setGridPadRef(index, handle)}
                    key={`${gridSize}-${index}`}
                    note={note}
                    index={index}
                    onLayout={measureKey}
                    isInScale={isInScale}
                  />
                );
              })}
            </View>
          ))}
        </View>
      </View>
    );
  },
);

export default Grid;

const styles = StyleSheet.create({
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
  noteTextOutOfScale: {
    color: '#666666',
  },
});
