import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Canvas, Rect } from '@shopify/react-native-skia';

export type VisualNote = {
  id: number;
  note: number;
  startTime: number;
  endTime?: number;
};

interface Props {
  width: number;
  height: number;
  notesRef: React.MutableRefObject<VisualNote[]>;
}

export function MidiVisualizer({ width, height, notesRef }: Props) {
  const [, setTick] = useState(0); // Force re-renders
  const rectsRef = useRef<any[]>([]);
  const recordingStartRef = useRef<number | null>(null);
  const pitchIndexRef = useRef<Map<number, number>>(new Map());
  const prevNotesCount = useRef<number>(0);

  useEffect(() => {
    let raf: number;

    const loop = () => {
      const now = Date.now();
      const all = notesRef.current;

      if (all.length === 0) {
        rectsRef.current = [];
        recordingStartRef.current = null;
        prevNotesCount.current = 0;
        setTick(t => t + 1); // Trigger re-render
        raf = requestAnimationFrame(loop);
        return;
      }

      // Only recalculate pitch mapping when note count changes
      if (all.length !== prevNotesCount.current) {
        prevNotesCount.current = all.length;

        const uniquePitches = Array.from(new Set(all.map(n => n.note))).sort(
          (a, b) => b - a,
        );
        pitchIndexRef.current.clear();
        uniquePitches.forEach((p, i) => pitchIndexRef.current.set(p, i));
      }

      // Keep earliest note start as reference
      if (recordingStartRef.current == null) {
        recordingStartRef.current = Math.min(...all.map(n => n.startTime));
      }
      const start = recordingStartRef.current;
      const end = Math.max(...all.map(n => n.endTime ?? now));
      const total = Math.max(1, end - start);

      const sliceH = height / Math.max(1, pitchIndexRef.current.size);

      // Build rectangles
      rectsRef.current = all.map(n => {
        const noteEnd = n.endTime ?? now;
        const yIndex = pitchIndexRef.current.get(n.note) ?? 0;

        return {
          x: ((n.startTime - start) / total) * width,
          w: ((noteEnd - n.startTime) / total) * width,
          y: yIndex * sliceH,
          h: sliceH,
          active: !n.endTime,
          id: n.id,
        };
      });

      setTick(t => t + 1); // Trigger re-render every frame
      raf = requestAnimationFrame(loop);
    };

    loop();
    return () => cancelAnimationFrame(raf);
  }, [width, height, notesRef]);

  return (
    <View style={{ width, height }}>
      <Canvas style={{ flex: 1 }}>
        {rectsRef.current.map(r => (
          <Rect
            key={r.id}
            x={r.x}
            y={r.y}
            width={Math.max(1, r.w)}
            height={r.h}
            color={r.active ? '#7C4DFF' : '#7c4dff64'}
          />
        ))}
      </Canvas>
    </View>
  );
}
