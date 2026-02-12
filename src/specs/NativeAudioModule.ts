// NativeAudioModule.ts
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  noteOn(midiNote: number, velocity: number): void;
  noteOff(midiNote: number): void;
  setWaveform(type: 'sine' | 'saw' | 'square' | 'triangle'): void;
  setADSR(attack: number, decay: number, sustain: number, release: number): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('AudioModule');