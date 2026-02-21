import NativeAudioModule from '../specs/NativeAudioModule';
import { SynthPreset } from '../data/synthPresets';

export interface PresetEffectIds {
  reverbId: number | null;
  delayId: number | null;
  filterId: number | null;
}

/**
 * Apply a full synth preset to a channel.
 * Sets voice params + ADSR + volume via one native call,
 * then clears and re-adds post-effects.
 * Returns the native effect IDs for each effect type so the caller
 * can wire up real-time parameter updates.
 */
export function applyPreset(channel: number, preset: SynthPreset): PresetEffectIds {
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

  let reverbId: number | null = null;
  let delayId: number | null = null;
  let filterId: number | null = null;

  if (preset.effects) {
    for (const effect of preset.effects) {
      const effectId = NativeAudioModule.addEffect(channel, effect.type);
      if (effect.type === 'reverb') reverbId = effectId;
      else if (effect.type === 'delay') delayId = effectId;
      else if (effect.type === 'filter') filterId = effectId;
      for (const [paramName, value] of Object.entries(effect.params)) {
        NativeAudioModule.setEffectParameter(channel, effectId, paramName, value);
      }
    }
  }

  return { reverbId, delayId, filterId };
}
