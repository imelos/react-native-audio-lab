import React, { useEffect, useMemo } from 'react';
import { Canvas, Picture, Skia } from '@shopify/react-native-skia';
import Animated, {
  SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
} from 'react-native-reanimated';
import { StyleSheet, View } from 'react-native';
import { LoopSequence, pairNotes, NotePair } from '../utils/loopUtils';

export type VisualNote = {
  id: number;
  note: number;
  startTime: number;
  endTime?: number;
};

interface Props {
  width: number;
  height: number;
  notes: SharedValue<VisualNote[]>;
  playheadX?: SharedValue<number>;
  currentMusicalMs?: SharedValue<number>;
  sequence?: LoopSequence;
  /** Master loop duration — used to position live notes against the loop when overdubbing */
  loopDuration?: number;
}

const activePaint = Skia.Paint();
activePaint.setColor(Skia.Color('#3b82f6'));

const inactivePaint = Skia.Paint();
inactivePaint.setColor(Skia.Color('#60a5fa'));

/**
 * Compute unique pitches sorted descending and build a pitch → y-index map.
 * Uses plain objects instead of Map/Set for worklet compatibility.
 */
function buildPitchIndex(pitchSource: number[]): {
  pitches: number[];
  index: Record<number, number>;
} {
  'worklet';
  const seen: Record<number, boolean> = {};
  const pitches: number[] = [];
  for (let i = 0; i < pitchSource.length; i++) {
    const p = pitchSource[i];
    if (!seen[p]) {
      seen[p] = true;
      pitches.push(p);
    }
  }
  pitches.sort((a, b) => b - a);
  const index: Record<number, number> = {};
  for (let i = 0; i < pitches.length; i++) {
    index[pitches[i]] = i;
  }
  return { pitches, index };
}

export function MidiVisualizer({
  width,
  height,
  notes,
  playheadX,
  currentMusicalMs,
  sequence,
  loopDuration,
}: Props) {
  const fallbackShared = useSharedValue(0);
  const resolvedPlayheadX = playheadX ?? fallbackShared;

  const playheadAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: resolvedPlayheadX.value }],
  }));

  const recorder = useMemo(() => {
    return Skia.PictureRecorder();
  }, []);

  // Pre-compute sequence pairs on the JS thread when sequence changes.
  // Stored in a SharedValue so the worklet can access them reactively.
  const sequencePairs = useSharedValue<NotePair[]>([]);
  const sequenceDuration = useSharedValue(0);

  useEffect(() => {
    if (sequence && sequence.events.length > 0) {
      sequencePairs.value = pairNotes(sequence.events);
      sequenceDuration.value = sequence.duration;
    } else {
      sequencePairs.value = [];
      sequenceDuration.value = 0;
    }
  }, [sequence, sequencePairs, sequenceDuration]);

  // Compute rects reactively from SharedValue inputs — no RAF loop needed.
  const rectsData = useDerivedValue(() => {
    'worklet';
    const pairs = sequencePairs.value;
    const all = notes.value;
    const nowMs = currentMusicalMs ? currentMusicalMs.value : 0;

    // ── Playback mode (sequence exists) ──────────────────────────────────
    if (pairs.length > 0) {
      const dur = sequenceDuration.value;
      if (dur <= 0) return [];

      const pitchData = buildPitchIndex(pairs.map(p => p.note));
      const sliceH = height / Math.max(1, pitchData.pitches.length);

      // Build active-note lookup from live notes without endTime
      const activeMap: Record<number, boolean> = {};
      for (let i = 0; i < all.length; i++) {
        if (all[i].endTime == null) {
          activeMap[all[i].note] = true;
        }
      }

      return pairs.map(p => {
        const x = (p.start / dur) * width;
        const w = ((p.end - p.start) / dur) * width;
        const yIdx = pitchData.index[p.note] ?? 0;
        return {
          x,
          w,
          y: yIdx * sliceH,
          h: sliceH,
          active: !!activeMap[p.note],
        };
      });
    }

    // No notes at all → empty
    if (all.length === 0) return [];

    // ── Overdub mode (loopDuration provided) ─────────────────────────────
    if (loopDuration && loopDuration > 0) {
      const total = loopDuration;
      const pitchData = buildPitchIndex(all.map(n => n.note));
      const sliceH = height / Math.max(1, pitchData.pitches.length);

      return all.map(n => {
        const noteEnd = n.endTime ?? nowMs;
        const yIdx = pitchData.index[n.note] ?? 0;
        return {
          x: (n.startTime / total) * width,
          w: (Math.max(0, noteEnd - n.startTime) / total) * width,
          y: yIdx * sliceH,
          h: sliceH,
          active: n.endTime == null,
        };
      });
    }

    // ── Live recording mode (auto-scaling timeline) ──────────────────────
    let minStart = all[0].startTime;
    let maxEnd = all[0].endTime ?? nowMs;
    for (let i = 1; i < all.length; i++) {
      if (all[i].startTime < minStart) minStart = all[i].startTime;
      const e = all[i].endTime ?? nowMs;
      if (e > maxEnd) maxEnd = e;
    }
    const total = Math.max(1, maxEnd - minStart);

    const pitchData = buildPitchIndex(all.map(n => n.note));
    const sliceH = height / Math.max(1, pitchData.pitches.length);

    return all.map(n => {
      const noteEnd = n.endTime ?? nowMs;
      const yIdx = pitchData.index[n.note] ?? 0;
      return {
        x: ((n.startTime - minStart) / total) * width,
        w: ((noteEnd - n.startTime) / total) * width,
        y: yIdx * sliceH,
        h: sliceH,
        active: n.endTime == null,
      };
    });
  }, [sequencePairs, sequenceDuration, notes, currentMusicalMs, loopDuration]);

  const picture = useDerivedValue(() => {
    'worklet';
    const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, width, height));

    const rects = rectsData.value;
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (r.x + r.w > 0 && r.x < width) {
        canvas.drawRect(
          Skia.XYWHRect(r.x, r.y, r.w, r.h),
          r.active ? activePaint : inactivePaint,
        );
      }
    }

    return recorder.finishRecordingAsPicture();
  }, [rectsData]);

  return (
    <View style={{ width, height }}>
      <Canvas style={{ width, height }}>
        <Picture picture={picture} />
      </Canvas>
      {playheadX && (
        <View style={[styles.playHeadContainer, { width, height }]}>
          <Animated.View style={[styles.playhead, playheadAnimatedStyle]} />
        </View>
      )}
    </View>
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
