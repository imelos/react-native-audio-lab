import { useCallback, useRef } from 'react';
import { Gesture, type ComposedGesture } from 'react-native-gesture-handler';
import type { NotePair, LoopSequence } from '../utils/loopUtils';
import { pairsToEvents } from '../utils/loopUtils';
import GlobalSequencer from '../hooks/GlobalSequencer';
import {
  hitTestNote,
  hitTestPitchRow,
  xToTime,
  snapToGrid,
  computeNoteRects,
  computePitchRows,
  getGridStepMs,
  type EditorRect,
  type PitchRow,
  type GridDiv,
} from './midiEditorUtils';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface UseMidiEditorGesturesParams {
  pairs: NotePair[];
  setPairs: (fn: (prev: NotePair[]) => NotePair[]) => void;
  sequence: LoopSequence;
  channel: number;
  selectedIndices: Set<number>;
  setSelectedIndices: (fn: (prev: Set<number>) => Set<number>) => void;
  scrollX: React.MutableRefObject<number>;
  scrollY: React.MutableRefObject<number>;
  zoomX: React.MutableRefObject<number>;
  viewW: number;
  viewH: number;
  gridDiv: GridDiv;
  onViewChange: () => void; // trigger re-render after scroll/zoom changes
}

type DragMode =
  | { type: 'move'; index: number; startNote: number; startTime: number; origPair: NotePair }
  | { type: 'resize'; index: number; origEnd: number }
  | { type: 'scroll'; startScrollX: number; startScrollY: number };

const MIN_NOTE_DURATION_FACTOR = 0.125; // 1/32 of a beat

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useMidiEditorGestures({
  pairs,
  setPairs,
  sequence,
  channel,
  selectedIndices,
  setSelectedIndices,
  scrollX,
  scrollY,
  zoomX,
  viewW,
  viewH,
  gridDiv,
  onViewChange,
}: UseMidiEditorGesturesParams): ComposedGesture {
  const dragModeRef = useRef<DragMode | null>(null);

  // Memoized helpers that read current refs
  const getRects = useCallback((): { rects: EditorRect[]; pitchRows: PitchRow[] } => {
    const pitchRows = computePitchRows(pairs, viewH, scrollY.current, 1);
    const rects = computeNoteRects(
      pairs, pitchRows, sequence.duration, viewW, scrollX.current, zoomX.current,
    );
    return { rects, pitchRows };
  }, [pairs, sequence.duration, viewW, viewH, scrollX, scrollY, zoomX]);

  const commitEdits = useCallback((updatedPairs: NotePair[]) => {
    const newEvents = pairsToEvents(updatedPairs);
    const updatedSequence: LoopSequence = { ...sequence, events: newEvents };
    GlobalSequencer.getInstance().setSequence(channel, updatedSequence);
  }, [sequence, channel]);

  const clampScrollX = useCallback((sx: number): number => {
    const maxScroll = Math.max(0, viewW * zoomX.current - viewW);
    return Math.max(0, Math.min(sx, maxScroll));
  }, [viewW, zoomX]);

  const clampScrollY = useCallback((sy: number): number => {
    const pitchRows = computePitchRows(pairs, viewH, 0, 1);
    const totalH = pitchRows.length > 0
      ? pitchRows[pitchRows.length - 1].y + pitchRows[pitchRows.length - 1].height
      : viewH;
    return Math.max(0, Math.min(sy, Math.max(0, totalH - viewH)));
  }, [pairs, viewH]);

  // ── Tap gesture ───────────────────────────────────────────────────────────
  // All gesture callbacks use .runOnJS(true) because they need to call
  // JS-thread functions (state setters, hit testing, GlobalSequencer API).

  const tapGesture = Gesture.Tap()
    .runOnJS(true)
    .maxDuration(250)
    .onEnd((e) => {
      const { rects, pitchRows } = getRects();
      const hit = hitTestNote(e.x, e.y, rects);

      if (hit) {
        // Toggle selection
        setSelectedIndices(prev => {
          const next = new Set(prev);
          if (next.has(hit.index)) {
            next.delete(hit.index);
          } else {
            next.add(hit.index);
          }
          return next;
        });
      } else {
        // Add note at tapped position
        const time = xToTime(e.x, scrollX.current, zoomX.current, viewW, sequence.duration);
        const note = hitTestPitchRow(e.y, pitchRows);
        if (note == null) return;

        const snappedTime = snapToGrid(time, sequence.beatIntervalMs, gridDiv);
        const stepMs = getGridStepMs(sequence.beatIntervalMs, gridDiv);
        const newPair: NotePair = {
          note,
          velocity: 0.8,
          start: Math.max(0, Math.min(snappedTime, sequence.duration - stepMs)),
          end: Math.min(snappedTime + stepMs, sequence.duration),
        };

        setPairs(prev => {
          const next = [...prev, newPair];
          commitEdits(next);
          return next;
        });
        // Clear selection
        setSelectedIndices(() => new Set());
      }
    });

  // ── Long press gesture (delete selected) ──────────────────────────────────

  const longPressGesture = Gesture.LongPress()
    .runOnJS(true)
    .minDuration(400)
    .onEnd((e) => {
      const { rects } = getRects();
      const hit = hitTestNote(e.x, e.y, rects);
      if (hit && selectedIndices.has(hit.index)) {
        // Delete all selected notes
        setPairs(prev => {
          const next = prev.filter((_, i) => !selectedIndices.has(i));
          commitEdits(next);
          return next;
        });
        setSelectedIndices(() => new Set());
      }
    });

  // ── Pan gesture ───────────────────────────────────────────────────────────

  const panGesture = Gesture.Pan()
    .runOnJS(true)
    .minDistance(5)
    .onBegin((e) => {
      const { rects } = getRects();
      const hit = hitTestNote(e.x, e.y, rects);

      if (hit) {
        if (hit.edge === 'right') {
          dragModeRef.current = {
            type: 'resize',
            index: hit.index,
            origEnd: pairs[hit.index].end,
          };
        } else {
          const p = pairs[hit.index];
          dragModeRef.current = {
            type: 'move',
            index: hit.index,
            startNote: p.note,
            startTime: p.start,
            origPair: { ...p },
          };
          // Select the dragged note
          setSelectedIndices(prev => {
            const next = new Set(prev);
            next.add(hit.index);
            return next;
          });
        }
      } else {
        dragModeRef.current = {
          type: 'scroll',
          startScrollX: scrollX.current,
          startScrollY: scrollY.current,
        };
      }
    })
    .onUpdate((e) => {
      const mode = dragModeRef.current;
      if (!mode) return;

      if (mode.type === 'scroll') {
        scrollX.current = clampScrollX(mode.startScrollX - e.translationX);
        scrollY.current = clampScrollY(mode.startScrollY - e.translationY);
        onViewChange();
        return;
      }

      if (mode.type === 'move') {
        const { pitchRows } = getRects();
        const p = mode.origPair;
        const duration = p.end - p.start;

        // Time delta
        const timeDelta = xToTime(e.translationX, 0, zoomX.current, viewW, sequence.duration);
        let newStart = mode.startTime + timeDelta;
        newStart = Math.max(0, Math.min(newStart, sequence.duration - duration));

        // Pitch delta
        const pitchRow = hitTestPitchRow(
          getRects().rects[mode.index]?.y + getRects().rects[mode.index]?.height / 2 + e.translationY,
          pitchRows,
        );
        const newNote = pitchRow ?? mode.startNote;

        setPairs(prev => {
          const next = [...prev];
          next[mode.index] = {
            ...p,
            note: Math.max(0, Math.min(127, newNote)),
            start: newStart,
            end: newStart + duration,
          };
          return next;
        });
        return;
      }

      if (mode.type === 'resize') {
        const timeDelta = xToTime(e.translationX, 0, zoomX.current, viewW, sequence.duration);
        let newEnd = mode.origEnd + timeDelta;
        const p = pairs[mode.index];
        const minDur = sequence.beatIntervalMs * MIN_NOTE_DURATION_FACTOR;
        newEnd = Math.max(p.start + minDur, Math.min(newEnd, sequence.duration));

        setPairs(prev => {
          const next = [...prev];
          next[mode.index] = { ...prev[mode.index], end: newEnd };
          return next;
        });
      }
    })
    .onEnd(() => {
      const mode = dragModeRef.current;
      if (!mode || mode.type === 'scroll') {
        dragModeRef.current = null;
        return;
      }

      // Snap on release
      setPairs(prev => {
        const next = [...prev];
        if (mode.type === 'move') {
          const p = next[mode.index];
          const dur = p.end - p.start;
          const snapped = snapToGrid(p.start, sequence.beatIntervalMs, gridDiv);
          const clampedStart = Math.max(0, Math.min(snapped, sequence.duration - dur));
          next[mode.index] = { ...p, start: clampedStart, end: clampedStart + dur };
        } else if (mode.type === 'resize') {
          const p = next[mode.index];
          const snapped = snapToGrid(p.end, sequence.beatIntervalMs, gridDiv);
          const minDur = sequence.beatIntervalMs * MIN_NOTE_DURATION_FACTOR;
          const clampedEnd = Math.max(p.start + minDur, Math.min(snapped, sequence.duration));
          next[mode.index] = { ...p, end: clampedEnd };
        }
        commitEdits(next);
        return next;
      });
      dragModeRef.current = null;
    });

  // ── Pinch gesture (horizontal zoom) ───────────────────────────────────────

  const pinchStartZoom = useRef(1);
  const pinchStartScroll = useRef(0);
  const pinchFocalX = useRef(0);

  const pinchGesture = Gesture.Pinch()
    .runOnJS(true)
    .onBegin((e) => {
      pinchStartZoom.current = zoomX.current;
      pinchStartScroll.current = scrollX.current;
      pinchFocalX.current = e.focalX;
    })
    .onUpdate((e) => {
      const newZoom = Math.max(1, Math.min(8, pinchStartZoom.current * e.scale));
      // Keep focal point stable
      const focalTime = (pinchFocalX.current + pinchStartScroll.current) / (viewW * pinchStartZoom.current);
      const newScrollX = focalTime * viewW * newZoom - pinchFocalX.current;

      zoomX.current = newZoom;
      scrollX.current = clampScrollX(newScrollX);
      onViewChange();
    });

  // ── Compose gestures ──────────────────────────────────────────────────────

  return Gesture.Simultaneous(
    pinchGesture,
    Gesture.Race(
      panGesture,
      Gesture.Exclusive(longPressGesture, tapGesture),
    ),
  );
}
