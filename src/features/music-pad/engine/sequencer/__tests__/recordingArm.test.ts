import { shouldDeferRecordingArmOnTouch } from '../recordingArm';

describe('recordingArm policy', () => {
  it('defers touch arming near loop end for repeat first-take while playing', () => {
    expect(
      shouldDeferRecordingArmOnTouch({
        source: 'touch',
        repeatEnabled: true,
        hasSequence: false,
        isPlaying: true,
        loopDurationMs: 12000,
        loopPositionMs: 11920,
        intervalMs: 250,
        maxGuardMs: 200,
      }),
    ).toBe(true);
  });

  it('does not defer when outside the guard window', () => {
    expect(
      shouldDeferRecordingArmOnTouch({
        source: 'touch',
        repeatEnabled: true,
        hasSequence: false,
        isPlaying: true,
        loopDurationMs: 12000,
        loopPositionMs: 11600,
        intervalMs: 250,
        maxGuardMs: 200,
      }),
    ).toBe(false);
  });

  it('never defers trigger-source arming', () => {
    expect(
      shouldDeferRecordingArmOnTouch({
        source: 'trigger',
        repeatEnabled: true,
        hasSequence: false,
        isPlaying: true,
        loopDurationMs: 12000,
        loopPositionMs: 11990,
        intervalMs: 250,
        maxGuardMs: 200,
      }),
    ).toBe(false);
  });

  it('never defers for overdub or transport stopped', () => {
    expect(
      shouldDeferRecordingArmOnTouch({
        source: 'touch',
        repeatEnabled: true,
        hasSequence: true,
        isPlaying: true,
        loopDurationMs: 12000,
        loopPositionMs: 11990,
        intervalMs: 250,
        maxGuardMs: 200,
      }),
    ).toBe(false);

    expect(
      shouldDeferRecordingArmOnTouch({
        source: 'touch',
        repeatEnabled: true,
        hasSequence: false,
        isPlaying: false,
        loopDurationMs: 12000,
        loopPositionMs: 11990,
        intervalMs: 250,
        maxGuardMs: 200,
      }),
    ).toBe(false);
  });
});
