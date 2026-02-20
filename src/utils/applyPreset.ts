import NativeAudioModule from '../specs/NativeAudioModule';
import { SynthPreset } from '../data/synthPresets';

/**
 * Apply a full synth preset to a channel.
 * Sets voice params + ADSR + volume via one native call,
 * then clears and re-adds post-effects.
 */
export function applyPreset(channel: number, preset: SynthPreset): void {
  // Apply voice params + ADSR + volume in one call
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

  // Clear existing effects and re-add from preset
  NativeAudioModule.clearEffects(channel);

  if (preset.effects) {
    for (const effect of preset.effects) {
      const effectId = NativeAudioModule.addEffect(channel, effect.type);
      for (const [paramName, value] of Object.entries(effect.params)) {
        NativeAudioModule.setEffectParameter(channel, effectId, paramName, value);
      }
    }
  }
}
