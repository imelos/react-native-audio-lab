import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { useNoteRepeat, NoteRepeatMode } from '../useNoteRepeat';
import GlobalSequencer from '../GlobalSequencer';
import performance from 'react-native-performance';

jest.mock('react-native-performance', () => {
  let now = 0;
  return {
    __esModule: true,
    default: {
      now: jest.fn(() => now),
      __setNow(value: number) {
        now = value;
      },
    },
  };
});

jest.mock('../../../../specs/NativeAudioModule', () => ({
  __esModule: true,
  default: {
    noteOn: jest.fn(),
    noteOff: jest.fn(),
  },
}));

type PerfMock = {
  __setNow: (value: number) => void;
};

type NoteOnFn = (note: number, velocity: number, duration?: number) => void;
type NoteOffFn = (note: number) => void;
type RafCallback = (time: number) => void;

let api:
  | ReturnType<typeof useNoteRepeat>
  | null = null;

function Harness({
  mode,
  onNoteOn,
  onNoteOff,
}: {
  mode: NoteRepeatMode;
  onNoteOn: NoteOnFn;
  onNoteOff: NoteOffFn;
}) {
  api = useNoteRepeat({ mode, onNoteOn, onNoteOff });
  return null;
}

describe('useNoteRepeat regressions', () => {
  let rafQueue: Array<{ id: number; cb: RafCallback }> = [];
  let nextRafId = 1;
  let originalRAF: typeof globalThis.requestAnimationFrame | undefined;
  let originalCancelRAF: typeof globalThis.cancelAnimationFrame | undefined;
  const perf = performance as unknown as PerfMock;

  const setNow = (value: number) => {
    perf.__setNow(value);
  };

  const runNextFrame = () => {
    const next = rafQueue.shift();
    if (!next) {
      throw new Error('RAF queue is empty');
    }
    act(() => {
      next.cb(0);
    });
  };

  beforeEach(() => {
    api = null;
    rafQueue = [];
    nextRafId = 1;
    setNow(100);

    originalRAF = globalThis.requestAnimationFrame;
    originalCancelRAF = globalThis.cancelAnimationFrame;

    globalThis.requestAnimationFrame = ((cb: RafCallback) => {
      const id = nextRafId++;
      rafQueue.push({ id, cb });
      return id;
    }) as typeof globalThis.requestAnimationFrame;

    globalThis.cancelAnimationFrame = ((id: number) => {
      rafQueue = rafQueue.filter(entry => entry.id !== id);
    }) as typeof globalThis.cancelAnimationFrame;
  });

  afterEach(() => {
    GlobalSequencer.getInstance().destroy();
    globalThis.requestAnimationFrame =
      originalRAF ??
      ((() => {
        throw new Error('requestAnimationFrame missing');
      }) as typeof globalThis.requestAnimationFrame);
    globalThis.cancelAnimationFrame =
      originalCancelRAF ??
      ((() => {}) as typeof globalThis.cancelAnimationFrame);
  });

  it('fires a one-shot note for taps released during the chord collection window', () => {
    const onNoteOn = jest.fn<ReturnType<NoteOnFn>, Parameters<NoteOnFn>>();
    const onNoteOff = jest.fn<ReturnType<NoteOffFn>, Parameters<NoteOffFn>>();

    let renderer: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <Harness mode="1/8" onNoteOn={onNoteOn} onNoteOff={onNoteOff} />,
      );
    });

    act(() => {
      api!.handleNoteOn(60, 0.85);
      api!.handleNoteOff(60);
    });

    setNow(105);
    runNextFrame(); // still collecting

    setNow(112);
    runNextFrame(); // leaves collection, aligns grid

    setNow(113);
    runNextFrame(); // first grid tick should fire pending oneshot

    expect(onNoteOn).toHaveBeenCalledTimes(1);
    expect(onNoteOn).toHaveBeenCalledWith(60, 0.85, 250);

    setNow(370);
    runNextFrame(); // next grid tick should close sounding note

    expect(onNoteOff).toHaveBeenCalledWith(60);

    act(() => {
      renderer!.unmount();
    });
  });
});
