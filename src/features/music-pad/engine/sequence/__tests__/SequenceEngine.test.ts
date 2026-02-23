import {
  getLatestPredictedEndTimeForNote,
  mergeOverdubIntoSequence,
  snapRepeatStartTime,
} from '../SequenceEngine';
import { LoopSequence, NoteEvent, pairNotes } from '../../../utils/loopUtils';

const makeSequence = (events: NoteEvent[], duration: number): LoopSequence => ({
  events,
  duration,
  durationBars: 1,
  name: 'test',
  bpm: 120,
  confidence: 1,
  downbeatOffset: 0,
  timeSignature: [4, 4],
  beatIntervalMs: 500,
});

describe('SequenceEngine', () => {
  it('returns original sequence when overdub events are empty', () => {
    const base = makeSequence(
      [
        { type: 'noteOn', note: 60, timestamp: 100, velocity: 0.9 },
        { type: 'noteOff', note: 60, timestamp: 200, velocity: 0 },
      ],
      1000,
    );
    const out = mergeOverdubIntoSequence(base, []);
    expect(out).toBe(base);
  });

  it('wraps overdub notes crossing loop boundary', () => {
    const base = makeSequence([], 1000);
    const overdub: NoteEvent[] = [
      { type: 'noteOn', note: 61, timestamp: 950, velocity: 0.8 },
      { type: 'noteOff', note: 61, timestamp: 1050, velocity: 0 },
    ];

    const out = mergeOverdubIntoSequence(base, overdub);
    const pairs = pairNotes(out.events).filter(p => p.note === 61);

    expect(pairs).toEqual([
      { note: 61, velocity: 0.8, start: 0, end: 50 },
      { note: 61, velocity: 0.8, start: 950, end: 1000 },
    ]);
  });

  it('deduplicates overlapping same-pitch notes after merge', () => {
    const base = makeSequence(
      [
        { type: 'noteOn', note: 60, timestamp: 100, velocity: 0.7 },
        { type: 'noteOff', note: 60, timestamp: 300, velocity: 0 },
      ],
      1000,
    );
    const overdub: NoteEvent[] = [
      { type: 'noteOn', note: 60, timestamp: 250, velocity: 0.9 },
      { type: 'noteOff', note: 60, timestamp: 450, velocity: 0 },
    ];

    const out = mergeOverdubIntoSequence(base, overdub);
    const pairs = pairNotes(out.events).filter(p => p.note === 60);
    expect(pairs).toEqual([
      { note: 60, velocity: 0.9, start: 100, end: 450 },
    ]);
  });

  it('snaps repeat starts to grid and clamps minor negative drift', () => {
    const visualNotes = [{ note: 60, startTime: 0, endTime: 260 }];

    const start1 = snapRepeatStartTime({
      currentTime: 520,
      durationMs: 250,
      visualNotes,
    });
    expect(start1).toBe(500);

    const start2 = snapRepeatStartTime({
      currentTime: 370,
      durationMs: 250,
      visualNotes,
    });
    expect(start2).toBe(260);
  });

  it('returns latest predicted end for note and respects latest-open semantics', () => {
    const notes = [
      { note: 60, startTime: 0, endTime: 100 },
      { note: 61, startTime: 100, endTime: 200 },
      { note: 60, startTime: 250, endTime: undefined },
    ];

    expect(getLatestPredictedEndTimeForNote(notes, 61)).toBe(200);
    // Latest note with pitch 60 is still open, so we intentionally return undefined.
    expect(getLatestPredictedEndTimeForNote(notes, 60)).toBeUndefined();
  });
});
