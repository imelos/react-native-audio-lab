import React, { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
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
  notesRef: React.RefObject<VisualNote[]>;
  activeRef: React.RefObject<Map<number, VisualNote>>;
}

export function MidiVisualizer({ width, height, notesRef, activeRef }: Props) {
  const rects = useSharedValue<any[]>([]);
  const recordingStartRef = useRef<number | null>(null);

  useEffect(() => {
    let raf: number;

    const loop = () => {
      const now = Date.now();
      const all = [...notesRef.current, ...activeRef.current.values()];

      if (all.length === 0) {
        raf = requestAnimationFrame(loop);
        return;
      }

      // Keep earliest note start as reference
      if (recordingStartRef.current == null) {
        recordingStartRef.current = Math.min(...all.map(n => n.startTime));
      }
      const start = recordingStartRef.current;
      const end = Math.max(...all.map(n => n.endTime ?? now));
      const total = Math.max(1, end - start);

      // Map pitches to fixed vertical positions
      const uniquePitches = Array.from(new Set(all.map(n => n.note))).sort(
        (a, b) => b - a,
      );
      const pitchIndex = new Map<number, number>();
      uniquePitches.forEach((p, i) => pitchIndex.set(p, i));
      const sliceH = height / uniquePitches.length;

      // Build rectangles
      rects.value = all.map(n => {
        const noteEnd = n.endTime ?? now;
        const yIndex = pitchIndex.get(n.note) ?? 0;

        return {
          x: ((n.startTime - start) / total) * width,
          w: ((noteEnd - n.startTime) / total) * width,
          y: yIndex * sliceH,
          h: sliceH,
          active: !n.endTime,
        };
      });

      raf = requestAnimationFrame(loop);
    };

    loop();
    return () => cancelAnimationFrame(raf);
  }, [notesRef, activeRef, width, height]);

  return (
    <View style={{ width, height }}>
      <Canvas style={{ flex: 1 }}>
        {rects.value.map((r, i) => (
          <Rect
            key={`${r.note}-${i}`}
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
