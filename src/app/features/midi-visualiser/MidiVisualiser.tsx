import React, { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { Canvas, Rect } from '@shopify/react-native-skia';

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

      if (recordingStartRef.current == null) {
        recordingStartRef.current = Math.min(...all.map(n => n.startTime));
      }

      const start = recordingStartRef.current;
      const end = Math.max(...all.map(n => n.endTime ?? now));
      const total = Math.max(1, end - start);

      // 🔹 vertical stacking by pitch
      const sorted = [...all].sort((a, b) => b.note - a.note);
      const sliceH = height / sorted.length;

      rects.value = sorted.map((n, i) => {
        const noteEnd = n.endTime ?? now;

        return {
          x: ((n.startTime - start) / total) * width,
          w: ((noteEnd - n.startTime) / total) * width,
          y: i * sliceH,
          h: sliceH,
          active: !n.endTime,
        };
      });

      raf = requestAnimationFrame(loop);
    };

    loop();
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <View style={{ width, height }}>
      <Canvas style={{ flex: 1 }}>
        {rects.value.map((r, i) => (
          <Rect
            key={i}
            x={r.x}
            y={r.y}
            width={Math.max(1, r.w)}
            height={r.h}
            color={r.active ? '#7C4DFF' : '#444'}
          />
        ))}
      </Canvas>
    </View>
  );
}

export type VisualNote = {
  id: number;
  note: number;
  startTime: number;
  endTime?: number;
};
