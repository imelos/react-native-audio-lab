import React, { useEffect, useMemo } from 'react';
import { Canvas, PaintStyle, Picture, Skia } from '@shopify/react-native-skia';
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
  /** Draw live notes as stroke overlay while sequence remains visible */
  showLiveOverlay?: boolean;
  /** Master loop duration — used to position live notes against the loop when overdubbing */
  loopDuration?: number;
  color: string;
}

/**
 * Compute unique pitches sorted descending and build a pitch → y-index map.
 * Uses plain objects instead of Map/Set for worklet compatibility.
 */
function sortAndIndexPitches(pitches: number[]): {
  pitches: number[];
  index: Record<number, number>;
} {
  'worklet';
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
  showLiveOverlay = false,
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

  const overlayStrokePaint = useMemo(() => {
    const _overlayStrokePaint = Skia.Paint();
    _overlayStrokePaint.setColor(Skia.Color(color));
    _overlayStrokePaint.setStyle(PaintStyle.Stroke);
    _overlayStrokePaint.setStrokeWidth(1.5);
    return _overlayStrokePaint;
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
    const seen: Record<number, boolean> = {};
    const pitches: number[] = [];
    const all = resolvedNotes.value;

    if (sp.length > 0) {
      for (let i = 0; i < sp.length; i++) {
        const note = sp[i].note;
        if (!seen[note]) {
          seen[note] = true;
          pitches.push(note);
        }
      }
      if (showLiveOverlay) {
        for (let i = 0; i < all.length; i++) {
          const note = all[i].note;
          if (!seen[note]) {
            seen[note] = true;
            pitches.push(note);
          }
        }
      }
      return sortAndIndexPitches(pitches);
    }

    for (let i = 0; i < all.length; i++) {
      const note = all[i].note;
      if (!seen[note]) {
        seen[note] = true;
        pitches.push(note);
      }
    }

    return sortAndIndexPitches(pitches);
  }, [sequencePairs, resolvedNotes, showLiveOverlay]);

  // Compute rects reactively from SharedValue inputs — no RAF loop needed.
  const rectsData = useDerivedValue(() => {
    'worklet';
    const sp = sequencePairs.value;
    const all = resolvedNotes.value;
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

      const rects: Array<{
        x: number;
        w: number;
        y: number;
        h: number;
        active: boolean;
        overlay?: boolean;
      }> = new Array(sp.length);
      for (let i = 0; i < sp.length; i++) {
        const p = sp[i];
        const x = (p.start / dur) * width;
        const w = ((p.end - p.start) / dur) * width;
        const yIdx = pl.index[p.note] ?? 0;
        rects[i] = {
          x,
          w,
          y: yIdx * sliceH,
          h: sliceH,
          active: !!activeMap[p.note],
        };
      }

      if (showLiveOverlay && all.length > 0) {
        let hasOpenNotes = false;
        for (let i = 0; i < all.length; i++) {
          if (all[i].endTime == null) {
            hasOpenNotes = true;
            break;
          }
        }
        const nowMs =
          hasOpenNotes && currentMusicalMs ? currentMusicalMs.value : 0;

        for (let i = 0; i < all.length; i++) {
          const n = all[i];
          const noteEnd = n.endTime ?? nowMs;
          const rawDuration = Math.max(0, noteEnd - n.startTime);
          if (rawDuration <= 0) continue;

          const wrappedStart = ((n.startTime % dur) + dur) % dur;
          const yIdx = pl.index[n.note] ?? 0;
          const y = yIdx * sliceH;

          if (rawDuration >= dur) {
            rects.push({
              x: 0,
              w: width,
              y,
              h: sliceH,
              active: n.endTime == null,
              overlay: true,
            });
            continue;
          }

          const end = wrappedStart + rawDuration;
          if (end <= dur) {
            rects.push({
              x: (wrappedStart / dur) * width,
              w: (rawDuration / dur) * width,
              y,
              h: sliceH,
              active: n.endTime == null,
              overlay: true,
            });
            continue;
          }

          const firstDuration = dur - wrappedStart;
          rects.push({
            x: (wrappedStart / dur) * width,
            w: (firstDuration / dur) * width,
            y,
            h: sliceH,
            active: n.endTime == null,
            overlay: true,
          });
          rects.push({
            x: 0,
            w: ((end - dur) / dur) * width,
            y,
            h: sliceH,
            active: n.endTime == null,
            overlay: true,
          });
        }
      }

      return rects;
    }

    // No notes at all → empty
    if (all.length === 0) return [];

    let hasOpenNotes = false;
    for (let i = 0; i < all.length; i++) {
      if (all[i].endTime == null) {
        hasOpenNotes = true;
        break;
      }
    }
    // Only subscribe to musical time while open notes need growth.
    const nowMs =
      hasOpenNotes && currentMusicalMs ? currentMusicalMs.value : 0;

    // ── Overdub mode (loopDuration provided) ─────────────────────────────
    if (loopDuration && loopDuration > 0) {
      let total = loopDuration;
      for (let i = 0; i < all.length; i++) {
        const end = all[i].endTime ?? nowMs;
        if (end > total) total = end;
      }
      const rects: Array<{
        x: number;
        w: number;
        y: number;
        h: number;
        active: boolean;
        overlay?: boolean;
      }> = [];
      for (let i = 0; i < all.length; i++) {
        const n = all[i];
        const noteEnd = n.endTime ?? nowMs;
        const rawDuration = Math.max(0, noteEnd - n.startTime);
        if (rawDuration <= 0) continue;
        const yIdx = pl.index[n.note] ?? 0;
        const y = yIdx * sliceH;
        rects.push({
          x: (n.startTime / total) * width,
          w: (rawDuration / total) * width,
          y,
          h: sliceH,
          active: n.endTime == null,
        });
      }
      return rects;
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

    const rects = new Array(all.length);
    for (let i = 0; i < all.length; i++) {
      const n = all[i];
      const noteEnd = n.endTime ?? nowMs;
      const yIdx = pl.index[n.note] ?? 0;
      rects[i] = {
        x: ((n.startTime - minStart) / total) * width,
        w: ((noteEnd - n.startTime) / total) * width,
        y: yIdx * sliceH,
        h: sliceH,
        active: n.endTime == null,
      };
    }
    return rects;
  }, [
    width,
    height,
    currentMusicalMs,
    sequencePairs,
    sequenceDuration,
    resolvedNotes,
    pitchLayout,
    showLiveOverlay,
    loopDuration,
  ]);

  const picture = useDerivedValue(() => {
    'worklet';
    const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, width, height));

    const rects = rectsData.value;
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (r.w > 0 && r.x + r.w > 0 && r.x < width) {
        canvas.drawRect(
          Skia.XYWHRect(r.x, r.y, r.w, r.h),
          r.overlay ? overlayStrokePaint : r.active ? activePaint : inactivePaint,
        );
      }
    }

    return recorder.finishRecordingAsPicture();
  }, [
    rectsData,
    recorder,
    width,
    height,
    activePaint,
    inactivePaint,
    overlayStrokePaint,
  ]);

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
