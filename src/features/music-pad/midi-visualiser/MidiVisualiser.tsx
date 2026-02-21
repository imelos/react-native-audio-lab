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
  notes?: SharedValue<VisualNote[]>;
  playheadX?: SharedValue<number>;
  currentMusicalMs?: SharedValue<number>;
  sequence?: LoopSequence;
  /** Master loop duration — used to position live notes against the loop when overdubbing */
  loopDuration?: number;
  color: string;
}

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
  color = '#6200ee',
}: Props) {
  const emptyNotes = useSharedValue<VisualNote[]>([]);
  const resolvedNotes = notes ?? emptyNotes;
  const fallbackShared = useSharedValue(0);
  const resolvedPlayheadX = playheadX ?? fallbackShared;

  const playheadAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: resolvedPlayheadX.value }],
  }));

  const recorder = useMemo(() => {
    return Skia.PictureRecorder();
  }, []);

  const activePaint = useMemo(() => {
    const _activePaint = Skia.Paint();
    _activePaint.setColor(Skia.Color(color));
    return _activePaint;
  }, [color]);

  const inactivePaint = useMemo(() => {
    const _inactivePaint = Skia.Paint();
    _inactivePaint.setColor(Skia.Color(desaturate(color, 0.4)));
    return _inactivePaint;
  }, [color]);

  // Pre-compute sequence pairs synchronously when sequence changes.
  const pairs = useMemo(
    () => (sequence ? pairNotes(sequence.events) : []),
    [sequence],
  );
  const sequencePairs = useSharedValue<NotePair[]>(pairs);
  const sequenceDuration = useSharedValue(sequence?.duration ?? 0);

  useEffect(() => {
    sequencePairs.value = pairs;
    sequenceDuration.value = sequence?.duration ?? 0;
  }, [pairs, sequence, sequencePairs, sequenceDuration]);

  // Pitch layout — only recomputes when notes or sequence pairs change,
  // NOT on every currentMusicalMs tick.
  const pitchLayout = useDerivedValue(() => {
    'worklet';
    const sp = sequencePairs.value;
    const all = resolvedNotes.value;
    const source = sp.length > 0 ? sp.map(p => p.note) : all.map(n => n.note);
    return buildPitchIndex(source);
  }, [sequencePairs, resolvedNotes]);

  // Compute rects reactively from SharedValue inputs — no RAF loop needed.
  const rectsData = useDerivedValue(() => {
    'worklet';
    const sp = sequencePairs.value;
    const all = resolvedNotes.value;
    const nowMs = currentMusicalMs ? currentMusicalMs.value : 0;
    const pl = pitchLayout.value;
    const sliceH = height / Math.max(1, pl.pitches.length);

    // ── Playback mode (sequence exists) ──────────────────────────────────
    if (sp.length > 0) {
      const dur = sequenceDuration.value;
      if (dur <= 0) return [];

      // Build active-note lookup from live notes without endTime
      const activeMap: Record<number, boolean> = {};
      for (let i = 0; i < all.length; i++) {
        if (all[i].endTime == null) {
          activeMap[all[i].note] = true;
        }
      }

      return sp.map(p => {
        const x = (p.start / dur) * width;
        const w = ((p.end - p.start) / dur) * width;
        const yIdx = pl.index[p.note] ?? 0;
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

      return all.map(n => {
        const noteEnd = n.endTime ?? nowMs;
        const yIdx = pl.index[n.note] ?? 0;
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

    return all.map(n => {
      const noteEnd = n.endTime ?? nowMs;
      const yIdx = pl.index[n.note] ?? 0;
      return {
        x: ((n.startTime - minStart) / total) * width,
        w: ((noteEnd - n.startTime) / total) * width,
        y: yIdx * sliceH,
        h: sliceH,
        active: n.endTime == null,
      };
    });
  }, [
    sequencePairs,
    sequenceDuration,
    resolvedNotes,
    currentMusicalMs,
    pitchLayout,
    loopDuration,
  ]);

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
          <Animated.View
            style={[
              styles.playhead,
              { backgroundColor: color },
              playheadAnimatedStyle,
            ]}
          />
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
    opacity: 0.9,
  },
});

function desaturate(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const gray = 0.299 * r + 0.587 * g + 0.114 * b; // luminance-weighted gray
  const mix = (c: number) => Math.round(c + (gray - c) * amount);
  return `#${[r, g, b]
    .map(c => mix(c).toString(16).padStart(2, '0'))
    .join('')}`;
}
