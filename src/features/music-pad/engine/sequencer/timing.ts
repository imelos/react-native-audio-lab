import type { NoteEvent } from '../../utils/loopUtils';

export function computeLoopTime(
  now: number,
  globalStartTime: number,
  duration: number,
): number {
  if (duration <= 0) return 0;
  const elapsed = now - globalStartTime;
  return elapsed % duration;
}

export function findNextEventIndex(
  events: NoteEvent[],
  loopTime: number,
): number {
  let idx = 0;
  while (idx < events.length && events[idx].timestamp <= loopTime) {
    idx++;
  }
  return idx;
}

export function getRecordingTimelineContext(params: {
  isPlaying: boolean;
  now: number;
  globalStartTime: number;
  sequenceDuration: number;
  masterDuration: number;
}): { offset: number; duration: number } {
  const {
    isPlaying,
    now,
    globalStartTime,
    sequenceDuration,
    masterDuration,
  } = params;

  if (!isPlaying) {
    return { offset: 0, duration: 0 };
  }

  const duration = sequenceDuration > 0 ? sequenceDuration : masterDuration;
  if (duration <= 0) {
    return { offset: 0, duration: 0 };
  }

  return {
    offset: computeLoopTime(now, globalStartTime, duration),
    duration,
  };
}

export function normalizeRecordedTimestamp(params: {
  rawTimestamp: number;
  hasExplicitTimestamp: boolean;
  isPlaying: boolean;
  recordingLoopOffset: number;
  recordingTimelineDuration: number;
}): number {
  const {
    rawTimestamp,
    hasExplicitTimestamp,
    isPlaying,
    recordingLoopOffset,
    recordingTimelineDuration,
  } = params;

  if (!hasExplicitTimestamp || !isPlaying || recordingTimelineDuration <= 0) {
    return rawTimestamp;
  }

  let ts = rawTimestamp - recordingLoopOffset;
  if (ts < 0) {
    ts += recordingTimelineDuration;
  }
  return ts;
}
