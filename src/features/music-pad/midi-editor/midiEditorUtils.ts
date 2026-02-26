import type { NotePair, LoopSequence } from '../utils/loopUtils';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface EditorRect {
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
  pair: NotePair;
}

export interface GridLine {
  x: number;
  type: 'bar' | 'beat' | 'sub';
}

export interface PitchRow {
  note: number;
  y: number;
  height: number;
}

export type GridDiv = '1/4' | '1/8' | '1/16';

// ─────────────────────────────────────────────────────────────────────────────
// Note labels
// ─────────────────────────────────────────────────────────────────────────────

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function noteLabel(midiNote: number): string {
  const octave = Math.floor(midiNote / 12) - 1;
  const name = NOTE_NAMES[midiNote % 12];
  return `${name}${octave}`;
}

export function isBlackKey(midiNote: number): boolean {
  const n = midiNote % 12;
  return n === 1 || n === 3 || n === 6 || n === 8 || n === 10;
}

// ─────────────────────────────────────────────────────────────────────────────
// Coordinate transforms
// ─────────────────────────────────────────────────────────────────────────────

export function timeToX(
  timeMs: number,
  scrollX: number,
  zoomX: number,
  viewW: number,
  duration: number,
): number {
  if (duration <= 0) return 0;
  return ((timeMs / duration) * viewW * zoomX) - scrollX;
}

export function xToTime(
  x: number,
  scrollX: number,
  zoomX: number,
  viewW: number,
  duration: number,
): number {
  if (viewW * zoomX <= 0) return 0;
  return ((x + scrollX) / (viewW * zoomX)) * duration;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pitch rows
// ─────────────────────────────────────────────────────────────────────────────

export function computePitchRows(
  pairs: NotePair[],
  viewH: number,
  scrollY: number,
  _zoomY: number,
): PitchRow[] {
  if (pairs.length === 0) return [];

  // Collect unique pitches
  const seen = new Set<number>();
  for (const p of pairs) seen.add(p.note);
  const pitches = Array.from(seen).sort((a, b) => b - a);

  // Add 2 semitone padding above and below
  const highest = pitches[0];
  const lowest = pitches[pitches.length - 1];
  const padded: number[] = [];
  for (let n = Math.min(127, highest + 2); n >= Math.max(0, lowest - 2); n--) {
    padded.push(n);
  }

  const rowH = Math.max(12, viewH / padded.length);
  return padded.map((note, i) => ({
    note,
    y: i * rowH - scrollY,
    height: rowH,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Grid lines
// ─────────────────────────────────────────────────────────────────────────────

export function computeGridLines(
  sequence: LoopSequence,
  viewW: number,
  scrollX: number,
  zoomX: number,
): GridLine[] {
  const { duration, beatIntervalMs } = sequence;
  if (duration <= 0 || beatIntervalMs <= 0) return [];

  const lines: GridLine[] = [];
  const barMs = beatIntervalMs * 4;
  const subMs = beatIntervalMs / 4; // 1/16th

  // Visible time range
  const startTime = xToTime(0, scrollX, zoomX, viewW, duration);
  const endTime = xToTime(viewW, scrollX, zoomX, viewW, duration);

  // Bar lines
  for (let t = 0; t <= duration; t += barMs) {
    if (t < startTime - barMs || t > endTime + barMs) continue;
    lines.push({ x: timeToX(t, scrollX, zoomX, viewW, duration), type: 'bar' });
  }

  // Beat lines
  for (let t = 0; t <= duration; t += beatIntervalMs) {
    if (t < startTime - beatIntervalMs || t > endTime + beatIntervalMs) continue;
    if (t % barMs < 1) continue; // skip bar lines
    lines.push({ x: timeToX(t, scrollX, zoomX, viewW, duration), type: 'beat' });
  }

  // Sub-division lines (1/16)
  if (zoomX >= 2) {
    for (let t = 0; t <= duration; t += subMs) {
      if (t < startTime - subMs || t > endTime + subMs) continue;
      if (t % beatIntervalMs < 1) continue; // skip beat lines
      lines.push({ x: timeToX(t, scrollX, zoomX, viewW, duration), type: 'sub' });
    }
  }

  return lines;
}

// ─────────────────────────────────────────────────────────────────────────────
// Note rects
// ─────────────────────────────────────────────────────────────────────────────

export function computeNoteRects(
  pairs: NotePair[],
  pitchRows: PitchRow[],
  duration: number,
  viewW: number,
  scrollX: number,
  zoomX: number,
): EditorRect[] {
  if (duration <= 0 || pitchRows.length === 0) return [];

  const rowByNote = new Map<number, PitchRow>();
  for (const row of pitchRows) rowByNote.set(row.note, row);

  return pairs.map((pair, index) => {
    const row = rowByNote.get(pair.note);
    const x = timeToX(pair.start, scrollX, zoomX, viewW, duration);
    const xEnd = timeToX(pair.end, scrollX, zoomX, viewW, duration);
    const y = row ? row.y : 0;
    const height = row ? row.height : 12;
    return {
      index,
      x,
      y,
      width: Math.max(2, xEnd - x),
      height,
      pair,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Hit testing
// ─────────────────────────────────────────────────────────────────────────────

const RESIZE_HANDLE_PX = 15;

export function hitTestNote(
  x: number,
  y: number,
  rects: EditorRect[],
): { index: number; edge: 'body' | 'right' } | null {
  // Iterate in reverse so top-drawn (last) notes are hit first
  for (let i = rects.length - 1; i >= 0; i--) {
    const r = rects[i];
    if (x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height) {
      const edge = (x >= r.x + r.width - RESIZE_HANDLE_PX) ? 'right' : 'body';
      return { index: r.index, edge };
    }
  }
  return null;
}

export function hitTestPitchRow(
  y: number,
  pitchRows: PitchRow[],
): number | null {
  for (const row of pitchRows) {
    if (y >= row.y && y < row.y + row.height) {
      return row.note;
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Snap to grid
// ─────────────────────────────────────────────────────────────────────────────

const GRID_DIVISORS: Record<GridDiv, number> = {
  '1/4': 1,
  '1/8': 2,
  '1/16': 4,
};

export function snapToGrid(
  timeMs: number,
  beatIntervalMs: number,
  gridDiv: GridDiv,
): number {
  const stepMs = beatIntervalMs / GRID_DIVISORS[gridDiv];
  return Math.round(timeMs / stepMs) * stepMs;
}

export function getGridStepMs(beatIntervalMs: number, gridDiv: GridDiv): number {
  return beatIntervalMs / GRID_DIVISORS[gridDiv];
}
