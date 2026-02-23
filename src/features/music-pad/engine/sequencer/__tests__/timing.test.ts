import {
  computeLoopTime,
  findNextEventIndex,
  getRecordingTimelineContext,
  normalizeRecordedTimestamp,
} from '../timing';
import type { NoteEvent } from '../../../utils/loopUtils';

describe('sequencer timing helpers', () => {
  it('computes loop-local time from absolute clock', () => {
    expect(computeLoopTime(1250, 0, 1000)).toBe(250);
    expect(computeLoopTime(100, 0, 0)).toBe(0);
  });

  it('finds the first event strictly after loop time', () => {
    const events: NoteEvent[] = [
      { type: 'noteOn', note: 60, timestamp: 100, velocity: 0.9 },
      { type: 'noteOff', note: 60, timestamp: 200, velocity: 0 },
      { type: 'noteOn', note: 61, timestamp: 300, velocity: 0.8 },
    ];
    expect(findNextEventIndex(events, 50)).toBe(0);
    expect(findNextEventIndex(events, 200)).toBe(2);
    expect(findNextEventIndex(events, 350)).toBe(3);
  });

  it('builds recording timeline context from sequence or master duration', () => {
    expect(
      getRecordingTimelineContext({
        isPlaying: false,
        now: 500,
        globalStartTime: 0,
        sequenceDuration: 1000,
        masterDuration: 4000,
      }),
    ).toEqual({ offset: 0, duration: 0 });

    expect(
      getRecordingTimelineContext({
        isPlaying: true,
        now: 2500,
        globalStartTime: 0,
        sequenceDuration: 1000,
        masterDuration: 4000,
      }),
    ).toEqual({ offset: 500, duration: 1000 });

    expect(
      getRecordingTimelineContext({
        isPlaying: true,
        now: 2500,
        globalStartTime: 0,
        sequenceDuration: 0,
        masterDuration: 4000,
      }),
    ).toEqual({ offset: 2500, duration: 4000 });
  });

  it('normalizes explicit loop-local timestamps for recording buffer', () => {
    expect(
      normalizeRecordedTimestamp({
        rawTimestamp: 50,
        hasExplicitTimestamp: true,
        isPlaying: true,
        recordingLoopOffset: 260,
        recordingTimelineDuration: 1000,
      }),
    ).toBe(790);

    expect(
      normalizeRecordedTimestamp({
        rawTimestamp: 310,
        hasExplicitTimestamp: true,
        isPlaying: true,
        recordingLoopOffset: 260,
        recordingTimelineDuration: 1000,
      }),
    ).toBe(50);

    expect(
      normalizeRecordedTimestamp({
        rawTimestamp: 120,
        hasExplicitTimestamp: false,
        isPlaying: true,
        recordingLoopOffset: 260,
        recordingTimelineDuration: 1000,
      }),
    ).toBe(120);
  });
});
