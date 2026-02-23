export interface RecordingArmPolicyInput {
  source: 'touch' | 'trigger';
  repeatEnabled: boolean;
  hasSequence: boolean;
  isPlaying: boolean;
  loopDurationMs: number;
  loopPositionMs: number;
  intervalMs: number;
  maxGuardMs: number;
}

function clampLoopPosition(loopPositionMs: number, loopDurationMs: number): number {
  if (loopDurationMs <= 0) return 0;
  const wrapped = loopPositionMs % loopDurationMs;
  return wrapped < 0 ? wrapped + loopDurationMs : wrapped;
}

export function shouldDeferRecordingArmOnTouch(
  input: RecordingArmPolicyInput,
): boolean {
  const {
    source,
    repeatEnabled,
    hasSequence,
    isPlaying,
    loopDurationMs,
    loopPositionMs,
    intervalMs,
    maxGuardMs,
  } = input;

  if (source !== 'touch') return false;
  if (!repeatEnabled) return false;
  if (hasSequence) return false;
  if (!isPlaying) return false;
  if (loopDurationMs <= 0) return false;
  if (intervalMs <= 0 || maxGuardMs <= 0) return false;

  const safeLoopPos = clampLoopPosition(loopPositionMs, loopDurationMs);
  const remaining = loopDurationMs - safeLoopPos;
  const guardMs = Math.min(intervalMs * 0.5, maxGuardMs);

  return remaining <= guardMs;
}
