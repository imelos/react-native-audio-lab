import React, { useEffect, useRef } from 'react';
import { Canvas, Picture, Skia } from '@shopify/react-native-skia';
import Animated, {
  SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
} from 'react-native-reanimated';
import { StyleSheet, View } from 'react-native';
import performance from 'react-native-performance';
import { LoopSequence } from '../Player';

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
  playheadX?: SharedValue<number>;
  currentMusicalMs?: SharedValue<number>;
  sequence?: LoopSequence;
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

export function MidiVisualizer({
  width,
  height,
  notesRef,
  playheadX,
  currentMusicalMs,
  sequence,
}: Props) {
  const recordingStartRef = useRef<number | null>(null);
  const pitchIndexRef = useRef<Map<number, number>>(new Map());
  const rectsData = useSharedValue<RectData[]>([]);
  const fallbackShared = useSharedValue(0);
  const resolvedPlayheadX = playheadX ?? fallbackShared;

  const playheadAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: resolvedPlayheadX.value }],
  }));

  useEffect(() => {
    let raf: number;
    let lastPitchCount = 0;

    const loop = () => {
      const now = performance.now();
      const all = notesRef.current;

      if (all.length === 0 && !(sequence && sequence.events.length > 0)) {
        rectsData.value = [];
        raf = requestAnimationFrame(loop);
        return;
      }

      // Recompute pitch index EVERY FRAME if unique pitches changed
      // (cheap, since Set + sort is fast for <50 notes)
      const pitchSource =
        sequence && sequence.events.length > 0
          ? sequence.events.filter(e => e.type === 'noteOn').map(e => e.note)
          : all.map(n => n.note);
      const uniquePitches = Array.from(new Set(pitchSource)).sort(
        (a, b) => b - a,
      );
      const currentPitchCount = uniquePitches.length;

      if (currentPitchCount !== lastPitchCount) {
        pitchIndexRef.current.clear();
        uniquePitches.forEach((p, i) => pitchIndexRef.current.set(p, i));
        lastPitchCount = currentPitchCount;
      }

      const sliceH = height / Math.max(1, currentPitchCount);

      // Use sequence if available (playback mode), else fallback (live)
      let newRects: RectData[] = [];

      if (sequence && sequence.events.length > 0) {
        // Playback mode – use normalized timestamps (preferred)
        const activeNotes = new Set(
          all.filter(n => !n.endTime).map(n => n.note),
        );

        newRects = sequence.events
          .filter(e => e.type === 'noteOn') // only draw from noteOn
          .map(noteOn => {
            const noteOff = sequence.events.find(
              later =>
                later.type === 'noteOff' &&
                later.note === noteOn.note &&
                later.timestamp > noteOn.timestamp,
            );

            const startMs = noteOn.timestamp;
            const endMs = noteOff ? noteOff.timestamp : sequence.duration;

            const x = (startMs / sequence.duration) * width;
            const w = ((endMs - startMs) / sequence.duration) * width;

            const yIndex = pitchIndexRef.current.get(noteOn.note) ?? 0;

            return {
              x,
              w,
              y: yIndex * sliceH,
              h: sliceH,
              active: activeNotes.has(noteOn.note),
            };
          });
      } else {
        // Live recording mode – use visual times
        if (recordingStartRef.current == null) {
          recordingStartRef.current = Math.min(...all.map(n => n.startTime));
        }

        const visualStart = recordingStartRef.current;
        const visualEnd = Math.max(...all.map(n => n.endTime ?? now));
        const total = Math.max(1, visualEnd - visualStart);

        newRects = all.map(n => {
          const noteEnd = n.endTime ?? now;
          const yIndex = pitchIndexRef.current.get(n.note) ?? 0;

          return {
            x: ((n.startTime - visualStart) / total) * width,
            w: ((noteEnd - n.startTime) / total) * width,
            y: yIndex * sliceH,
            h: sliceH,
            active: !n.endTime,
          };
        });
      }

      rectsData.value = newRects;
      raf = requestAnimationFrame(loop);
    };

    loop();
    return () => cancelAnimationFrame(raf);
  }, [width, height, notesRef, sequence, currentMusicalMs, rectsData]);

  const picture = useDerivedValue(() => {
    'worklet';
    const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, width, height));

    rectsData.value.forEach(r => {
      if (r.x + r.w > 0 && r.x < width) {
        // simple clip to avoid off-screen draws
        canvas.drawRect(
          Skia.XYWHRect(r.x, r.y, r.w, r.h),
          r.active ? activePaint : inactivePaint,
        );
      }
    });

    return recorder.finishRecordingAsPicture();
  }, [rectsData]);

  return (
    <>
      <Canvas style={{ width, height }}>
        <Picture picture={picture} />
      </Canvas>
      {playheadX && (
        <View style={[styles.playHeadContainer, { width, height }]}>
          <Animated.View style={[styles.playhead, playheadAnimatedStyle]} />
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  playHeadContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  playhead: {
    width: 2,
    height: '100%',
    backgroundColor: '#8c48d5',
    opacity: 0.9,
  },
});
