function buildNoteCounts(touchNotes: Map<string, number>): Map<number, number> {
  const counts = new Map<number, number>();
  touchNotes.forEach(note => {
    counts.set(note, (counts.get(note) ?? 0) + 1);
  });
  return counts;
}

export function getTouchTransitions(
  prevTouchNotes: Map<string, number>,
  nextTouchNotes: Map<string, number>,
): { noteOns: number[]; noteOffs: number[] } {
  const prevCounts = buildNoteCounts(prevTouchNotes);
  const nextCounts = buildNoteCounts(nextTouchNotes);
  const notes = new Set<number>([...prevCounts.keys(), ...nextCounts.keys()]);

  const noteOns: number[] = [];
  const noteOffs: number[] = [];

  notes.forEach(note => {
    const prev = prevCounts.get(note) ?? 0;
    const next = nextCounts.get(note) ?? 0;
    if (prev === 0 && next > 0) {
      noteOns.push(note);
      return;
    }
    if (prev > 0 && next === 0) {
      noteOffs.push(note);
    }
  });

  return { noteOns, noteOffs };
}
