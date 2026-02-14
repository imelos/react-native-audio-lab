// NativeAudioModuleV2.ts
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  // ────────────────────────────────────────────────
  // Instrument Management
  // ────────────────────────────────────────────────
  
  // Create oscillator-based instrument
  createOscillatorInstrument(channel: number, name: string, polyphony: number, waveform: string): void;
  
  // Create multi-sampler instrument
  createMultiSamplerInstrument(channel: number, name: string, polyphony: number): void;
  
  // Remove instruments
  removeInstrument(channel: number): void;
  clearAllInstruments(): void;
  
  // Get instrument info
  getInstrumentType(channel: number): string; // Returns 'oscillator', 'sampler', or 'none'

  // ────────────────────────────────────────────────
  // Sample Loading (MultiSampler only)
  // ────────────────────────────────────────────────
  
  /**
   * Load a sample from a file path
   * @param channel Channel number (1-16)
   * @param slotIndex Sample slot (0-15)
   * @param filePath Path to audio file
   * @param name Sample name
   * @param rootNote MIDI note for original pitch (0-127)
   * @param minNote Minimum MIDI note (0-127)
   * @param maxNote Maximum MIDI note (0-127)
   */
  loadSample(
    channel: number,
    slotIndex: number,
    filePath: string,
    name: string,
    rootNote: number,
    minNote: number,
    maxNote: number
  ): void;
  
  /**
   * Load a sample from base64-encoded audio data
   * @param channel Channel number (1-16)
   * @param slotIndex Sample slot (0-15)
   * @param base64Data Base64-encoded audio data
   * @param sampleRate Sample rate of the audio
   * @param numChannels Number of channels (1 or 2)
   * @param name Sample name
   * @param rootNote MIDI note for original pitch (0-127)
   * @param minNote Minimum MIDI note (0-127)
   * @param maxNote Maximum MIDI note (0-127)
   */
  loadSampleFromBase64(
    channel: number,
    slotIndex: number,
    base64Data: string,
    sampleRate: number,
    numChannels: number,
    name: string,
    rootNote: number,
    minNote: number,
    maxNote: number
  ): void;
  
  // Clear samples
  clearSample(channel: number, slotIndex: number): void;
  clearAllSamples(channel: number): void;

  // ────────────────────────────────────────────────
  // Note Control
  // ────────────────────────────────────────────────
  noteOn(channel: number, midiNote: number, velocity: number): void;
  noteOff(channel: number, midiNote: number): void;
  allNotesOff(channel: number): void;
  allNotesOffAllChannels(): void;

  // ────────────────────────────────────────────────
  // Common Parameters (work for both instrument types)
  // ────────────────────────────────────────────────
  setADSR(channel: number, attack: number, decay: number, sustain: number, release: number): void;
  setVolume(channel: number, volume: number): void;
  setPan(channel: number, pan: number): void;

  // ────────────────────────────────────────────────
  // Oscillator-Specific Parameters
  // ────────────────────────────────────────────────
  setWaveform(channel: number, type: string): void;
  setDetune(channel: number, cents: number): void;

  // ────────────────────────────────────────────────
  // Effects Management (Oscillator only)
  // ────────────────────────────────────────────────
  addEffect(channel: number, type: string): void;
  removeEffect(channel: number, effectId: number): void;
  clearEffects(channel: number): void;
  setEffectEnabled(channel: number, effectId: number, enabled: boolean): void;
  setEffectParameter(channel: number, effectId: number, paramName: string, value: number): void;

  // ────────────────────────────────────────────────
  // Global Controls
  // ────────────────────────────────────────────────
  setMasterVolume(volume: number): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('AudioModule');