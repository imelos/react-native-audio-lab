import GlobalSequencer, { ChannelDelegate } from '../GlobalSequencer';
import type { LoopSequence, NoteEvent } from '../../utils/loopUtils';
import NativeAudioModule from '../../../../specs/NativeAudioModule';
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

type RafEntry = {
  id: number;
  cb: RafCallback;
};

type RafCallback = (time: number) => void;

const perf = performance as unknown as PerfMock;
const native = NativeAudioModule as unknown as {
  noteOn: jest.Mock;
  noteOff: jest.Mock;
};

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

describe('GlobalSequencer regressions', () => {
  let rafQueue: RafEntry[] = [];
  let nextRafId = 1;
  let originalRAF: typeof globalThis.requestAnimationFrame | undefined;
  let originalCancelRAF: typeof globalThis.cancelAnimationFrame | undefined;

  const setNow = (value: number) => {
    perf.__setNow(value);
  };

  const runNextFrame = () => {
    const next = rafQueue.shift();
    if (!next) {
      throw new Error('RAF queue is empty');
    }
    next.cb(0);
  };

  beforeEach(() => {
    rafQueue = [];
    nextRafId = 1;
    setNow(0);
    native.noteOn.mockClear();
    native.noteOff.mockClear();

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

  it('does not replay past events when replacing a sequence during playback', () => {
    const sequencer = GlobalSequencer.getInstance();
    const delegate: ChannelDelegate = {
      onNoteOn: jest.fn(),
      onNoteOff: jest.fn(),
      onTick: jest.fn(),
      onLoopWrap: jest.fn(),
    };

    const first = makeSequence(
      [
        { type: 'noteOn', note: 60, timestamp: 100, velocity: 0.9 },
        { type: 'noteOff', note: 60, timestamp: 120, velocity: 0 },
      ],
      400,
    );

    const replacement = makeSequence(
      [
        { type: 'noteOn', note: 62, timestamp: 100, velocity: 0.8 },
        { type: 'noteOff', note: 62, timestamp: 200, velocity: 0 },
        { type: 'noteOn', note: 63, timestamp: 300, velocity: 0.7 },
        { type: 'noteOff', note: 63, timestamp: 350, velocity: 0 },
      ],
      400,
    );

    sequencer.registerChannel(1, delegate);
    sequencer.setSequence(1, first);
    sequencer.play();

    setNow(150);
    runNextFrame(); // consumes first sequence events at 100/120

    native.noteOn.mockClear();
    native.noteOff.mockClear();
    (delegate.onNoteOn as jest.Mock).mockClear();
    (delegate.onNoteOff as jest.Mock).mockClear();

    setNow(250);
    sequencer.setSequence(1, replacement);
    runNextFrame(); // should not re-fire replacement events at 100/200

    expect(native.noteOn).not.toHaveBeenCalled();
    expect(delegate.onNoteOn).not.toHaveBeenCalled();

    setNow(310);
    runNextFrame(); // now 300 event should fire

    expect(native.noteOn).toHaveBeenCalledWith(1, 63, 0.7);
    expect(delegate.onNoteOn).toHaveBeenCalledWith(63, 0.7);
  });

  it('keeps explicit loop-local record timestamps stable while playing', () => {
    const sequencer = GlobalSequencer.getInstance();
    const delegate: ChannelDelegate = {
      onNoteOn: jest.fn(),
      onNoteOff: jest.fn(),
      onTick: jest.fn(),
      onLoopWrap: jest.fn(),
    };

    sequencer.registerChannel(1, delegate);
    sequencer.setSequence(1, makeSequence([], 1000));

    setNow(0);
    sequencer.play();

    setNow(250);
    sequencer.startRecording(1);
    sequencer.pushRecordEvent(1, 'noteOn', 64, 0.9, 260);
    let events = sequencer.stopRecording(1);
    expect(events).toHaveLength(1);
    expect(events[0].timestamp).toBe(260);

    // Wrapped loop-local timestamp (50ms) after starting at 260ms offset.
    setNow(260);
    sequencer.startRecording(1);
    sequencer.pushRecordEvent(1, 'noteOn', 65, 0.9, 50);
    events = sequencer.stopRecording(1);
    expect(events).toHaveLength(1);
    expect(events[0].timestamp).toBe(1050);
  });

  it('does not wrap the first snapped repeat note to loop end', () => {
    const sequencer = GlobalSequencer.getInstance();
    const delegate: ChannelDelegate = {
      onNoteOn: jest.fn(),
      onNoteOff: jest.fn(),
      onTick: jest.fn(),
      onLoopWrap: jest.fn(),
    };

    sequencer.registerChannel(1, delegate);
    sequencer.setSequence(1, makeSequence([], 12000));

    setNow(0);
    sequencer.play();

    // Recording starts a few ms after the intended 2000ms grid point.
    setNow(2008);
    sequencer.startRecording(1);
    // First repeat hit is snapped back to the real grid boundary.
    sequencer.pushRecordEvent(1, 'noteOn', 60, 0.9, 2000);
    sequencer.pushRecordEvent(1, 'noteOff', 60, 0, 2250);
    const events = sequencer.stopRecording(1);

    expect(events).toEqual([
      { type: 'noteOn', note: 60, timestamp: 2000, velocity: 0.9 },
      { type: 'noteOff', note: 60, timestamp: 2250, velocity: 0 },
    ]);
  });

  it('relaunches a channel clip on the next quantized boundary', () => {
    const sequencer = GlobalSequencer.getInstance();
    const delegate: ChannelDelegate = {
      onNoteOn: jest.fn(),
      onNoteOff: jest.fn(),
      onTick: jest.fn(),
      onLoopWrap: jest.fn(),
    };

    const sequence = makeSequence(
      [
        { type: 'noteOn', note: 60, timestamp: 100, velocity: 0.9 },
        { type: 'noteOff', note: 60, timestamp: 180, velocity: 0 },
      ],
      4000,
    );

    sequencer.registerChannel(1, delegate);
    sequencer.setSequence(1, sequence);
    setNow(0);
    sequencer.play();

    setNow(120);
    runNextFrame(); // first pass note at 100ms
    native.noteOn.mockClear();

    setNow(700);
    sequencer.launchChannelClip(1); // should schedule at 2000ms

    setNow(1900);
    runNextFrame();
    expect(native.noteOn).not.toHaveBeenCalled();

    setNow(2100);
    runNextFrame(); // relaunch happened at 2000, so note fires again at 2100
    expect(native.noteOn).toHaveBeenCalledWith(1, 60, 0.9);
  });

  it('stops a channel clip on the next quantized boundary', () => {
    const sequencer = GlobalSequencer.getInstance();
    const delegate: ChannelDelegate = {
      onNoteOn: jest.fn(),
      onNoteOff: jest.fn(),
      onTick: jest.fn(),
      onLoopWrap: jest.fn(),
    };

    const sequence = makeSequence(
      [
        { type: 'noteOn', note: 60, timestamp: 100, velocity: 0.9 },
        { type: 'noteOff', note: 60, timestamp: 3000, velocity: 0 },
      ],
      4000,
    );

    sequencer.registerChannel(1, delegate);
    sequencer.setSequence(1, sequence);
    setNow(0);
    sequencer.play();

    setNow(120);
    runNextFrame(); // noteOn active
    native.noteOff.mockClear();

    setNow(700);
    sequencer.stopChannelClips(1); // should schedule stop at 2000ms

    setNow(1500);
    runNextFrame();
    expect(native.noteOff).not.toHaveBeenCalled();

    setNow(2100);
    runNextFrame(); // queued stop should silence at boundary
    expect(native.noteOff).toHaveBeenCalledWith(1, 60);
    expect(sequencer.getChannelPlaybackSnapshot(1).isLaunched).toBe(false);
  });
});
