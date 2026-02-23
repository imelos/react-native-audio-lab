import { createLoopSequence, pairNotes } from '../loopUtils';

describe('loopUtils overdub fixed-duration path', () => {
  it('keeps 6-bar duration and wraps events instead of expanding to 8 bars', () => {
    const bpm = 120;
    const beatMs = 60000 / bpm; // 500
    const barMs = beatMs * 4; // 2000
    const sixBars = barMs * 6; // 12000
    const step = beatMs / 2; // 1/8 => 250

    // Simulate recording one full 6-bar pass that started 1 bar into
    // the master loop timeline: timestamps span [2000, 14000).
    const events = [];
    for (let i = 0; i < 48; i++) {
      const start = 2000 + i * step;
      const end = start + step;
      events.push(
        { type: 'noteOn' as const, note: 60, timestamp: start, velocity: 0.85 },
        { type: 'noteOff' as const, note: 60, timestamp: end, velocity: 0 },
      );
    }

    const loop = createLoopSequence(
      events,
      'overdub-like first take',
      bpm,
      sixBars,
    );

    expect(loop).not.toBeNull();
    expect(loop!.durationBars).toBe(6);
    expect(loop!.duration).toBe(sixBars);

    const pairs = pairNotes(loop!.events);
    expect(pairs.length).toBeGreaterThan(0);

    for (const p of pairs) {
      expect(p.start).toBeGreaterThanOrEqual(0);
      expect(p.end).toBeGreaterThan(p.start);
      expect(p.end).toBeLessThanOrEqual(sixBars);
    }
  });
});
