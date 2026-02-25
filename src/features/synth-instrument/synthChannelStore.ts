import { create } from 'zustand';
import { type Waveform, type FilterType } from './types';
import { type PresetCategory } from '../../data/synthPresets';

export interface ChannelSynthParams {
  waveform: Waveform;
  osc2Waveform: Waveform;
  osc2Level: number;
  osc2Semi: number;
  osc2Detune: number;
  subLevel: number;
  noiseLevel: number;
  voiceFilterEnabled: boolean;
  voiceFilterCutoff: number;
  voiceFilterResonance: number;
  voiceFilterEnvAmount: number;
  chainFilterEnabled: boolean;
  chainFilterType: FilterType;
  chainFilterCutoff: number;
  chainFilterResonance: number;
  reverbEnabled: boolean;
  reverbRoomSize: number;
  reverbWetLevel: number;
  delayEnabled: boolean;
  delayTime: number;
  delayFeedback: number;
  delayWetLevel: number;
  chorusEnabled: boolean;
  chorusRate: number;
  chorusDepth: number;
  chorusMix: number;
  distortionEnabled: boolean;
  distortionDrive: number;
  distortionMix: number;
  distortionTone: number;
  compressorEnabled: boolean;
  compThreshold: number;
  compRatio: number;
  compAttack: number;
  compRelease: number;
  activePresetName: string | null;
  selectedCategory: PresetCategory;
}

export interface ChannelEffectIds {
  filterId: number;
  reverbId: number;
  delayId: number;
  chorusId: number;
  distortionId: number;
  compressorId: number;
}

interface ChannelEntry {
  params: ChannelSynthParams;
  effectIds: ChannelEffectIds | null;
}

export const DEFAULT_PARAMS: ChannelSynthParams = {
  waveform: 'sine',
  osc2Waveform: 'sine',
  osc2Level: 0,
  osc2Semi: 0,
  osc2Detune: 0,
  subLevel: 0,
  noiseLevel: 0,
  voiceFilterEnabled: false,
  voiceFilterCutoff: 8000,
  voiceFilterResonance: 0,
  voiceFilterEnvAmount: 0,
  chainFilterEnabled: false,
  chainFilterType: 'LowPass',
  chainFilterCutoff: 1000,
  chainFilterResonance: 0.7,
  reverbEnabled: false,
  reverbRoomSize: 0.5,
  reverbWetLevel: 0.33,
  delayEnabled: false,
  delayTime: 500,
  delayFeedback: 0.4,
  delayWetLevel: 0.5,
  chorusEnabled: false,
  chorusRate: 1.0,
  chorusDepth: 0.25,
  chorusMix: 0.5,
  distortionEnabled: false,
  distortionDrive: 1.0,
  distortionMix: 0.5,
  distortionTone: 0.5,
  compressorEnabled: false,
  compThreshold: -20,
  compRatio: 4,
  compAttack: 10,
  compRelease: 100,
  activePresetName: null,
  selectedCategory: 'Keys',
};

interface SynthChannelStore {
  channels: Record<number, ChannelEntry>;
  getOrInit(channelId: number): ChannelEntry;
  patchParams(channelId: number, patch: Partial<ChannelSynthParams>): void;
  setEffectIds(channelId: number, ids: ChannelEffectIds): void;
}

export const useSynthChannelStore = create<SynthChannelStore>()((set, get) => ({
  channels: {},

  getOrInit(channelId) {
    const existing = get().channels[channelId];
    if (existing) return existing;
    const entry: ChannelEntry = { params: { ...DEFAULT_PARAMS }, effectIds: null };
    set(state => ({ channels: { ...state.channels, [channelId]: entry } }));
    return entry;
  },

  patchParams(channelId, patch) {
    set(state => {
      const existing = state.channels[channelId] ?? { params: { ...DEFAULT_PARAMS }, effectIds: null };
      return {
        channels: {
          ...state.channels,
          [channelId]: { ...existing, params: { ...existing.params, ...patch } },
        },
      };
    });
  },

  setEffectIds(channelId, ids) {
    set(state => {
      const existing = state.channels[channelId] ?? { params: { ...DEFAULT_PARAMS }, effectIds: null };
      return {
        channels: {
          ...state.channels,
          [channelId]: { ...existing, effectIds: ids },
        },
      };
    });
  },
}));
