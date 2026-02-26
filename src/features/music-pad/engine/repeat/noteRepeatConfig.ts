export type NoteRepeatMode =
  | 'off'
  | '1/4'
  | '1/4T'
  | '1/8'
  | '1/8T'
  | '1/16'
  | '1/16T'
  | '1/32'
  | '1/32T';

export const NOTE_REPEAT_MODES: NoteRepeatMode[] = [
  '1/4',
  '1/4T',
  '1/8',
  '1/8T',
  '1/16',
  '1/16T',
  '1/32',
  '1/32T',
  'off',
];

export function getIntervalMs(mode: NoteRepeatMode, bpm: number): number {
  if (mode === 'off') return 0;
  const beatMs = 60000 / bpm;
  switch (mode) {
    case '1/4':
      return beatMs;
    case '1/4T':
      return (beatMs * 2) / 3;
    case '1/8':
      return beatMs / 2;
    case '1/8T':
      return beatMs / 3;
    case '1/16':
      return beatMs / 4;
    case '1/16T':
      return beatMs / 6;
    case '1/32':
      return beatMs / 8;
    case '1/32T':
      return beatMs / 12;
  }
}
