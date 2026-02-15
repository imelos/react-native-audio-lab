import React, { useEffect, useRef } from 'react';
import { Canvas, Picture, Skia } from '@shopify/react-native-skia';
import { useDerivedValue, useSharedValue } from 'react-native-reanimated';

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

const recorder = Skia.PictureRecorder();
const activePaint = Skia.Paint();
activePaint.setColor(Skia.Color('#3b82f6'));

const inactivePaint = Skia.Paint();
inactivePaint.setColor(Skia.Color('#60a5fa'));

type RectData = {
  x: number;
  y: number;
  w: number;
  h: number;
  active: boolean;
};

export function MidiVisualizer({ width, height, notesRef }: Props) {
  const recordingStartRef = useRef<number | null>(null);
  const pitchIndexRef = useRef<Map<number, number>>(new Map());
  const prevNotesCount = useRef(0);
  const rectsData = useSharedValue<RectData[]>([]);

  useEffect(() => {
    let raf: number;
    const loop = () => {
      const now = Date.now();
      const all = notesRef.current;

      if (all.length === 0) {
        rectsData.value = [];
        recordingStartRef.current = null;
        prevNotesCount.current = 0;
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
      const sliceH = height / pitchIndexRef.current.size;

      // Build rectangles
      rectsData.value = all.map(n => {
        const noteEnd = n.endTime ?? now;
        const yIndex = pitchIndexRef.current.get(n.note) ?? 0;
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
  }, [width, height, notesRef, rectsData]);

  const picture = useDerivedValue(() => {
    'worklet';
    const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, width, height));

    rectsData.value.forEach(r => {
      canvas.drawRect(
        Skia.XYWHRect(r.x, r.y, r.w, r.h),
        r.active ? activePaint : inactivePaint,
      );
    });

    return recorder.finishRecordingAsPicture();
  }, [width, height]);

  return (
    <Canvas style={{ width, height }}>
      <Picture picture={picture} />
    </Canvas>
  );
}
