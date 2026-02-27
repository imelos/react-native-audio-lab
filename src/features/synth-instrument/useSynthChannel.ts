import { useState, useEffect, useRef, useCallback } from 'react';
import NativeAudioModule from '../../specs/NativeAudioModule';
import { type SynthPreset } from '../../data/synthPresets';
import { applyPreset } from '../../utils/applyPreset';
import { WAVEFORMS, FILTER_TYPES, type Waveform, type FilterType } from './types';
import {
  useSynthChannelStore,
  type ChannelSynthParams,
} from './synthChannelStore';
import GlobalSequencer from '../music-pad/hooks/GlobalSequencer';
import { normalizeParam, denormalizeParam } from './automationParams';

export interface SynthChannelHandle {
  // ── Osc state ────────────────────────────────────────────────────────
  waveform: Waveform;
  osc2Waveform: Waveform;
  osc2Level: number;
  osc2Semi: number;
  osc2Detune: number;
  subLevel: number;
  noiseLevel: number;

  // ── Voice filter state ────────────────────────────────────────────────
  voiceFilterEnabled: boolean;
  voiceFilterCutoff: number;
  voiceFilterResonance: number;
  voiceFilterEnvAmount: number;

  // ── Chain filter state ────────────────────────────────────────────────
  chainFilterEnabled: boolean;
  chainFilterType: FilterType;
  chainFilterCutoff: number;
  chainFilterResonance: number;

  // ── Reverb state ──────────────────────────────────────────────────────
  reverbEnabled: boolean;
  reverbRoomSize: number;
  reverbWetLevel: number;

  // ── Delay state ───────────────────────────────────────────────────────
  delayEnabled: boolean;
  delayTime: number;
  delayFeedback: number;
  delayWetLevel: number;

  // ── Chorus state ──────────────────────────────────────────────────────
  chorusEnabled: boolean;
  chorusRate: number;
  chorusDepth: number;
  chorusMix: number;

  // ── Distortion state ──────────────────────────────────────────────────
  distortionEnabled: boolean;
  distortionDrive: number;
  distortionMix: number;
  distortionTone: number;

  // ── Compressor state ──────────────────────────────────────────────────
  compressorEnabled: boolean;
  compThreshold: number;
  compRatio: number;
  compAttack: number;
  compRelease: number;

  // ── Advanced synthesis state ─────────────────────────────────────────
  pulseWidth: number;
  unisonCount: number;
  unisonSpread: number;
  glideTime: number;
  lfoRate: number;
  lfoDepth: number;
  lfoDestination: number;
  lfoWaveform: Waveform;

  // ── Preset state ──────────────────────────────────────────────────────
  activePresetName: string | null;
  selectedCategory: ChannelSynthParams['selectedCategory'];
  setSelectedCategory: (cat: ChannelSynthParams['selectedCategory']) => void;
  handlePresetSelect: (preset: SynthPreset) => void;

  // ── Osc callbacks ─────────────────────────────────────────────────────
  onWaveformChange: (v: number) => void;
  onOsc2WaveformChange: (v: number) => void;
  onOsc2LevelChange: (v: number) => void;
  onOsc2LevelComplete: (v: number) => void;
  onOsc2SemiChange: (v: number) => void;
  onOsc2SemiComplete: (v: number) => void;
  onOsc2DetuneChange: (v: number) => void;
  onOsc2DetuneComplete: (v: number) => void;
  onSubLevelChange: (v: number) => void;
  onSubLevelComplete: (v: number) => void;
  onNoiseLevelChange: (v: number) => void;
  onNoiseLevelComplete: (v: number) => void;

  // ── Voice filter callbacks ────────────────────────────────────────────
  toggleVoiceFilter: () => void;
  onVoiceFilterCutoffChange: (v: number) => void;
  onVoiceFilterCutoffComplete: (v: number) => void;
  onVoiceFilterResonanceChange: (v: number) => void;
  onVoiceFilterResonanceComplete: (v: number) => void;
  onVoiceFilterEnvAmountChange: (v: number) => void;
  onVoiceFilterEnvAmountComplete: (v: number) => void;

  // ── Chain filter callbacks ────────────────────────────────────────────
  toggleChainFilter: () => void;
  changeChainFilterType: () => void;
  onChainFilterCutoffChange: (v: number) => void;
  onChainFilterCutoffComplete: (v: number) => void;
  onChainFilterResonanceChange: (v: number) => void;
  onChainFilterResonanceComplete: (v: number) => void;

  // ── Reverb callbacks ──────────────────────────────────────────────────
  toggleReverb: () => void;
  onReverbRoomSizeChange: (v: number) => void;
  onReverbRoomSizeComplete: (v: number) => void;
  onReverbWetLevelChange: (v: number) => void;
  onReverbWetLevelComplete: (v: number) => void;

  // ── Delay callbacks ───────────────────────────────────────────────────
  toggleDelay: () => void;
  onDelayTimeChange: (v: number) => void;
  onDelayTimeComplete: (v: number) => void;
  onDelayFeedbackChange: (v: number) => void;
  onDelayFeedbackComplete: (v: number) => void;
  onDelayWetLevelChange: (v: number) => void;
  onDelayWetLevelComplete: (v: number) => void;

  // ── Chorus callbacks ──────────────────────────────────────────────────
  toggleChorus: () => void;
  onChorusRateChange: (v: number) => void;
  onChorusRateComplete: (v: number) => void;
  onChorusDepthChange: (v: number) => void;
  onChorusDepthComplete: (v: number) => void;
  onChorusMixChange: (v: number) => void;
  onChorusMixComplete: (v: number) => void;

  // ── Distortion callbacks ──────────────────────────────────────────────
  toggleDistortion: () => void;
  onDistortionDriveChange: (v: number) => void;
  onDistortionDriveComplete: (v: number) => void;
  onDistortionMixChange: (v: number) => void;
  onDistortionMixComplete: (v: number) => void;
  onDistortionToneChange: (v: number) => void;
  onDistortionToneComplete: (v: number) => void;

  // ── Compressor callbacks ──────────────────────────────────────────────
  toggleCompressor: () => void;
  onCompThresholdChange: (v: number) => void;
  onCompThresholdComplete: (v: number) => void;
  onCompRatioChange: (v: number) => void;
  onCompRatioComplete: (v: number) => void;
  onCompAttackChange: (v: number) => void;
  onCompAttackComplete: (v: number) => void;
  onCompReleaseChange: (v: number) => void;
  onCompReleaseComplete: (v: number) => void;

  // ── Advanced synthesis callbacks ──────────────────────────────────────
  onPulseWidthChange: (v: number) => void;
  onPulseWidthComplete: (v: number) => void;
  onUnisonCountChange: (v: number) => void;
  onUnisonCountComplete: (v: number) => void;
  onUnisonSpreadChange: (v: number) => void;
  onUnisonSpreadComplete: (v: number) => void;
  onGlideTimeChange: (v: number) => void;
  onGlideTimeComplete: (v: number) => void;
  onLfoRateChange: (v: number) => void;
  onLfoRateComplete: (v: number) => void;
  onLfoDepthChange: (v: number) => void;
  onLfoDepthComplete: (v: number) => void;
  onLfoDestinationChange: (v: number) => void;
  onLfoWaveformChange: (v: number) => void;
}

export function useSynthChannel(channelId: number): SynthChannelHandle {
  // Read persisted state once on mount (synchronous store access, no subscription)
  const { params: initial } = useSynthChannelStore.getState().getOrInit(channelId);

  // ── State — initialized from store so values survive navigation ───────
  const [waveform, setWaveform] = useState<Waveform>(initial.waveform);
  const [osc2Waveform, setOsc2Waveform] = useState<Waveform>(initial.osc2Waveform);
  const [osc2Level, setOsc2Level] = useState(initial.osc2Level);
  const [osc2Semi, setOsc2Semi] = useState(initial.osc2Semi);
  const [osc2Detune, setOsc2Detune] = useState(initial.osc2Detune);
  const [subLevel, setSubLevel] = useState(initial.subLevel);
  const [noiseLevel, setNoiseLevel] = useState(initial.noiseLevel);

  const [voiceFilterEnabled, setVoiceFilterEnabled] = useState(initial.voiceFilterEnabled);
  const [voiceFilterCutoff, setVoiceFilterCutoff] = useState(initial.voiceFilterCutoff);
  const [voiceFilterResonance, setVoiceFilterResonance] = useState(initial.voiceFilterResonance);
  const [voiceFilterEnvAmount, setVoiceFilterEnvAmount] = useState(initial.voiceFilterEnvAmount);

  const [chainFilterEnabled, setChainFilterEnabled] = useState(initial.chainFilterEnabled);
  const [chainFilterType, setChainFilterType] = useState<FilterType>(initial.chainFilterType);
  const [chainFilterCutoff, setChainFilterCutoff] = useState(initial.chainFilterCutoff);
  const [chainFilterResonance, setChainFilterResonance] = useState(initial.chainFilterResonance);

  const [reverbEnabled, setReverbEnabled] = useState(initial.reverbEnabled);
  const [reverbRoomSize, setReverbRoomSize] = useState(initial.reverbRoomSize);
  const [reverbWetLevel, setReverbWetLevel] = useState(initial.reverbWetLevel);

  const [delayEnabled, setDelayEnabled] = useState(initial.delayEnabled);
  const [delayTime, setDelayTime] = useState(initial.delayTime);
  const [delayFeedback, setDelayFeedback] = useState(initial.delayFeedback);
  const [delayWetLevel, setDelayWetLevel] = useState(initial.delayWetLevel);

  const [chorusEnabled, setChorusEnabled] = useState(initial.chorusEnabled);
  const [chorusRate, setChorusRate] = useState(initial.chorusRate);
  const [chorusDepth, setChorusDepth] = useState(initial.chorusDepth);
  const [chorusMix, setChorusMix] = useState(initial.chorusMix);

  const [distortionEnabled, setDistortionEnabled] = useState(initial.distortionEnabled);
  const [distortionDrive, setDistortionDrive] = useState(initial.distortionDrive);
  const [distortionMix, setDistortionMix] = useState(initial.distortionMix);
  const [distortionTone, setDistortionTone] = useState(initial.distortionTone);

  const [compressorEnabled, setCompressorEnabled] = useState(initial.compressorEnabled);
  const [compThreshold, setCompThreshold] = useState(initial.compThreshold);
  const [compRatio, setCompRatio] = useState(initial.compRatio);
  const [compAttack, setCompAttack] = useState(initial.compAttack);
  const [compRelease, setCompRelease] = useState(initial.compRelease);

  const [pulseWidth, setPulseWidth] = useState(initial.pulseWidth);
  const [unisonCount, setUnisonCount] = useState(initial.unisonCount);
  const [unisonSpread, setUnisonSpread] = useState(initial.unisonSpread);
  const [glideTime, setGlideTime] = useState(initial.glideTime);
  const [lfoRate, setLfoRate] = useState(initial.lfoRate);
  const [lfoDepth, setLfoDepth] = useState(initial.lfoDepth);
  const [lfoDestination, setLfoDestination] = useState(initial.lfoDestination);
  const [lfoWaveform, setLfoWaveform] = useState<Waveform>(initial.lfoWaveform);

  const [activePresetName, setActivePresetName] = useState<string | null>(initial.activePresetName);
  const [selectedCategory, setSelectedCategoryState] = useState(initial.selectedCategory);

  // ── Shorthand: update React state + store in one call ─────────────────
  const store = useSynthChannelStore.getState;
  const patch = useCallback(
    (p: Partial<ChannelSynthParams>) => store().patchParams(channelId, p),
    [channelId, store],
  );

  const setSelectedCategory = useCallback(
    (cat: ChannelSynthParams['selectedCategory']) => {
      setSelectedCategoryState(cat);
      patch({ selectedCategory: cat });
    },
    [patch],
  );

  // ── Effect ID refs (permanent, set once when instrument is first created) ─
  const filterIdRef = useRef<number | null>(null);
  const reverbIdRef = useRef<number | null>(null);
  const delayIdRef = useRef<number | null>(null);
  const chorusIdRef = useRef<number | null>(null);
  const distortionIdRef = useRef<number | null>(null);
  const compressorIdRef = useRef<number | null>(null);

  // ── Mount: create instrument on first visit, restore refs on return ────
  useEffect(() => {
    const { effectIds } = useSynthChannelStore.getState().getOrInit(channelId);

    if (effectIds === null) {
      // First visit: no stored IDs means native instrument doesn't exist yet
      NativeAudioModule.createOscillatorInstrument(channelId, 'Main Synth', 16, 'sine');
      NativeAudioModule.setADSR(channelId, 0.01, 0.1, 0.8, 0.3);

      const fId = NativeAudioModule.addEffect(channelId, 'filter');
      if (fId >= 0) {
        NativeAudioModule.setEffectEnabled(channelId, fId, false);
        NativeAudioModule.setEffectParameter(channelId, fId, 'cutoff', 1000);
        NativeAudioModule.setEffectParameter(channelId, fId, 'resonance', 0.7);
        NativeAudioModule.setEffectParameter(channelId, fId, 'type', 0);
        filterIdRef.current = fId;
      }

      const rId = NativeAudioModule.addEffect(channelId, 'reverb');
      if (rId >= 0) {
        NativeAudioModule.setEffectEnabled(channelId, rId, false);
        NativeAudioModule.setEffectParameter(channelId, rId, 'roomSize', 0.5);
        NativeAudioModule.setEffectParameter(channelId, rId, 'wetLevel', 0.33);
        reverbIdRef.current = rId;
      }

      const dId = NativeAudioModule.addEffect(channelId, 'delay');
      if (dId >= 0) {
        NativeAudioModule.setEffectEnabled(channelId, dId, false);
        NativeAudioModule.setEffectParameter(channelId, dId, 'delayTime', 500);
        NativeAudioModule.setEffectParameter(channelId, dId, 'feedback', 0.4);
        NativeAudioModule.setEffectParameter(channelId, dId, 'wetLevel', 0.5);
        delayIdRef.current = dId;
      }

      const chId = NativeAudioModule.addEffect(channelId, 'chorus');
      if (chId >= 0) {
        NativeAudioModule.setEffectEnabled(channelId, chId, false);
        NativeAudioModule.setEffectParameter(channelId, chId, 'rate', 1.0);
        NativeAudioModule.setEffectParameter(channelId, chId, 'depth', 0.25);
        NativeAudioModule.setEffectParameter(channelId, chId, 'mix', 0.5);
        chorusIdRef.current = chId;
      }

      const distId = NativeAudioModule.addEffect(channelId, 'distortion');
      if (distId >= 0) {
        NativeAudioModule.setEffectEnabled(channelId, distId, false);
        NativeAudioModule.setEffectParameter(channelId, distId, 'drive', 1.0);
        NativeAudioModule.setEffectParameter(channelId, distId, 'mix', 0.5);
        NativeAudioModule.setEffectParameter(channelId, distId, 'tone', 0.5);
        distortionIdRef.current = distId;
      }

      const compId = NativeAudioModule.addEffect(channelId, 'compressor');
      if (compId >= 0) {
        NativeAudioModule.setEffectEnabled(channelId, compId, false);
        NativeAudioModule.setEffectParameter(channelId, compId, 'threshold', -20);
        NativeAudioModule.setEffectParameter(channelId, compId, 'ratio', 4);
        NativeAudioModule.setEffectParameter(channelId, compId, 'attack', 10);
        NativeAudioModule.setEffectParameter(channelId, compId, 'release', 100);
        compressorIdRef.current = compId;
      }

      useSynthChannelStore.getState().setEffectIds(channelId, {
        filterId: fId,
        reverbId: rId,
        delayId: dId,
        chorusId: chId,
        distortionId: distId,
        compressorId: compId,
      });
    } else {
      // Return visit: native instrument + all its state still intact.
      // Just restore the effect ID refs so JS callbacks can reach the effects.
      filterIdRef.current = effectIds.filterId;
      reverbIdRef.current = effectIds.reverbId;
      delayIdRef.current = effectIds.delayId;
      chorusIdRef.current = effectIds.chorusId;
      distortionIdRef.current = effectIds.distortionId;
      compressorIdRef.current = effectIds.compressorId;
    }

    return () => {
      NativeAudioModule.allNotesOff(channelId);
    };
  }, [channelId]);

  // ── Automation recording helper ───────────────────────────────────
  const recordParam = useCallback(
    (paramId: string, rawValue: number) => {
      const seq = GlobalSequencer.getInstance();
      // Auto-arm recording on first knob touch during playback (overdub mode)
      if (!seq.isChannelRecording(channelId)) {
        if (seq.transportState === 'playing' && seq.getSequence(channelId) !== null) {
          seq.startRecording(channelId);
        } else {
          return;
        }
      }
      seq.pushAutomationEvent(channelId, paramId, normalizeParam(paramId, rawValue));
    },
    [channelId],
  );

  // ── Automation replay subscription ────────────────────────────────
  useEffect(() => {
    return GlobalSequencer.getInstance().onChannelAutomation(
      channelId,
      (paramId, normValue) => {
        const raw = denormalizeParam(paramId, normValue);
        switch (paramId) {
          // ── Osc ──────────────────────────────────────────────────
          case 'osc.waveform': {
            const wf = WAVEFORMS[Math.round(raw)];
            if (wf) { NativeAudioModule.setWaveform(channelId, wf); setWaveform(wf); setActivePresetName(null); }
            break;
          }
          case 'osc.osc2Waveform': {
            const wf = WAVEFORMS[Math.round(raw)];
            if (wf) { NativeAudioModule.setOsc2Waveform(channelId, wf); setOsc2Waveform(wf); }
            break;
          }
          case 'osc.osc2Level':
            NativeAudioModule.setOsc2Level(channelId, raw); setOsc2Level(raw);
            break;
          case 'osc.osc2Semi': {
            const r = Math.round(raw);
            NativeAudioModule.setOsc2Semi(channelId, r); setOsc2Semi(r);
            break;
          }
          case 'osc.osc2Detune':
            NativeAudioModule.setOsc2Detune(channelId, raw); setOsc2Detune(raw);
            break;
          case 'osc.subLevel':
            NativeAudioModule.setSubLevel(channelId, raw); setSubLevel(raw);
            break;
          case 'osc.noiseLevel':
            NativeAudioModule.setNoiseLevel(channelId, raw); setNoiseLevel(raw);
            break;
          case 'osc.pulseWidth':
            NativeAudioModule.setPulseWidth(channelId, raw); setPulseWidth(raw);
            break;
          case 'osc.unisonCount': {
            const r = Math.round(raw);
            NativeAudioModule.setUnisonCount(channelId, r); setUnisonCount(r);
            break;
          }
          case 'osc.unisonSpread':
            NativeAudioModule.setUnisonSpread(channelId, raw); setUnisonSpread(raw);
            break;
          case 'osc.glideTime':
            NativeAudioModule.setGlideTime(channelId, raw); setGlideTime(raw);
            break;
          // ── Voice filter ─────────────────────────────────────────
          case 'voiceFilter.cutoff':
            NativeAudioModule.setVoiceFilterCutoff(channelId, raw); setVoiceFilterCutoff(raw);
            break;
          case 'voiceFilter.resonance':
            NativeAudioModule.setVoiceFilterResonance(channelId, raw); setVoiceFilterResonance(raw);
            break;
          case 'voiceFilter.envAmount':
            NativeAudioModule.setVoiceFilterEnvAmount(channelId, raw); setVoiceFilterEnvAmount(raw);
            break;
          // ── Chain filter ─────────────────────────────────────────
          case 'filter.cutoff': {
            const id = filterIdRef.current;
            if (id !== null && id >= 0) { NativeAudioModule.setEffectParameter(channelId, id, 'cutoff', raw); setChainFilterCutoff(raw); }
            break;
          }
          case 'filter.resonance': {
            const id = filterIdRef.current;
            if (id !== null && id >= 0) { NativeAudioModule.setEffectParameter(channelId, id, 'resonance', raw); setChainFilterResonance(raw); }
            break;
          }
          // ── Reverb ───────────────────────────────────────────────
          case 'reverb.roomSize': {
            const id = reverbIdRef.current;
            if (id !== null && id >= 0) { NativeAudioModule.setEffectParameter(channelId, id, 'roomSize', raw); setReverbRoomSize(raw); }
            break;
          }
          case 'reverb.wetLevel': {
            const id = reverbIdRef.current;
            if (id !== null && id >= 0) { NativeAudioModule.setEffectParameter(channelId, id, 'wetLevel', raw); setReverbWetLevel(raw); }
            break;
          }
          // ── Delay ────────────────────────────────────────────────
          case 'delay.time': {
            const id = delayIdRef.current;
            if (id !== null && id >= 0) { NativeAudioModule.setEffectParameter(channelId, id, 'delayTime', raw); setDelayTime(raw); }
            break;
          }
          case 'delay.feedback': {
            const id = delayIdRef.current;
            if (id !== null && id >= 0) { NativeAudioModule.setEffectParameter(channelId, id, 'feedback', raw); setDelayFeedback(raw); }
            break;
          }
          case 'delay.wetLevel': {
            const id = delayIdRef.current;
            if (id !== null && id >= 0) { NativeAudioModule.setEffectParameter(channelId, id, 'wetLevel', raw); setDelayWetLevel(raw); }
            break;
          }
          // ── Chorus ───────────────────────────────────────────────
          case 'chorus.rate': {
            const id = chorusIdRef.current;
            if (id !== null && id >= 0) { NativeAudioModule.setEffectParameter(channelId, id, 'rate', raw); setChorusRate(raw); }
            break;
          }
          case 'chorus.depth': {
            const id = chorusIdRef.current;
            if (id !== null && id >= 0) { NativeAudioModule.setEffectParameter(channelId, id, 'depth', raw); setChorusDepth(raw); }
            break;
          }
          case 'chorus.mix': {
            const id = chorusIdRef.current;
            if (id !== null && id >= 0) { NativeAudioModule.setEffectParameter(channelId, id, 'mix', raw); setChorusMix(raw); }
            break;
          }
          // ── Distortion ───────────────────────────────────────────
          case 'distortion.drive': {
            const id = distortionIdRef.current;
            if (id !== null && id >= 0) { NativeAudioModule.setEffectParameter(channelId, id, 'drive', raw); setDistortionDrive(raw); }
            break;
          }
          case 'distortion.mix': {
            const id = distortionIdRef.current;
            if (id !== null && id >= 0) { NativeAudioModule.setEffectParameter(channelId, id, 'mix', raw); setDistortionMix(raw); }
            break;
          }
          case 'distortion.tone': {
            const id = distortionIdRef.current;
            if (id !== null && id >= 0) { NativeAudioModule.setEffectParameter(channelId, id, 'tone', raw); setDistortionTone(raw); }
            break;
          }
          // ── Compressor ───────────────────────────────────────────
          case 'comp.threshold': {
            const id = compressorIdRef.current;
            if (id !== null && id >= 0) { NativeAudioModule.setEffectParameter(channelId, id, 'threshold', raw); setCompThreshold(raw); }
            break;
          }
          case 'comp.ratio': {
            const id = compressorIdRef.current;
            if (id !== null && id >= 0) { NativeAudioModule.setEffectParameter(channelId, id, 'ratio', raw); setCompRatio(raw); }
            break;
          }
          case 'comp.attack': {
            const id = compressorIdRef.current;
            if (id !== null && id >= 0) { NativeAudioModule.setEffectParameter(channelId, id, 'attack', raw); setCompAttack(raw); }
            break;
          }
          case 'comp.release': {
            const id = compressorIdRef.current;
            if (id !== null && id >= 0) { NativeAudioModule.setEffectParameter(channelId, id, 'release', raw); setCompRelease(raw); }
            break;
          }
          // ── LFO ──────────────────────────────────────────────────
          case 'lfo.rate':
            NativeAudioModule.setLfoRate(channelId, raw); setLfoRate(raw);
            break;
          case 'lfo.depth':
            NativeAudioModule.setLfoDepth(channelId, raw); setLfoDepth(raw);
            break;
          case 'lfo.destination': {
            const r = Math.round(raw);
            NativeAudioModule.setLfoDestination(channelId, r); setLfoDestination(r);
            break;
          }
          case 'lfo.waveform': {
            const wf = WAVEFORMS[Math.round(raw)];
            if (wf) { NativeAudioModule.setLfoWaveform(channelId, wf); setLfoWaveform(wf); }
            break;
          }
        }
      },
    );
  }, [channelId]);

  // ── Preset handler ────────────────────────────────────────────────────
  const handlePresetSelect = useCallback(
    (preset: SynthPreset) => {
      applyPreset(channelId, preset);

      // Use store for current values as fallbacks (avoids stale closure)
      const cur = useSynthChannelStore.getState().getOrInit(channelId).params;

      // Compute final effect values (preset value ?? current stored value)
      const reverbFx = preset.effects?.find(e => e.type === 'reverb') ?? null;
      const newReverbEnabled = reverbFx !== null;
      const newReverbRoomSize = reverbFx?.params.roomSize ?? cur.reverbRoomSize;
      const newReverbWetLevel = reverbFx?.params.wetLevel ?? cur.reverbWetLevel;

      const delayFx = preset.effects?.find(e => e.type === 'delay') ?? null;
      const newDelayEnabled = delayFx !== null;
      const newDelayTime = delayFx?.params.delayTime ?? cur.delayTime;
      const newDelayFeedback = delayFx?.params.feedback ?? cur.delayFeedback;
      const newDelayWetLevel = delayFx?.params.wetLevel ?? cur.delayWetLevel;

      const chorusFx = preset.effects?.find(e => e.type === 'chorus') ?? null;
      const newChorusEnabled = chorusFx !== null;
      const newChorusRate = chorusFx?.params.rate ?? cur.chorusRate;
      const newChorusDepth = chorusFx?.params.depth ?? cur.chorusDepth;
      const newChorusMix = chorusFx?.params.mix ?? cur.chorusMix;

      const distFx = preset.effects?.find(e => e.type === 'distortion') ?? null;
      const newDistEnabled = distFx !== null;
      const newDistDrive = distFx?.params.drive ?? cur.distortionDrive;
      const newDistMix = distFx?.params.mix ?? cur.distortionMix;
      const newDistTone = distFx?.params.tone ?? cur.distortionTone;

      const compFx = preset.effects?.find(e => e.type === 'compressor') ?? null;
      const newCompEnabled = compFx !== null;
      const newCompThreshold = compFx?.params.threshold ?? cur.compThreshold;
      const newCompRatio = compFx?.params.ratio ?? cur.compRatio;
      const newCompAttack = compFx?.params.attack ?? cur.compAttack;
      const newCompRelease = compFx?.params.release ?? cur.compRelease;

      // Apply to native
      const applyFx = (
        id: number | null,
        enabled: boolean,
        applyParams: (id: number) => void,
      ) => {
        if (id === null || id < 0) return;
        NativeAudioModule.setEffectEnabled(channelId, id, enabled);
        if (enabled) applyParams(id);
      };

      applyFx(reverbIdRef.current, newReverbEnabled, id => {
        NativeAudioModule.setEffectParameter(channelId, id, 'roomSize', newReverbRoomSize);
        NativeAudioModule.setEffectParameter(channelId, id, 'wetLevel', newReverbWetLevel);
      });
      applyFx(delayIdRef.current, newDelayEnabled, id => {
        NativeAudioModule.setEffectParameter(channelId, id, 'delayTime', newDelayTime);
        NativeAudioModule.setEffectParameter(channelId, id, 'feedback', newDelayFeedback);
        NativeAudioModule.setEffectParameter(channelId, id, 'wetLevel', newDelayWetLevel);
      });
      applyFx(chorusIdRef.current, newChorusEnabled, id => {
        NativeAudioModule.setEffectParameter(channelId, id, 'rate', newChorusRate);
        NativeAudioModule.setEffectParameter(channelId, id, 'depth', newChorusDepth);
        NativeAudioModule.setEffectParameter(channelId, id, 'mix', newChorusMix);
      });
      applyFx(distortionIdRef.current, newDistEnabled, id => {
        NativeAudioModule.setEffectParameter(channelId, id, 'drive', newDistDrive);
        NativeAudioModule.setEffectParameter(channelId, id, 'mix', newDistMix);
        NativeAudioModule.setEffectParameter(channelId, id, 'tone', newDistTone);
      });
      applyFx(compressorIdRef.current, newCompEnabled, id => {
        NativeAudioModule.setEffectParameter(channelId, id, 'threshold', newCompThreshold);
        NativeAudioModule.setEffectParameter(channelId, id, 'ratio', newCompRatio);
        NativeAudioModule.setEffectParameter(channelId, id, 'attack', newCompAttack);
        NativeAudioModule.setEffectParameter(channelId, id, 'release', newCompRelease);
      });

      // Compute new advanced synthesis values
      const newPulseWidth = preset.pulseWidth ?? 0.5;
      const newUnisonCount = preset.unisonCount ?? 1;
      const newUnisonSpread = preset.unisonSpread ?? 20;
      const newGlideTime = preset.glideTime ?? 0;
      const newLfoRate = preset.lfoRate ?? 1;
      const newLfoDepth = preset.lfoDepth ?? 0;
      const newLfoDestination = preset.lfoDestination ?? 0;
      const newLfoWaveform = preset.lfoWaveform ?? 'sine';

      // Update React state
      setActivePresetName(preset.name);
      setWaveform(preset.waveform1);
      setOsc2Waveform(preset.waveform2);
      setOsc2Level(preset.osc2Level);
      setOsc2Semi(preset.osc2Semi);
      setOsc2Detune(preset.detuneCents2);
      setSubLevel(preset.subLevel);
      setNoiseLevel(preset.noiseLevel);
      setVoiceFilterEnabled(preset.filterEnabled);
      setVoiceFilterCutoff(preset.filterCutoff);
      setVoiceFilterResonance(preset.filterResonance);
      setVoiceFilterEnvAmount(preset.filterEnvAmount);
      setReverbEnabled(newReverbEnabled);
      setReverbRoomSize(newReverbRoomSize);
      setReverbWetLevel(newReverbWetLevel);
      setDelayEnabled(newDelayEnabled);
      setDelayTime(newDelayTime);
      setDelayFeedback(newDelayFeedback);
      setDelayWetLevel(newDelayWetLevel);
      setChorusEnabled(newChorusEnabled);
      setChorusRate(newChorusRate);
      setChorusDepth(newChorusDepth);
      setChorusMix(newChorusMix);
      setDistortionEnabled(newDistEnabled);
      setDistortionDrive(newDistDrive);
      setDistortionMix(newDistMix);
      setDistortionTone(newDistTone);
      setCompressorEnabled(newCompEnabled);
      setCompThreshold(newCompThreshold);
      setCompRatio(newCompRatio);
      setCompAttack(newCompAttack);
      setCompRelease(newCompRelease);
      setPulseWidth(newPulseWidth);
      setUnisonCount(newUnisonCount);
      setUnisonSpread(newUnisonSpread);
      setGlideTime(newGlideTime);
      setLfoRate(newLfoRate);
      setLfoDepth(newLfoDepth);
      setLfoDestination(newLfoDestination);
      setLfoWaveform(newLfoWaveform);

      // Persist all to store in one batch
      useSynthChannelStore.getState().patchParams(channelId, {
        activePresetName: preset.name,
        waveform: preset.waveform1,
        osc2Waveform: preset.waveform2,
        osc2Level: preset.osc2Level,
        osc2Semi: preset.osc2Semi,
        osc2Detune: preset.detuneCents2,
        subLevel: preset.subLevel,
        noiseLevel: preset.noiseLevel,
        voiceFilterEnabled: preset.filterEnabled,
        voiceFilterCutoff: preset.filterCutoff,
        voiceFilterResonance: preset.filterResonance,
        voiceFilterEnvAmount: preset.filterEnvAmount,
        reverbEnabled: newReverbEnabled,
        reverbRoomSize: newReverbRoomSize,
        reverbWetLevel: newReverbWetLevel,
        delayEnabled: newDelayEnabled,
        delayTime: newDelayTime,
        delayFeedback: newDelayFeedback,
        delayWetLevel: newDelayWetLevel,
        chorusEnabled: newChorusEnabled,
        chorusRate: newChorusRate,
        chorusDepth: newChorusDepth,
        chorusMix: newChorusMix,
        distortionEnabled: newDistEnabled,
        distortionDrive: newDistDrive,
        distortionMix: newDistMix,
        distortionTone: newDistTone,
        compressorEnabled: newCompEnabled,
        compThreshold: newCompThreshold,
        compRatio: newCompRatio,
        compAttack: newCompAttack,
        compRelease: newCompRelease,
        pulseWidth: newPulseWidth,
        unisonCount: newUnisonCount,
        unisonSpread: newUnisonSpread,
        glideTime: newGlideTime,
        lfoRate: newLfoRate,
        lfoDepth: newLfoDepth,
        lfoDestination: newLfoDestination,
        lfoWaveform: newLfoWaveform,
      });
    },
    [channelId],
  );

  // ── Osc callbacks ─────────────────────────────────────────────────────
  const onWaveformChange = useCallback(
    (v: number) => {
      const wf = WAVEFORMS[Math.round(v)];
      if (wf) {
        setWaveform(wf);
        setActivePresetName(null);
        NativeAudioModule.setWaveform(channelId, wf);
        patch({ waveform: wf, activePresetName: null });
        recordParam('osc.waveform', v);
      }
    },
    [channelId, patch, recordParam],
  );

  const onOsc2WaveformChange = useCallback(
    (v: number) => {
      const wf = WAVEFORMS[Math.round(v)];
      if (wf) {
        setOsc2Waveform(wf);
        setActivePresetName(null);
        NativeAudioModule.setOsc2Waveform(channelId, wf);
        patch({ osc2Waveform: wf, activePresetName: null });
        recordParam('osc.osc2Waveform', v);
      }
    },
    [channelId, patch, recordParam],
  );

  const onOsc2LevelChange = useCallback(
    (v: number) => { NativeAudioModule.setOsc2Level(channelId, v); recordParam('osc.osc2Level', v); },
    [channelId, recordParam],
  );
  const onOsc2LevelComplete = useCallback(
    (v: number) => { setOsc2Level(v); patch({ osc2Level: v }); },
    [patch],
  );

  const onOsc2SemiChange = useCallback(
    (v: number) => { NativeAudioModule.setOsc2Semi(channelId, Math.round(v)); recordParam('osc.osc2Semi', v); },
    [channelId, recordParam],
  );
  const onOsc2SemiComplete = useCallback(
    (v: number) => { const r = Math.round(v); setOsc2Semi(r); patch({ osc2Semi: r }); },
    [patch],
  );

  const onOsc2DetuneChange = useCallback(
    (v: number) => { NativeAudioModule.setOsc2Detune(channelId, v); recordParam('osc.osc2Detune', v); },
    [channelId, recordParam],
  );
  const onOsc2DetuneComplete = useCallback(
    (v: number) => { setOsc2Detune(v); patch({ osc2Detune: v }); },
    [patch],
  );

  const onSubLevelChange = useCallback(
    (v: number) => { NativeAudioModule.setSubLevel(channelId, v); recordParam('osc.subLevel', v); },
    [channelId, recordParam],
  );
  const onSubLevelComplete = useCallback(
    (v: number) => { setSubLevel(v); patch({ subLevel: v }); },
    [patch],
  );

  const onNoiseLevelChange = useCallback(
    (v: number) => { NativeAudioModule.setNoiseLevel(channelId, v); recordParam('osc.noiseLevel', v); },
    [channelId, recordParam],
  );
  const onNoiseLevelComplete = useCallback(
    (v: number) => { setNoiseLevel(v); patch({ noiseLevel: v }); },
    [patch],
  );

  // ── Voice filter callbacks ────────────────────────────────────────────
  const toggleVoiceFilter = useCallback(() => {
    setVoiceFilterEnabled(prev => {
      const next = !prev;
      NativeAudioModule.setVoiceFilterEnabled(channelId, next);
      patch({ voiceFilterEnabled: next });
      return next;
    });
  }, [channelId, patch]);

  const onVoiceFilterCutoffChange = useCallback(
    (v: number) => { NativeAudioModule.setVoiceFilterCutoff(channelId, v); recordParam('voiceFilter.cutoff', v); },
    [channelId, recordParam],
  );
  const onVoiceFilterCutoffComplete = useCallback(
    (v: number) => { setVoiceFilterCutoff(v); patch({ voiceFilterCutoff: v }); },
    [patch],
  );

  const onVoiceFilterResonanceChange = useCallback(
    (v: number) => { NativeAudioModule.setVoiceFilterResonance(channelId, v); recordParam('voiceFilter.resonance', v); },
    [channelId, recordParam],
  );
  const onVoiceFilterResonanceComplete = useCallback(
    (v: number) => { setVoiceFilterResonance(v); patch({ voiceFilterResonance: v }); },
    [patch],
  );

  const onVoiceFilterEnvAmountChange = useCallback(
    (v: number) => { NativeAudioModule.setVoiceFilterEnvAmount(channelId, v); recordParam('voiceFilter.envAmount', v); },
    [channelId, recordParam],
  );
  const onVoiceFilterEnvAmountComplete = useCallback(
    (v: number) => { setVoiceFilterEnvAmount(v); patch({ voiceFilterEnvAmount: v }); },
    [patch],
  );

  // ── Chain filter callbacks ────────────────────────────────────────────
  const toggleChainFilter = useCallback(() => {
    const id = filterIdRef.current;
    if (id === null || id < 0) return;
    const newEnabled = !chainFilterEnabled;
    NativeAudioModule.setEffectEnabled(channelId, id, newEnabled);
    if (newEnabled) {
      NativeAudioModule.setEffectParameter(channelId, id, 'cutoff', chainFilterCutoff);
      NativeAudioModule.setEffectParameter(channelId, id, 'resonance', chainFilterResonance);
      NativeAudioModule.setEffectParameter(channelId, id, 'type', FILTER_TYPES.indexOf(chainFilterType));
    }
    setChainFilterEnabled(newEnabled);
    patch({ chainFilterEnabled: newEnabled });
  }, [channelId, chainFilterEnabled, chainFilterCutoff, chainFilterResonance, chainFilterType, patch]);

  const changeChainFilterType = useCallback(() => {
    const nextIndex = (FILTER_TYPES.indexOf(chainFilterType) + 1) % FILTER_TYPES.length;
    const nextType = FILTER_TYPES[nextIndex];
    setChainFilterType(nextType);
    patch({ chainFilterType: nextType });
    const id = filterIdRef.current;
    if (chainFilterEnabled && id !== null) {
      NativeAudioModule.setEffectParameter(channelId, id, 'type', nextIndex);
    }
  }, [channelId, chainFilterType, chainFilterEnabled, patch]);

  const onChainFilterCutoffChange = useCallback(
    (v: number) => {
      if (filterIdRef.current !== null) {
        NativeAudioModule.setEffectParameter(channelId, filterIdRef.current, 'cutoff', v);
        recordParam('filter.cutoff', v);
      }
    },
    [channelId, recordParam],
  );
  const onChainFilterCutoffComplete = useCallback(
    (v: number) => { setChainFilterCutoff(v); patch({ chainFilterCutoff: v }); },
    [patch],
  );

  const onChainFilterResonanceChange = useCallback(
    (v: number) => {
      if (filterIdRef.current !== null) {
        NativeAudioModule.setEffectParameter(channelId, filterIdRef.current, 'resonance', v);
        recordParam('filter.resonance', v);
      }
    },
    [channelId, recordParam],
  );
  const onChainFilterResonanceComplete = useCallback(
    (v: number) => { setChainFilterResonance(v); patch({ chainFilterResonance: v }); },
    [patch],
  );

  // ── Reverb callbacks ──────────────────────────────────────────────────
  const toggleReverb = useCallback(() => {
    const id = reverbIdRef.current;
    if (id === null || id < 0) return;
    const newEnabled = !reverbEnabled;
    NativeAudioModule.setEffectEnabled(channelId, id, newEnabled);
    if (newEnabled) {
      NativeAudioModule.setEffectParameter(channelId, id, 'roomSize', reverbRoomSize);
      NativeAudioModule.setEffectParameter(channelId, id, 'wetLevel', reverbWetLevel);
    }
    setReverbEnabled(newEnabled);
    patch({ reverbEnabled: newEnabled });
  }, [channelId, reverbEnabled, reverbRoomSize, reverbWetLevel, patch]);

  const onReverbRoomSizeChange = useCallback(
    (v: number) => {
      if (reverbIdRef.current !== null) {
        NativeAudioModule.setEffectParameter(channelId, reverbIdRef.current, 'roomSize', v);
        recordParam('reverb.roomSize', v);
      }
    },
    [channelId, recordParam],
  );
  const onReverbRoomSizeComplete = useCallback(
    (v: number) => { setReverbRoomSize(v); patch({ reverbRoomSize: v }); },
    [patch],
  );

  const onReverbWetLevelChange = useCallback(
    (v: number) => {
      if (reverbIdRef.current !== null) {
        NativeAudioModule.setEffectParameter(channelId, reverbIdRef.current, 'wetLevel', v);
        recordParam('reverb.wetLevel', v);
      }
    },
    [channelId, recordParam],
  );
  const onReverbWetLevelComplete = useCallback(
    (v: number) => { setReverbWetLevel(v); patch({ reverbWetLevel: v }); },
    [patch],
  );

  // ── Delay callbacks ───────────────────────────────────────────────────
  const toggleDelay = useCallback(() => {
    const id = delayIdRef.current;
    if (id === null || id < 0) return;
    const newEnabled = !delayEnabled;
    NativeAudioModule.setEffectEnabled(channelId, id, newEnabled);
    if (newEnabled) {
      NativeAudioModule.setEffectParameter(channelId, id, 'delayTime', delayTime);
      NativeAudioModule.setEffectParameter(channelId, id, 'feedback', delayFeedback);
      NativeAudioModule.setEffectParameter(channelId, id, 'wetLevel', delayWetLevel);
    }
    setDelayEnabled(newEnabled);
    patch({ delayEnabled: newEnabled });
  }, [channelId, delayEnabled, delayTime, delayFeedback, delayWetLevel, patch]);

  const onDelayTimeChange = useCallback(
    (v: number) => {
      if (delayIdRef.current !== null) {
        NativeAudioModule.setEffectParameter(channelId, delayIdRef.current, 'delayTime', v);
        recordParam('delay.time', v);
      }
    },
    [channelId, recordParam],
  );
  const onDelayTimeComplete = useCallback(
    (v: number) => { setDelayTime(v); patch({ delayTime: v }); },
    [patch],
  );

  const onDelayFeedbackChange = useCallback(
    (v: number) => {
      if (delayIdRef.current !== null) {
        NativeAudioModule.setEffectParameter(channelId, delayIdRef.current, 'feedback', v);
        recordParam('delay.feedback', v);
      }
    },
    [channelId, recordParam],
  );
  const onDelayFeedbackComplete = useCallback(
    (v: number) => { setDelayFeedback(v); patch({ delayFeedback: v }); },
    [patch],
  );

  const onDelayWetLevelChange = useCallback(
    (v: number) => {
      if (delayIdRef.current !== null) {
        NativeAudioModule.setEffectParameter(channelId, delayIdRef.current, 'wetLevel', v);
        recordParam('delay.wetLevel', v);
      }
    },
    [channelId, recordParam],
  );
  const onDelayWetLevelComplete = useCallback(
    (v: number) => { setDelayWetLevel(v); patch({ delayWetLevel: v }); },
    [patch],
  );

  // ── Chorus callbacks ──────────────────────────────────────────────────
  const toggleChorus = useCallback(() => {
    const id = chorusIdRef.current;
    if (id === null || id < 0) return;
    const newEnabled = !chorusEnabled;
    NativeAudioModule.setEffectEnabled(channelId, id, newEnabled);
    if (newEnabled) {
      NativeAudioModule.setEffectParameter(channelId, id, 'rate', chorusRate);
      NativeAudioModule.setEffectParameter(channelId, id, 'depth', chorusDepth);
      NativeAudioModule.setEffectParameter(channelId, id, 'mix', chorusMix);
    }
    setChorusEnabled(newEnabled);
    patch({ chorusEnabled: newEnabled });
  }, [channelId, chorusEnabled, chorusRate, chorusDepth, chorusMix, patch]);

  const onChorusRateChange = useCallback(
    (v: number) => {
      if (chorusIdRef.current !== null) {
        NativeAudioModule.setEffectParameter(channelId, chorusIdRef.current, 'rate', v);
        recordParam('chorus.rate', v);
      }
    },
    [channelId, recordParam],
  );
  const onChorusRateComplete = useCallback(
    (v: number) => { setChorusRate(v); patch({ chorusRate: v }); },
    [patch],
  );

  const onChorusDepthChange = useCallback(
    (v: number) => {
      if (chorusIdRef.current !== null) {
        NativeAudioModule.setEffectParameter(channelId, chorusIdRef.current, 'depth', v);
        recordParam('chorus.depth', v);
      }
    },
    [channelId, recordParam],
  );
  const onChorusDepthComplete = useCallback(
    (v: number) => { setChorusDepth(v); patch({ chorusDepth: v }); },
    [patch],
  );

  const onChorusMixChange = useCallback(
    (v: number) => {
      if (chorusIdRef.current !== null) {
        NativeAudioModule.setEffectParameter(channelId, chorusIdRef.current, 'mix', v);
        recordParam('chorus.mix', v);
      }
    },
    [channelId, recordParam],
  );
  const onChorusMixComplete = useCallback(
    (v: number) => { setChorusMix(v); patch({ chorusMix: v }); },
    [patch],
  );

  // ── Distortion callbacks ──────────────────────────────────────────────
  const toggleDistortion = useCallback(() => {
    const id = distortionIdRef.current;
    if (id === null || id < 0) return;
    const newEnabled = !distortionEnabled;
    NativeAudioModule.setEffectEnabled(channelId, id, newEnabled);
    if (newEnabled) {
      NativeAudioModule.setEffectParameter(channelId, id, 'drive', distortionDrive);
      NativeAudioModule.setEffectParameter(channelId, id, 'mix', distortionMix);
      NativeAudioModule.setEffectParameter(channelId, id, 'tone', distortionTone);
    }
    setDistortionEnabled(newEnabled);
    patch({ distortionEnabled: newEnabled });
  }, [channelId, distortionEnabled, distortionDrive, distortionMix, distortionTone, patch]);

  const onDistortionDriveChange = useCallback(
    (v: number) => {
      if (distortionIdRef.current !== null) {
        NativeAudioModule.setEffectParameter(channelId, distortionIdRef.current, 'drive', v);
        recordParam('distortion.drive', v);
      }
    },
    [channelId, recordParam],
  );
  const onDistortionDriveComplete = useCallback(
    (v: number) => { setDistortionDrive(v); patch({ distortionDrive: v }); },
    [patch],
  );

  const onDistortionMixChange = useCallback(
    (v: number) => {
      if (distortionIdRef.current !== null) {
        NativeAudioModule.setEffectParameter(channelId, distortionIdRef.current, 'mix', v);
        recordParam('distortion.mix', v);
      }
    },
    [channelId, recordParam],
  );
  const onDistortionMixComplete = useCallback(
    (v: number) => { setDistortionMix(v); patch({ distortionMix: v }); },
    [patch],
  );

  const onDistortionToneChange = useCallback(
    (v: number) => {
      if (distortionIdRef.current !== null) {
        NativeAudioModule.setEffectParameter(channelId, distortionIdRef.current, 'tone', v);
        recordParam('distortion.tone', v);
      }
    },
    [channelId, recordParam],
  );
  const onDistortionToneComplete = useCallback(
    (v: number) => { setDistortionTone(v); patch({ distortionTone: v }); },
    [patch],
  );

  // ── Compressor callbacks ──────────────────────────────────────────────
  const toggleCompressor = useCallback(() => {
    const id = compressorIdRef.current;
    if (id === null || id < 0) return;
    const newEnabled = !compressorEnabled;
    NativeAudioModule.setEffectEnabled(channelId, id, newEnabled);
    if (newEnabled) {
      NativeAudioModule.setEffectParameter(channelId, id, 'threshold', compThreshold);
      NativeAudioModule.setEffectParameter(channelId, id, 'ratio', compRatio);
      NativeAudioModule.setEffectParameter(channelId, id, 'attack', compAttack);
      NativeAudioModule.setEffectParameter(channelId, id, 'release', compRelease);
    }
    setCompressorEnabled(newEnabled);
    patch({ compressorEnabled: newEnabled });
  }, [channelId, compressorEnabled, compThreshold, compRatio, compAttack, compRelease, patch]);

  const onCompThresholdChange = useCallback(
    (v: number) => {
      if (compressorIdRef.current !== null) {
        NativeAudioModule.setEffectParameter(channelId, compressorIdRef.current, 'threshold', v);
        recordParam('comp.threshold', v);
      }
    },
    [channelId, recordParam],
  );
  const onCompThresholdComplete = useCallback(
    (v: number) => { setCompThreshold(v); patch({ compThreshold: v }); },
    [patch],
  );

  const onCompRatioChange = useCallback(
    (v: number) => {
      if (compressorIdRef.current !== null) {
        NativeAudioModule.setEffectParameter(channelId, compressorIdRef.current, 'ratio', v);
        recordParam('comp.ratio', v);
      }
    },
    [channelId, recordParam],
  );
  const onCompRatioComplete = useCallback(
    (v: number) => { setCompRatio(v); patch({ compRatio: v }); },
    [patch],
  );

  const onCompAttackChange = useCallback(
    (v: number) => {
      if (compressorIdRef.current !== null) {
        NativeAudioModule.setEffectParameter(channelId, compressorIdRef.current, 'attack', v);
        recordParam('comp.attack', v);
      }
    },
    [channelId, recordParam],
  );
  const onCompAttackComplete = useCallback(
    (v: number) => { setCompAttack(v); patch({ compAttack: v }); },
    [patch],
  );

  const onCompReleaseChange = useCallback(
    (v: number) => {
      if (compressorIdRef.current !== null) {
        NativeAudioModule.setEffectParameter(channelId, compressorIdRef.current, 'release', v);
        recordParam('comp.release', v);
      }
    },
    [channelId, recordParam],
  );
  const onCompReleaseComplete = useCallback(
    (v: number) => { setCompRelease(v); patch({ compRelease: v }); },
    [patch],
  );

  // ── Advanced synthesis callbacks ──────────────────────────────────────
  const onPulseWidthChange = useCallback(
    (v: number) => { NativeAudioModule.setPulseWidth(channelId, v); recordParam('osc.pulseWidth', v); },
    [channelId, recordParam],
  );
  const onPulseWidthComplete = useCallback(
    (v: number) => { setPulseWidth(v); patch({ pulseWidth: v }); },
    [patch],
  );

  const onUnisonCountChange = useCallback(
    (v: number) => { NativeAudioModule.setUnisonCount(channelId, Math.round(v)); recordParam('osc.unisonCount', v); },
    [channelId, recordParam],
  );
  const onUnisonCountComplete = useCallback(
    (v: number) => { const r = Math.round(v); setUnisonCount(r); patch({ unisonCount: r }); },
    [patch],
  );

  const onUnisonSpreadChange = useCallback(
    (v: number) => { NativeAudioModule.setUnisonSpread(channelId, v); recordParam('osc.unisonSpread', v); },
    [channelId, recordParam],
  );
  const onUnisonSpreadComplete = useCallback(
    (v: number) => { setUnisonSpread(v); patch({ unisonSpread: v }); },
    [patch],
  );

  const onGlideTimeChange = useCallback(
    (v: number) => { NativeAudioModule.setGlideTime(channelId, v); recordParam('osc.glideTime', v); },
    [channelId, recordParam],
  );
  const onGlideTimeComplete = useCallback(
    (v: number) => { setGlideTime(v); patch({ glideTime: v }); },
    [patch],
  );

  const onLfoRateChange = useCallback(
    (v: number) => { NativeAudioModule.setLfoRate(channelId, v); recordParam('lfo.rate', v); },
    [channelId, recordParam],
  );
  const onLfoRateComplete = useCallback(
    (v: number) => { setLfoRate(v); patch({ lfoRate: v }); },
    [patch],
  );

  const onLfoDepthChange = useCallback(
    (v: number) => { NativeAudioModule.setLfoDepth(channelId, v); recordParam('lfo.depth', v); },
    [channelId, recordParam],
  );
  const onLfoDepthComplete = useCallback(
    (v: number) => { setLfoDepth(v); patch({ lfoDepth: v }); },
    [patch],
  );

  const onLfoDestinationChange = useCallback(
    (v: number) => {
      const d = Math.round(v);
      setLfoDestination(d);
      NativeAudioModule.setLfoDestination(channelId, d);
      patch({ lfoDestination: d });
      recordParam('lfo.destination', v);
    },
    [channelId, patch, recordParam],
  );

  const onLfoWaveformChange = useCallback(
    (v: number) => {
      const wf = WAVEFORMS[Math.round(v)];
      if (wf) {
        setLfoWaveform(wf);
        NativeAudioModule.setLfoWaveform(channelId, wf);
        patch({ lfoWaveform: wf });
        recordParam('lfo.waveform', v);
      }
    },
    [channelId, patch, recordParam],
  );

  return {
    waveform,
    osc2Waveform,
    osc2Level,
    osc2Semi,
    osc2Detune,
    subLevel,
    noiseLevel,
    voiceFilterEnabled,
    voiceFilterCutoff,
    voiceFilterResonance,
    voiceFilterEnvAmount,
    chainFilterEnabled,
    chainFilterType,
    chainFilterCutoff,
    chainFilterResonance,
    reverbEnabled,
    reverbRoomSize,
    reverbWetLevel,
    delayEnabled,
    delayTime,
    delayFeedback,
    delayWetLevel,
    chorusEnabled,
    chorusRate,
    chorusDepth,
    chorusMix,
    distortionEnabled,
    distortionDrive,
    distortionMix,
    distortionTone,
    compressorEnabled,
    compThreshold,
    compRatio,
    compAttack,
    compRelease,
    pulseWidth,
    unisonCount,
    unisonSpread,
    glideTime,
    lfoRate,
    lfoDepth,
    lfoDestination,
    lfoWaveform,
    activePresetName,
    selectedCategory,
    setSelectedCategory,
    handlePresetSelect,
    onWaveformChange,
    onOsc2WaveformChange,
    onOsc2LevelChange,
    onOsc2LevelComplete,
    onOsc2SemiChange,
    onOsc2SemiComplete,
    onOsc2DetuneChange,
    onOsc2DetuneComplete,
    onSubLevelChange,
    onSubLevelComplete,
    onNoiseLevelChange,
    onNoiseLevelComplete,
    toggleVoiceFilter,
    onVoiceFilterCutoffChange,
    onVoiceFilterCutoffComplete,
    onVoiceFilterResonanceChange,
    onVoiceFilterResonanceComplete,
    onVoiceFilterEnvAmountChange,
    onVoiceFilterEnvAmountComplete,
    toggleChainFilter,
    changeChainFilterType,
    onChainFilterCutoffChange,
    onChainFilterCutoffComplete,
    onChainFilterResonanceChange,
    onChainFilterResonanceComplete,
    toggleReverb,
    onReverbRoomSizeChange,
    onReverbRoomSizeComplete,
    onReverbWetLevelChange,
    onReverbWetLevelComplete,
    toggleDelay,
    onDelayTimeChange,
    onDelayTimeComplete,
    onDelayFeedbackChange,
    onDelayFeedbackComplete,
    onDelayWetLevelChange,
    onDelayWetLevelComplete,
    toggleChorus,
    onChorusRateChange,
    onChorusRateComplete,
    onChorusDepthChange,
    onChorusDepthComplete,
    onChorusMixChange,
    onChorusMixComplete,
    toggleDistortion,
    onDistortionDriveChange,
    onDistortionDriveComplete,
    onDistortionMixChange,
    onDistortionMixComplete,
    onDistortionToneChange,
    onDistortionToneComplete,
    toggleCompressor,
    onCompThresholdChange,
    onCompThresholdComplete,
    onCompRatioChange,
    onCompRatioComplete,
    onCompAttackChange,
    onCompAttackComplete,
    onCompReleaseChange,
    onCompReleaseComplete,
    onPulseWidthChange,
    onPulseWidthComplete,
    onUnisonCountChange,
    onUnisonCountComplete,
    onUnisonSpreadChange,
    onUnisonSpreadComplete,
    onGlideTimeChange,
    onGlideTimeComplete,
    onLfoRateChange,
    onLfoRateComplete,
    onLfoDepthChange,
    onLfoDepthComplete,
    onLfoDestinationChange,
    onLfoWaveformChange,
  };
}
