import {
  LoopSequence,
  NoteEvent,
  NotePair,
  pairNotes,
  pairsToEvents,
} from '../../utils/loopUtils';

export type SequenceVisualNote = {
  note: number;
  startTime: number;
  endTime?: number;
};

function wrapTimeToDuration(timeMs: number, durationMs: number): number {
  const wrapped = timeMs % durationMs;
  return wrapped < 0 ? wrapped + durationMs : wrapped;
}

function deduplicateOverlaps(pairs: NotePair[]): NotePair[] {
  const byNote = new Map<number, NotePair[]>();
  for (let i = 0; i < pairs.length; i++) {
    const p = pairs[i];
    const arr = byNote.get(p.note) ?? [];
    arr.push(p);
    byNote.set(p.note, arr);
  }

  const out: NotePair[] = [];
  byNote.forEach(notePairs => {
    notePairs.sort((a, b) => a.start - b.start);
    for (let i = 0; i < notePairs.length; i++) {
      const current = notePairs[i];
      const last = out.length > 0 ? out[out.length - 1] : undefined;
      if (last && last.note === current.note && current.start < last.end - 1) {
        last.end = Math.max(last.end, current.end);
        last.velocity = Math.max(last.velocity, current.velocity);
      } else {
        out.push({ ...current });
      }
    }
  });

  return out.sort((a, b) => a.start - b.start);
}

export function mergeOverdubIntoSequence(
  base: LoopSequence,
  overdubEvents: NoteEvent[],
): LoopSequence {
  if (overdubEvents.length === 0 || base.duration <= 0) {
    return base;
  }

  const durationMs = base.duration;
  const sortedOverdub = [...overdubEvents].sort(
    (a, b) => a.timestamp - b.timestamp || (a.type === 'noteOff' ? -1 : 1),
  );
  const overdubPairs = pairNotes(sortedOverdub);
  if (overdubPairs.length === 0) {
    return base;
  }

  const wrappedOverdubPairs: NotePair[] = [];
  for (let i = 0; i < overdubPairs.length; i++) {
    const p = overdubPairs[i];
    const rawDuration = Math.max(0, p.end - p.start);
    if (rawDuration <= 0) continue;

    if (rawDuration >= durationMs) {
      wrappedOverdubPairs.push({
        note: p.note,
        velocity: p.velocity,
        start: 0,
        end: durationMs,
      });
      continue;
    }

    const start = wrapTimeToDuration(p.start, durationMs);
    const end = start + rawDuration;

    if (end <= durationMs) {
      wrappedOverdubPairs.push({
        note: p.note,
        velocity: p.velocity,
        start,
        end,
      });
      continue;
    }

    wrappedOverdubPairs.push({
      note: p.note,
      velocity: p.velocity,
      start,
      end: durationMs,
    });
    wrappedOverdubPairs.push({
      note: p.note,
      velocity: p.velocity,
      start: 0,
      end: end - durationMs,
    });
  }

  if (wrappedOverdubPairs.length === 0) {
    return base;
  }

  const mergedPairs = deduplicateOverlaps([
    ...pairNotes(base.events),
    ...wrappedOverdubPairs,
  ]);

  return {
    ...base,
    events: pairsToEvents(mergedPairs),
  };
}

export function snapRepeatStartTime(params: {
  currentTime: number;
  durationMs: number;
  visualNotes: SequenceVisualNote[];
}): number {
  const { currentTime, durationMs, visualNotes } = params;
  if (durationMs <= 0) return currentTime;

  let startTime = Math.round(currentTime / durationMs) * durationMs;

  let previousEnd: number | undefined;
  for (let i = visualNotes.length - 1; i >= 0; i--) {
    if (visualNotes[i].endTime != null) {
      previousEnd = visualNotes[i].endTime;
      break;
    }
  }

  if (
    previousEnd != null &&
    startTime < previousEnd &&
    previousEnd - startTime < durationMs * 0.5
  ) {
    startTime = previousEnd;
  }

  return startTime;
}

export function getLatestPredictedEndTimeForNote(
  visualNotes: SequenceVisualNote[],
  note: number,
): number | undefined {
  for (let i = visualNotes.length - 1; i >= 0; i--) {
    if (visualNotes[i].note === note) {
      if (visualNotes[i].endTime != null) {
        return visualNotes[i].endTime;
      }
      break;
    }
  }
  return undefined;
}
