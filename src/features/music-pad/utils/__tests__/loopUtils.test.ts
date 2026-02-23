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

  it('extends beyond master duration when captured span is longer than one cycle', () => {
    const bpm = 120;
    const beatMs = 60000 / bpm; // 500
    const barMs = beatMs * 4; // 2000
    const threeBars = barMs * 3; // 6000
    const step = beatMs / 2; // 1/8 => 250

    // Start 1 bar into timeline and record 4 bars of content.
    // Normalized span is ~8000ms, so loop should expand to 4 bars.
    const events = [];
    const startOffset = barMs;
    for (let i = 0; i < 31; i++) {
      const start = startOffset + i * step;
      const end = start + step;
      events.push(
        { type: 'noteOn' as const, note: 62, timestamp: start, velocity: 0.85 },
        { type: 'noteOff' as const, note: 62, timestamp: end, velocity: 0 },
      );
    }

    const loop = createLoopSequence(
      events,
      'first take longer than master',
      bpm,
      threeBars,
    );

    expect(loop).not.toBeNull();
    expect(loop!.durationBars).toBe(4);
    expect(loop!.duration).toBe(barMs * 4);
    const pairs = pairNotes(loop!.events).filter(p => p.note === 62);
    expect(pairs.length).toBeGreaterThan(0);
    // Keep timeline phase: content started at bar offset, not forced to 0.
    expect(pairs.some(p => p.start === startOffset)).toBe(true);
  });

  it('keeps transport offset for shorter first-take while playing', () => {
    const bpm = 120;
    const beatMs = 60000 / bpm; // 500
    const barMs = beatMs * 4; // 2000
    const threeBars = barMs * 3; // 6000
    const startOffset = barMs; // start at bar 2

    const events = [
      { type: 'noteOn' as const, note: 64, timestamp: startOffset, velocity: 0.9 },
      {
        type: 'noteOff' as const,
        note: 64,
        timestamp: startOffset + beatMs / 2,
        velocity: 0,
      },
      {
        type: 'noteOn' as const,
        note: 64,
        timestamp: startOffset + beatMs,
        velocity: 0.9,
      },
      {
        type: 'noteOff' as const,
        note: 64,
        timestamp: startOffset + beatMs * 1.5,
        velocity: 0,
      },
    ];

    const loop = createLoopSequence(
      events,
      'first take keep offset',
      bpm,
      threeBars,
    );

    expect(loop).not.toBeNull();
    expect(loop!.duration).toBe(threeBars);
    const pairs = pairNotes(loop!.events).filter(p => p.note === 64);
    expect(pairs[0].start).toBe(startOffset);
  });
});
