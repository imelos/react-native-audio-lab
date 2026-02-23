import { getTouchTransitions } from '../touchTransitions';

const mapFromEntries = (entries: Array<[string, number]>) =>
  new Map<string, number>(entries);

describe('getTouchTransitions', () => {
  it('does not emit noteOff when one of multiple touches on the same note ends', () => {
    const prev = mapFromEntries([
      ['t1', 60],
      ['t2', 60],
    ]);
    const next = mapFromEntries([['t2', 60]]);

    const out = getTouchTransitions(prev, next);

    expect(out.noteOns).toEqual([]);
    expect(out.noteOffs).toEqual([]);
  });

  it('emits noteOn when a note becomes active for the first touch', () => {
    const prev = mapFromEntries([]);
    const next = mapFromEntries([['t1', 62]]);

    const out = getTouchTransitions(prev, next);

    expect(out.noteOns).toEqual([62]);
    expect(out.noteOffs).toEqual([]);
  });

  it('emits noteOff when the last touch leaves a note', () => {
    const prev = mapFromEntries([['t1', 65]]);
    const next = mapFromEntries([]);

    const out = getTouchTransitions(prev, next);

    expect(out.noteOns).toEqual([]);
    expect(out.noteOffs).toEqual([65]);
  });
});
