import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  Canvas,
  PaintStyle,
  Picture,
  Skia,
} from '@shopify/react-native-skia';
import { GestureDetector } from 'react-native-gesture-handler';
import type { SharedValue } from 'react-native-reanimated';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import type { LoopSequence, NotePair } from '../utils/loopUtils';
import { pairNotes } from '../utils/loopUtils';
import {
  computePitchRows,
  computeGridLines,
  computeNoteRects,
  noteLabel,
  isBlackKey,
  type GridDiv,
} from './midiEditorUtils';
import { useMidiEditorGestures } from './useMidiEditorGestures';

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface MidiEditorProps {
  sequence: LoopSequence;
  channel: number;
  color: string;
  width: number;
  height: number;
  currentMusicalMs: SharedValue<number>;
  onClose: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function MidiEditor({
  sequence,
  channel,
  color,
  width,
  height,
  currentMusicalMs,
  onClose,
}: MidiEditorProps) {
  // ── Working copy of notes ───────────────────────────────────────────────
  const [pairs, setPairs] = useState<NotePair[]>(() => pairNotes(sequence.events));
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [gridDiv, setGridDiv] = useState<GridDiv>('1/16');
  const [viewTick, setViewTick] = useState(0);

  // Scroll/zoom as mutable refs for gesture perf (re-render via onViewChange)
  const scrollX = useRef(0);
  const scrollY = useRef(0);
  const zoomX = useRef(1);

  // Sync external sequence changes (overdub commit)
  useEffect(() => {
    setPairs(pairNotes(sequence.events));
    setSelectedIndices(new Set());
  }, [sequence]);

  const onViewChange = useCallback(() => {
    setViewTick(n => n + 1);
  }, []);

  // ── Gestures ────────────────────────────────────────────────────────────
  const gesture = useMidiEditorGestures({
    pairs,
    setPairs,
    sequence,
    channel,
    selectedIndices,
    setSelectedIndices,
    scrollX,
    scrollY,
    zoomX,
    viewW: width,
    viewH: height - TOOLBAR_HEIGHT,
    gridDiv,
    onViewChange,
  });

  // ── Compute render data ─────────────────────────────────────────────────
  const canvasH = height - TOOLBAR_HEIGHT;
  const pitchRows = useMemo(
    () => computePitchRows(pairs, canvasH, scrollY.current, 1),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pairs, canvasH, viewTick],
  );
  const gridLines = useMemo(
    () => computeGridLines(sequence, width, scrollX.current, zoomX.current),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sequence, width, viewTick],
  );
  const noteRects = useMemo(
    () => computeNoteRects(pairs, pitchRows, sequence.duration, width, scrollX.current, zoomX.current),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pairs, pitchRows, sequence.duration, width, viewTick],
  );

  // ── Skia paints ─────────────────────────────────────────────────────────
  const notePaint = useMemo(() => {
    const p = Skia.Paint();
    p.setColor(Skia.Color(color));
    return p;
  }, [color]);

  const selectedStrokePaint = useMemo(() => {
    const p = Skia.Paint();
    p.setColor(Skia.Color('#ffffff'));
    p.setStyle(PaintStyle.Stroke);
    p.setStrokeWidth(2);
    return p;
  }, []);

  const barLinePaint = useMemo(() => {
    const p = Skia.Paint();
    p.setColor(Skia.Color('rgba(255,255,255,0.3)'));
    p.setStrokeWidth(1);
    return p;
  }, []);

  const beatLinePaint = useMemo(() => {
    const p = Skia.Paint();
    p.setColor(Skia.Color('rgba(255,255,255,0.15)'));
    p.setStrokeWidth(0.5);
    return p;
  }, []);

  const subLinePaint = useMemo(() => {
    const p = Skia.Paint();
    p.setColor(Skia.Color('rgba(255,255,255,0.06)'));
    p.setStrokeWidth(0.5);
    return p;
  }, []);

  const darkRowPaint = useMemo(() => {
    const p = Skia.Paint();
    p.setColor(Skia.Color('rgba(255,255,255,0.03)'));
    return p;
  }, []);

  const blackKeyRowPaint = useMemo(() => {
    const p = Skia.Paint();
    p.setColor(Skia.Color('rgba(0,0,0,0.15)'));
    return p;
  }, []);

  // ── Skia picture (static per render) ────────────────────────────────────
  const recorder = useMemo(() => Skia.PictureRecorder(), []);

  const picture = useMemo(() => {
    const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, width, canvasH));

    // Row backgrounds
    for (let i = 0; i < pitchRows.length; i++) {
      const row = pitchRows[i];
      if (row.y + row.height < 0 || row.y > canvasH) continue;

      if (isBlackKey(row.note)) {
        canvas.drawRect(Skia.XYWHRect(0, row.y, width, row.height), blackKeyRowPaint);
      } else if (i % 2 === 0) {
        canvas.drawRect(Skia.XYWHRect(0, row.y, width, row.height), darkRowPaint);
      }
    }

    // Grid lines
    const linePaints = { bar: barLinePaint, beat: beatLinePaint, sub: subLinePaint };
    for (const line of gridLines) {
      if (line.x < 0 || line.x > width) continue;
      canvas.drawLine(line.x, 0, line.x, canvasH, linePaints[line.type]);
    }

    // Note rects
    for (const rect of noteRects) {
      if (rect.x + rect.width < 0 || rect.x > width) continue;
      if (rect.y + rect.height < 0 || rect.y > canvasH) continue;

      const rrect = Skia.RRectXY(
        Skia.XYWHRect(rect.x, rect.y + 1, rect.width, rect.height - 2),
        2, 2,
      );
      canvas.drawRRect(rrect, notePaint);

      if (selectedIndices.has(rect.index)) {
        canvas.drawRRect(rrect, selectedStrokePaint);
      }
    }

    return recorder.finishRecordingAsPicture();
  }, [
    recorder, width, canvasH,
    pitchRows, gridLines, noteRects,
    notePaint, selectedStrokePaint, selectedIndices,
    barLinePaint, beatLinePaint, subLinePaint,
    darkRowPaint, blackKeyRowPaint,
  ]);

  // ── Playhead ────────────────────────────────────────────────────────────
  // Capture ref values as locals so the worklet closure sees plain numbers.
  const sx = scrollX.current;
  const zx = zoomX.current;
  const dur = sequence.duration;
  const playheadStyle = useAnimatedStyle(() => {
    'worklet';
    const ms = currentMusicalMs.value;
    // Inline timeToX: ((ms / dur) * width * zx) - sx
    const px = dur > 0 ? ((ms / dur) * width * zx) - sx : 0;
    return {
      transform: [{ translateX: Math.max(0, Math.min(px, width)) }],
    };
  });

  // ── Pitch labels (left edge) ───────────────────────────────────────────
  const visibleLabels = useMemo(() => {
    return pitchRows
      .filter(r => r.y + r.height > 0 && r.y < canvasH && r.note % 12 === 0) // show C notes
      .map(r => ({
        note: r.note,
        y: r.y,
        height: r.height,
        label: noteLabel(r.note),
      }));
  }, [pitchRows, canvasH]);

  return (
    <View style={[styles.container, { width, height }]}>
      {/* Toolbar */}
      <View style={styles.toolbar}>
        <View style={styles.toolbarLeft}>
          {(['1/4', '1/8', '1/16'] as GridDiv[]).map(div => (
            <TouchableOpacity
              key={div}
              style={[
                styles.gridChip,
                gridDiv === div && { backgroundColor: color },
              ]}
              onPress={() => setGridDiv(div)}
            >
              <Text style={styles.gridChipText}>{div}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.toolbarRight}>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>X</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Canvas with gestures */}
      <GestureDetector gesture={gesture}>
        <View style={{ width, height: canvasH }}>
          <Canvas style={{ width, height: canvasH }}>
            <Picture picture={picture} />
          </Canvas>

          {/* Playhead */}
          <Animated.View style={[styles.playhead, { height: canvasH, backgroundColor: color }, playheadStyle]} />

          {/* Pitch labels */}
          {visibleLabels.map(l => (
            <Text
              key={l.note}
              style={[
                styles.pitchLabel,
                { top: l.y, height: l.height, lineHeight: l.height },
              ]}
            >
              {l.label}
            </Text>
          ))}
        </View>
      </GestureDetector>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const TOOLBAR_HEIGHT = 36;

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1a1a1a',
  },
  toolbar: {
    height: TOOLBAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    backgroundColor: '#111',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#333',
  },
  toolbarLeft: {
    flexDirection: 'row',
    gap: 4,
  },
  toolbarRight: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  gridChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: '#333',
  },
  gridChipText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  playhead: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 2,
    opacity: 0.9,
  },
  pitchLabel: {
    position: 'absolute',
    left: 2,
    color: 'rgba(255,255,255,0.5)',
    fontSize: 9,
    fontWeight: '600',
  },
});
