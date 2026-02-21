import NativeAudioModule from '../specs/NativeAudioModule';
import { SynthPreset } from '../data/synthPresets';

/**
 * Apply a preset's voice-level parameters to a channel:
 * oscillators, sub/noise, per-voice filter envelope, ADSR, and volume.
 *
 * Post-processing effects (chain filter, reverb, delay) are managed
 * separately via permanent effect IDs stored in SynthScreen — this
 * function never adds, removes, or clears any effects.
 */
export function applyPreset(channel: number, preset: SynthPreset): void {
  NativeAudioModule.applyPreset(
    channel,
    preset.waveform1,
    preset.detuneCents1,
    preset.waveform2,
    preset.detuneCents2,
    preset.osc2Level,
    preset.osc2Semi,
    preset.subLevel,
    preset.noiseLevel,
    preset.filterEnabled,
    preset.filterCutoff,
    preset.filterResonance,
    preset.filterEnvAmount,
    preset.attack,
    preset.decay,
    preset.sustain,
    preset.release,
    preset.volume,
  );
}
