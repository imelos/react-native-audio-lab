export type WaveformType = 'sine' | 'saw' | 'square' | 'triangle';

export type PresetCategory =
  | 'Keys'
  | 'Pads'
  | 'Bass'
  | 'Leads'
  | 'Plucks'
  | 'Bells';

export interface SynthPreset {
  name: string;
  category: PresetCategory;

  // Oscillator 1
  waveform1: WaveformType;
  detuneCents1: number;

  // Oscillator 2
  waveform2: WaveformType;
  detuneCents2: number;
  osc2Level: number; // 0-1
  osc2Semi: number; // -24 to +24

  // Sub-oscillator
  subLevel: number; // 0-1

  // Noise
  noiseLevel: number; // 0-1

  // Per-voice filter
  filterEnabled: boolean;
  filterCutoff: number; // Hz
  filterResonance: number; // 0-1
  filterEnvAmount: number; // 0-1

  // ADSR
  attack: number;
  decay: number;
  sustain: number;
  release: number;

  // Volume
  volume: number;

  // Post-effects (optional)
  effects?: Array<{
    type: 'reverb' | 'delay' | 'filter';
    params: Record<string, number>;
  }>;
}

export const PRESET_CATEGORIES: PresetCategory[] = [
  'Keys',
  'Pads',
  'Bass',
  'Leads',
  'Plucks',
  'Bells',
];

export const SYNTH_PRESETS: SynthPreset[] = [
  // ─── Keys ───────────────────────────────────
  {
    name: 'Electric Piano',
    category: 'Keys',
    waveform1: 'sine',
    detuneCents1: 0,
    waveform2: 'sine',
    detuneCents2: 1,
    osc2Level: 0.5,
    osc2Semi: 0,
    subLevel: 0,
    noiseLevel: 0,
    filterEnabled: true,
    filterCutoff: 3000,
    filterResonance: 0.1,
    filterEnvAmount: 0.4,
    attack: 0.005,
    decay: 0.8,
    sustain: 0.3,
    release: 0.4,
    volume: 0.75,
    effects: [{ type: 'reverb', params: { roomSize: 0.3, wetLevel: 0.2 } }],
  },
  {
    name: 'Organ',
    category: 'Keys',
    waveform1: 'sine',
    detuneCents1: 0,
    waveform2: 'sine',
    detuneCents2: 0,
    osc2Level: 0.6,
    osc2Semi: 12,
    subLevel: 0.4,
    noiseLevel: 0,
    filterEnabled: false,
    filterCutoff: 8000,
    filterResonance: 0,
    filterEnvAmount: 0,
    attack: 0.01,
    decay: 0.05,
    sustain: 1.0,
    release: 0.15,
    volume: 0.65,
  },
  {
    name: 'Clavinet',
    category: 'Keys',
    waveform1: 'square',
    detuneCents1: 0,
    waveform2: 'saw',
    detuneCents2: 0,
    osc2Level: 0.3,
    osc2Semi: 0,
    subLevel: 0,
    noiseLevel: 0.02,
    filterEnabled: true,
    filterCutoff: 4000,
    filterResonance: 0.3,
    filterEnvAmount: 0.6,
    attack: 0.002,
    decay: 0.3,
    sustain: 0.2,
    release: 0.15,
    volume: 0.7,
  },

  // ─── Pads ───────────────────────────────────
  {
    name: 'Warm Pad',
    category: 'Pads',
    waveform1: 'saw',
    detuneCents1: -8,
    waveform2: 'saw',
    detuneCents2: 8,
    osc2Level: 0.9,
    osc2Semi: 0,
    subLevel: 0.3,
    noiseLevel: 0,
    filterEnabled: true,
    filterCutoff: 2000,
    filterResonance: 0.15,
    filterEnvAmount: 0.2,
    attack: 0.5,
    decay: 1.0,
    sustain: 0.8,
    release: 2.0,
    volume: 0.6,
    effects: [{ type: 'reverb', params: { roomSize: 0.7, wetLevel: 0.4 } }],
  },
  {
    name: 'Ethereal Pad',
    category: 'Pads',
    waveform1: 'triangle',
    detuneCents1: -5,
    waveform2: 'sine',
    detuneCents2: 7,
    osc2Level: 0.7,
    osc2Semi: 7,
    subLevel: 0.2,
    noiseLevel: 0.05,
    filterEnabled: true,
    filterCutoff: 3500,
    filterResonance: 0.2,
    filterEnvAmount: 0.1,
    attack: 0.8,
    decay: 2.0,
    sustain: 0.6,
    release: 3.0,
    volume: 0.55,
    effects: [
      { type: 'reverb', params: { roomSize: 0.9, wetLevel: 0.5 } },
      { type: 'delay', params: { delayTime: 400, feedback: 0.3, wetLevel: 0.25 } },
    ],
  },
  {
    name: 'Dark Pad',
    category: 'Pads',
    waveform1: 'saw',
    detuneCents1: -12,
    waveform2: 'square',
    detuneCents2: 10,
    osc2Level: 0.6,
    osc2Semi: -12,
    subLevel: 0.5,
    noiseLevel: 0.03,
    filterEnabled: true,
    filterCutoff: 800,
    filterResonance: 0.3,
    filterEnvAmount: 0.15,
    attack: 0.6,
    decay: 1.5,
    sustain: 0.7,
    release: 2.5,
    volume: 0.6,
    effects: [{ type: 'reverb', params: { roomSize: 0.6, wetLevel: 0.35 } }],
  },

  // ─── Bass ───────────────────────────────────
  {
    name: 'Sub Bass',
    category: 'Bass',
    waveform1: 'sine',
    detuneCents1: 0,
    waveform2: 'sine',
    detuneCents2: 0,
    osc2Level: 0,
    osc2Semi: 0,
    subLevel: 0.8,
    noiseLevel: 0,
    filterEnabled: true,
    filterCutoff: 500,
    filterResonance: 0.1,
    filterEnvAmount: 0.1,
    attack: 0.01,
    decay: 0.3,
    sustain: 0.9,
    release: 0.2,
    volume: 0.85,
  },
  {
    name: 'Acid Bass',
    category: 'Bass',
    waveform1: 'saw',
    detuneCents1: 0,
    waveform2: 'saw',
    detuneCents2: 0,
    osc2Level: 0,
    osc2Semi: 0,
    subLevel: 0.3,
    noiseLevel: 0,
    filterEnabled: true,
    filterCutoff: 400,
    filterResonance: 0.7,
    filterEnvAmount: 0.8,
    attack: 0.005,
    decay: 0.25,
    sustain: 0.1,
    release: 0.15,
    volume: 0.75,
  },
  {
    name: 'Reese Bass',
    category: 'Bass',
    waveform1: 'saw',
    detuneCents1: -15,
    waveform2: 'saw',
    detuneCents2: 15,
    osc2Level: 1.0,
    osc2Semi: 0,
    subLevel: 0.4,
    noiseLevel: 0,
    filterEnabled: true,
    filterCutoff: 1200,
    filterResonance: 0.2,
    filterEnvAmount: 0.1,
    attack: 0.02,
    decay: 0.5,
    sustain: 0.7,
    release: 0.3,
    volume: 0.7,
  },

  // ─── Leads ──────────────────────────────────
  {
    name: 'Mono Lead',
    category: 'Leads',
    waveform1: 'saw',
    detuneCents1: 0,
    waveform2: 'square',
    detuneCents2: 5,
    osc2Level: 0.5,
    osc2Semi: 0,
    subLevel: 0.2,
    noiseLevel: 0,
    filterEnabled: true,
    filterCutoff: 3000,
    filterResonance: 0.3,
    filterEnvAmount: 0.4,
    attack: 0.005,
    decay: 0.2,
    sustain: 0.7,
    release: 0.2,
    volume: 0.7,
  },
  {
    name: 'Soft Lead',
    category: 'Leads',
    waveform1: 'triangle',
    detuneCents1: -3,
    waveform2: 'sine',
    detuneCents2: 3,
    osc2Level: 0.6,
    osc2Semi: 0,
    subLevel: 0,
    noiseLevel: 0,
    filterEnabled: true,
    filterCutoff: 4000,
    filterResonance: 0.1,
    filterEnvAmount: 0.2,
    attack: 0.02,
    decay: 0.3,
    sustain: 0.6,
    release: 0.3,
    volume: 0.7,
    effects: [
      { type: 'delay', params: { delayTime: 300, feedback: 0.25, wetLevel: 0.2 } },
    ],
  },

  // ─── Plucks ─────────────────────────────────
  {
    name: 'Synth Pluck',
    category: 'Plucks',
    waveform1: 'saw',
    detuneCents1: 0,
    waveform2: 'square',
    detuneCents2: 3,
    osc2Level: 0.4,
    osc2Semi: 0,
    subLevel: 0,
    noiseLevel: 0.03,
    filterEnabled: true,
    filterCutoff: 5000,
    filterResonance: 0.2,
    filterEnvAmount: 0.7,
    attack: 0.002,
    decay: 0.2,
    sustain: 0.0,
    release: 0.3,
    volume: 0.75,
    effects: [{ type: 'reverb', params: { roomSize: 0.4, wetLevel: 0.25 } }],
  },
  {
    name: 'Guitar Pluck',
    category: 'Plucks',
    waveform1: 'triangle',
    detuneCents1: 0,
    waveform2: 'saw',
    detuneCents2: 0,
    osc2Level: 0.2,
    osc2Semi: 0,
    subLevel: 0,
    noiseLevel: 0.08,
    filterEnabled: true,
    filterCutoff: 3000,
    filterResonance: 0.15,
    filterEnvAmount: 0.8,
    attack: 0.001,
    decay: 0.4,
    sustain: 0.0,
    release: 0.5,
    volume: 0.75,
    effects: [{ type: 'reverb', params: { roomSize: 0.35, wetLevel: 0.2 } }],
  },

  // ─── Bells ──────────────────────────────────
  {
    name: 'Crystal Bell',
    category: 'Bells',
    waveform1: 'sine',
    detuneCents1: 0,
    waveform2: 'triangle',
    detuneCents2: 2,
    osc2Level: 0.5,
    osc2Semi: 12,
    subLevel: 0,
    noiseLevel: 0,
    filterEnabled: true,
    filterCutoff: 6000,
    filterResonance: 0.15,
    filterEnvAmount: 0.3,
    attack: 0.001,
    decay: 1.5,
    sustain: 0.0,
    release: 2.0,
    volume: 0.65,
    effects: [{ type: 'reverb', params: { roomSize: 0.6, wetLevel: 0.4 } }],
  },
  {
    name: 'Music Box',
    category: 'Bells',
    waveform1: 'sine',
    detuneCents1: 0,
    waveform2: 'sine',
    detuneCents2: 0,
    osc2Level: 0.3,
    osc2Semi: 19,
    subLevel: 0,
    noiseLevel: 0,
    filterEnabled: true,
    filterCutoff: 5000,
    filterResonance: 0.1,
    filterEnvAmount: 0.5,
    attack: 0.001,
    decay: 1.0,
    sustain: 0.0,
    release: 1.5,
    volume: 0.6,
    effects: [
      { type: 'reverb', params: { roomSize: 0.5, wetLevel: 0.35 } },
      { type: 'delay', params: { delayTime: 250, feedback: 0.2, wetLevel: 0.15 } },
    ],
  },
];

export function getPresetsByCategory(
  category: PresetCategory,
): SynthPreset[] {
  return SYNTH_PRESETS.filter(p => p.category === category);
}
