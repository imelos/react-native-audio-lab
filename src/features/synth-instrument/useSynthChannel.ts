import { useState, useEffect, useRef, useCallback } from 'react';
import NativeAudioModule from '../../specs/NativeAudioModule';
import { type SynthPreset } from '../../data/synthPresets';
import { applyPreset } from '../../utils/applyPreset';
import { WAVEFORMS, FILTER_TYPES, type Waveform, type FilterType } from './types';
import {
  useSynthChannelStore,
  type ChannelSynthParams,
  type ChannelEffectIds,
} from './synthChannelStore';

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
      }
    },
    [channelId, patch],
  );

  const onOsc2WaveformChange = useCallback(
    (v: number) => {
      const wf = WAVEFORMS[Math.round(v)];
      if (wf) {
        setOsc2Waveform(wf);
        setActivePresetName(null);
        NativeAudioModule.setOsc2Waveform(channelId, wf);
        patch({ osc2Waveform: wf, activePresetName: null });
      }
    },
    [channelId, patch],
  );

  const onOsc2LevelChange = useCallback(
    (v: number) => NativeAudioModule.setOsc2Level(channelId, v),
    [channelId],
  );
  const onOsc2LevelComplete = useCallback(
    (v: number) => { setOsc2Level(v); patch({ osc2Level: v }); },
    [patch],
  );

  const onOsc2SemiChange = useCallback(
    (v: number) => NativeAudioModule.setOsc2Semi(channelId, Math.round(v)),
    [channelId],
  );
  const onOsc2SemiComplete = useCallback(
    (v: number) => { const r = Math.round(v); setOsc2Semi(r); patch({ osc2Semi: r }); },
    [patch],
  );

  const onOsc2DetuneChange = useCallback(
    (v: number) => NativeAudioModule.setOsc2Detune(channelId, v),
    [channelId],
  );
  const onOsc2DetuneComplete = useCallback(
    (v: number) => { setOsc2Detune(v); patch({ osc2Detune: v }); },
    [patch],
  );

  const onSubLevelChange = useCallback(
    (v: number) => NativeAudioModule.setSubLevel(channelId, v),
    [channelId],
  );
  const onSubLevelComplete = useCallback(
    (v: number) => { setSubLevel(v); patch({ subLevel: v }); },
    [patch],
  );

  const onNoiseLevelChange = useCallback(
    (v: number) => NativeAudioModule.setNoiseLevel(channelId, v),
    [channelId],
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
    (v: number) => NativeAudioModule.setVoiceFilterCutoff(channelId, v),
    [channelId],
  );
  const onVoiceFilterCutoffComplete = useCallback(
    (v: number) => { setVoiceFilterCutoff(v); patch({ voiceFilterCutoff: v }); },
    [patch],
  );

  const onVoiceFilterResonanceChange = useCallback(
    (v: number) => NativeAudioModule.setVoiceFilterResonance(channelId, v),
    [channelId],
  );
  const onVoiceFilterResonanceComplete = useCallback(
    (v: number) => { setVoiceFilterResonance(v); patch({ voiceFilterResonance: v }); },
    [patch],
  );

  const onVoiceFilterEnvAmountChange = useCallback(
    (v: number) => NativeAudioModule.setVoiceFilterEnvAmount(channelId, v),
    [channelId],
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
      }
    },
    [channelId],
  );
  const onChainFilterCutoffComplete = useCallback(
    (v: number) => { setChainFilterCutoff(v); patch({ chainFilterCutoff: v }); },
    [patch],
  );

  const onChainFilterResonanceChange = useCallback(
    (v: number) => {
      if (filterIdRef.current !== null) {
        NativeAudioModule.setEffectParameter(channelId, filterIdRef.current, 'resonance', v);
      }
    },
    [channelId],
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
      }
    },
    [channelId],
  );
  const onReverbRoomSizeComplete = useCallback(
    (v: number) => { setReverbRoomSize(v); patch({ reverbRoomSize: v }); },
    [patch],
  );

  const onReverbWetLevelChange = useCallback(
    (v: number) => {
      if (reverbIdRef.current !== null) {
        NativeAudioModule.setEffectParameter(channelId, reverbIdRef.current, 'wetLevel', v);
      }
    },
    [channelId],
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
      }
    },
    [channelId],
  );
  const onDelayTimeComplete = useCallback(
    (v: number) => { setDelayTime(v); patch({ delayTime: v }); },
    [patch],
  );

  const onDelayFeedbackChange = useCallback(
    (v: number) => {
      if (delayIdRef.current !== null) {
        NativeAudioModule.setEffectParameter(channelId, delayIdRef.current, 'feedback', v);
      }
    },
    [channelId],
  );
  const onDelayFeedbackComplete = useCallback(
    (v: number) => { setDelayFeedback(v); patch({ delayFeedback: v }); },
    [patch],
  );

  const onDelayWetLevelChange = useCallback(
    (v: number) => {
      if (delayIdRef.current !== null) {
        NativeAudioModule.setEffectParameter(channelId, delayIdRef.current, 'wetLevel', v);
      }
    },
    [channelId],
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
      }
    },
    [channelId],
  );
  const onChorusRateComplete = useCallback(
    (v: number) => { setChorusRate(v); patch({ chorusRate: v }); },
    [patch],
  );

  const onChorusDepthChange = useCallback(
    (v: number) => {
      if (chorusIdRef.current !== null) {
        NativeAudioModule.setEffectParameter(channelId, chorusIdRef.current, 'depth', v);
      }
    },
    [channelId],
  );
  const onChorusDepthComplete = useCallback(
    (v: number) => { setChorusDepth(v); patch({ chorusDepth: v }); },
    [patch],
  );

  const onChorusMixChange = useCallback(
    (v: number) => {
      if (chorusIdRef.current !== null) {
        NativeAudioModule.setEffectParameter(channelId, chorusIdRef.current, 'mix', v);
      }
    },
    [channelId],
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
      }
    },
    [channelId],
  );
  const onDistortionDriveComplete = useCallback(
    (v: number) => { setDistortionDrive(v); patch({ distortionDrive: v }); },
    [patch],
  );

  const onDistortionMixChange = useCallback(
    (v: number) => {
      if (distortionIdRef.current !== null) {
        NativeAudioModule.setEffectParameter(channelId, distortionIdRef.current, 'mix', v);
      }
    },
    [channelId],
  );
  const onDistortionMixComplete = useCallback(
    (v: number) => { setDistortionMix(v); patch({ distortionMix: v }); },
    [patch],
  );

  const onDistortionToneChange = useCallback(
    (v: number) => {
      if (distortionIdRef.current !== null) {
        NativeAudioModule.setEffectParameter(channelId, distortionIdRef.current, 'tone', v);
      }
    },
    [channelId],
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
      }
    },
    [channelId],
  );
  const onCompThresholdComplete = useCallback(
    (v: number) => { setCompThreshold(v); patch({ compThreshold: v }); },
    [patch],
  );

  const onCompRatioChange = useCallback(
    (v: number) => {
      if (compressorIdRef.current !== null) {
        NativeAudioModule.setEffectParameter(channelId, compressorIdRef.current, 'ratio', v);
      }
    },
    [channelId],
  );
  const onCompRatioComplete = useCallback(
    (v: number) => { setCompRatio(v); patch({ compRatio: v }); },
    [patch],
  );

  const onCompAttackChange = useCallback(
    (v: number) => {
      if (compressorIdRef.current !== null) {
        NativeAudioModule.setEffectParameter(channelId, compressorIdRef.current, 'attack', v);
      }
    },
    [channelId],
  );
  const onCompAttackComplete = useCallback(
    (v: number) => { setCompAttack(v); patch({ compAttack: v }); },
    [patch],
  );

  const onCompReleaseChange = useCallback(
    (v: number) => {
      if (compressorIdRef.current !== null) {
        NativeAudioModule.setEffectParameter(channelId, compressorIdRef.current, 'release', v);
      }
    },
    [channelId],
  );
  const onCompReleaseComplete = useCallback(
    (v: number) => { setCompRelease(v); patch({ compRelease: v }); },
    [patch],
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
  };
}
