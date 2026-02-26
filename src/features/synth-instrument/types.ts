export const WAVEFORMS = ['sine', 'saw', 'square', 'triangle', 'pulse'] as const;
export type Waveform = (typeof WAVEFORMS)[number];

export const FILTER_TYPES = ['LowPass', 'HighPass', 'BandPass'] as const;
export type FilterType = (typeof FILTER_TYPES)[number];

export const GRID_CONFIGS = {
  '4x4': { rows: 4, cols: 4 },
  '5x5': { rows: 5, cols: 5 },
  '6x6': { rows: 6, cols: 6 },
  '8x8': { rows: 8, cols: 8 },
} as const;
export type GridSize = keyof typeof GRID_CONFIGS;

export const KEYS = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
] as const;
export type Key = (typeof KEYS)[number];

export const SCALES = {
  Major: [0, 2, 4, 5, 7, 9, 11],
  Minor: [0, 2, 3, 5, 7, 8, 10],
} as const;
export type ScaleType = keyof typeof SCALES;

export function generateScale(
  rootNote: number,
  scaleType: ScaleType,
  count: number,
): number[] {
  const intervals = SCALES[scaleType];
  const notes: number[] = [];
  let octaveOffset = 0;
  for (let i = 0; i < count; i++) {
    const scaleIndex = i % intervals.length;
    if (i > 0 && scaleIndex === 0) octaveOffset += 12;
    notes.push(rootNote + intervals[scaleIndex] + octaveOffset);
  }
  return notes;
}
