// NativeAudioModule.ts
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  // Instrument Management
  createInstrument(channel: number, name: string, polyphony: number, waveform: string): void;
  removeInstrument(channel: number): void;
  clearAllInstruments(): void;

  // Note Control
  noteOn(channel: number, midiNote: number, velocity: number): void;
  noteOff(channel: number, midiNote: number): void;
  allNotesOff(channel: number): void;
  allNotesOffAllChannels(): void;

  // Instrument Parameters
  setWaveform(channel: number, type: string): void;
  setADSR(channel: number, attack: number, decay: number, sustain: number, release: number): void;
  setVolume(channel: number, volume: number): void;
  setPan(channel: number, pan: number): void;
  setDetune(channel: number, cents: number): void;

  // Effects Management
  addEffect(channel: number, type: string): void;
  removeEffect(channel: number, effectId: number): void;
  clearEffects(channel: number): void;
  setEffectEnabled(channel: number, effectId: number, enabled: boolean): void;
  setEffectParameter(channel: number, effectId: number, paramName: string, value: number): void;

  // Global Controls
  setMasterVolume(volume: number): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('AudioModule');