import { useState, useEffect, useRef, useCallback } from 'react';
import NativeAudioModule from '../../specs/NativeAudioModule';
import {
  type PresetCategory,
  type SynthPreset,
} from '../../data/synthPresets';
import { applyPreset } from '../../utils/applyPreset';
import { WAVEFORMS, FILTER_TYPES, type Waveform, type FilterType } from './types';

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
  selectedCategory: PresetCategory;
  setSelectedCategory: (cat: PresetCategory) => void;
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
  // ── Osc state ────────────────────────────────────────────────────────
  const [waveform, setWaveform] = useState<Waveform>('sine');
  const [osc2Waveform, setOsc2Waveform] = useState<Waveform>('sine');
  const [osc2Level, setOsc2Level] = useState(0);
  const [osc2Semi, setOsc2Semi] = useState(0);
  const [osc2Detune, setOsc2Detune] = useState(0);
  const [subLevel, setSubLevel] = useState(0);
  const [noiseLevel, setNoiseLevel] = useState(0);

  // ── Voice filter state ────────────────────────────────────────────────
  const [voiceFilterEnabled, setVoiceFilterEnabled] = useState(false);
  const [voiceFilterCutoff, setVoiceFilterCutoff] = useState(8000);
  const [voiceFilterResonance, setVoiceFilterResonance] = useState(0);
  const [voiceFilterEnvAmount, setVoiceFilterEnvAmount] = useState(0);

  // ── Chain filter state ────────────────────────────────────────────────
  const [chainFilterEnabled, setChainFilterEnabled] = useState(false);
  const [chainFilterType, setChainFilterType] = useState<FilterType>('LowPass');
  const [chainFilterCutoff, setChainFilterCutoff] = useState(1000);
  const [chainFilterResonance, setChainFilterResonance] = useState(0.7);

  // ── Reverb state ──────────────────────────────────────────────────────
  const [reverbEnabled, setReverbEnabled] = useState(false);
  const [reverbRoomSize, setReverbRoomSize] = useState(0.5);
  const [reverbWetLevel, setReverbWetLevel] = useState(0.33);

  // ── Delay state ───────────────────────────────────────────────────────
  const [delayEnabled, setDelayEnabled] = useState(false);
  const [delayTime, setDelayTime] = useState(500);
  const [delayFeedback, setDelayFeedback] = useState(0.4);
  const [delayWetLevel, setDelayWetLevel] = useState(0.5);

  // ── Chorus state ──────────────────────────────────────────────────────
  const [chorusEnabled, setChorusEnabled] = useState(false);
  const [chorusRate, setChorusRate] = useState(1.0);
  const [chorusDepth, setChorusDepth] = useState(0.25);
  const [chorusMix, setChorusMix] = useState(0.5);

  // ── Distortion state ──────────────────────────────────────────────────
  const [distortionEnabled, setDistortionEnabled] = useState(false);
  const [distortionDrive, setDistortionDrive] = useState(1.0);
  const [distortionMix, setDistortionMix] = useState(0.5);
  const [distortionTone, setDistortionTone] = useState(0.5);

  // ── Compressor state ──────────────────────────────────────────────────
  const [compressorEnabled, setCompressorEnabled] = useState(false);
  const [compThreshold, setCompThreshold] = useState(-20);
  const [compRatio, setCompRatio] = useState(4);
  const [compAttack, setCompAttack] = useState(10);
  const [compRelease, setCompRelease] = useState(100);

  // ── Preset state ──────────────────────────────────────────────────────
  const [activePresetName, setActivePresetName] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<PresetCategory>('Keys');

  // ── Effect IDs (permanent, set once on mount) ─────────────────────────
  const filterIdRef = useRef<number | null>(null);
  const reverbIdRef = useRef<number | null>(null);
  const delayIdRef = useRef<number | null>(null);
  const chorusIdRef = useRef<number | null>(null);
  const distortionIdRef = useRef<number | null>(null);
  const compressorIdRef = useRef<number | null>(null);

  // ── Mount: create instrument + all effects (disabled) ─────────────────
  useEffect(() => {
    const success = NativeAudioModule.createOscillatorInstrument(
      channelId,
      'Main Synth',
      16,
      'sine',
    );
    if (success) {
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
    }

    return () => {
      NativeAudioModule.allNotesOff(channelId);
    };
  }, [channelId]);

  // ── Preset handler ────────────────────────────────────────────────────
  const handlePresetSelect = useCallback(
    (preset: SynthPreset) => {
      applyPreset(channelId, preset);
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

      const syncEffect = (
        type: string,
        ref: React.MutableRefObject<number | null>,
        setEnabled: (v: boolean) => void,
        paramSyncFn?: (params: Record<string, number>) => void,
      ) => {
        const fx = preset.effects?.find(e => e.type === type) ?? null;
        const has = fx !== null;
        if (ref.current !== null) {
          NativeAudioModule.setEffectEnabled(channelId, ref.current, has);
          if (has && paramSyncFn) paramSyncFn(fx!.params);
        }
        setEnabled(has);
      };

      syncEffect('reverb', reverbIdRef, setReverbEnabled, params => {
        const rs = params.roomSize ?? reverbRoomSize;
        const wl = params.wetLevel ?? reverbWetLevel;
        NativeAudioModule.setEffectParameter(channelId, reverbIdRef.current!, 'roomSize', rs);
        NativeAudioModule.setEffectParameter(channelId, reverbIdRef.current!, 'wetLevel', wl);
        setReverbRoomSize(rs);
        setReverbWetLevel(wl);
      });

      syncEffect('delay', delayIdRef, setDelayEnabled, params => {
        const dt = params.delayTime ?? delayTime;
        const fb = params.feedback ?? delayFeedback;
        const wl = params.wetLevel ?? delayWetLevel;
        NativeAudioModule.setEffectParameter(channelId, delayIdRef.current!, 'delayTime', dt);
        NativeAudioModule.setEffectParameter(channelId, delayIdRef.current!, 'feedback', fb);
        NativeAudioModule.setEffectParameter(channelId, delayIdRef.current!, 'wetLevel', wl);
        setDelayTime(dt);
        setDelayFeedback(fb);
        setDelayWetLevel(wl);
      });

      syncEffect('chorus', chorusIdRef, setChorusEnabled, params => {
        const r = params.rate ?? chorusRate;
        const d = params.depth ?? chorusDepth;
        const m = params.mix ?? chorusMix;
        NativeAudioModule.setEffectParameter(channelId, chorusIdRef.current!, 'rate', r);
        NativeAudioModule.setEffectParameter(channelId, chorusIdRef.current!, 'depth', d);
        NativeAudioModule.setEffectParameter(channelId, chorusIdRef.current!, 'mix', m);
        setChorusRate(r);
        setChorusDepth(d);
        setChorusMix(m);
      });

      syncEffect('distortion', distortionIdRef, setDistortionEnabled, params => {
        const dr = params.drive ?? distortionDrive;
        const m = params.mix ?? distortionMix;
        const t = params.tone ?? distortionTone;
        NativeAudioModule.setEffectParameter(channelId, distortionIdRef.current!, 'drive', dr);
        NativeAudioModule.setEffectParameter(channelId, distortionIdRef.current!, 'mix', m);
        NativeAudioModule.setEffectParameter(channelId, distortionIdRef.current!, 'tone', t);
        setDistortionDrive(dr);
        setDistortionMix(m);
        setDistortionTone(t);
      });

      syncEffect('compressor', compressorIdRef, setCompressorEnabled, params => {
        const th = params.threshold ?? compThreshold;
        const ra = params.ratio ?? compRatio;
        const at = params.attack ?? compAttack;
        const re = params.release ?? compRelease;
        NativeAudioModule.setEffectParameter(channelId, compressorIdRef.current!, 'threshold', th);
        NativeAudioModule.setEffectParameter(channelId, compressorIdRef.current!, 'ratio', ra);
        NativeAudioModule.setEffectParameter(channelId, compressorIdRef.current!, 'attack', at);
        NativeAudioModule.setEffectParameter(channelId, compressorIdRef.current!, 'release', re);
        setCompThreshold(th);
        setCompRatio(ra);
        setCompAttack(at);
        setCompRelease(re);
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      }
    },
    [channelId],
  );

  const onOsc2WaveformChange = useCallback(
    (v: number) => {
      const wf = WAVEFORMS[Math.round(v)];
      if (wf) {
        setOsc2Waveform(wf);
        setActivePresetName(null);
        NativeAudioModule.setOsc2Waveform(channelId, wf);
      }
    },
    [channelId],
  );

  const onOsc2LevelChange = useCallback(
    (v: number) => NativeAudioModule.setOsc2Level(channelId, v),
    [channelId],
  );
  const onOsc2SemiChange = useCallback(
    (v: number) => NativeAudioModule.setOsc2Semi(channelId, Math.round(v)),
    [channelId],
  );
  const onOsc2SemiComplete = useCallback((v: number) => setOsc2Semi(Math.round(v)), []);
  const onOsc2DetuneChange = useCallback(
    (v: number) => NativeAudioModule.setOsc2Detune(channelId, v),
    [channelId],
  );
  const onSubLevelChange = useCallback(
    (v: number) => NativeAudioModule.setSubLevel(channelId, v),
    [channelId],
  );
  const onNoiseLevelChange = useCallback(
    (v: number) => NativeAudioModule.setNoiseLevel(channelId, v),
    [channelId],
  );

  // ── Voice filter callbacks ────────────────────────────────────────────
  const toggleVoiceFilter = useCallback(() => {
    setVoiceFilterEnabled(prev => {
      const next = !prev;
      NativeAudioModule.setVoiceFilterEnabled(channelId, next);
      return next;
    });
  }, [channelId]);

  const onVoiceFilterCutoffChange = useCallback(
    (v: number) => NativeAudioModule.setVoiceFilterCutoff(channelId, v),
    [channelId],
  );
  const onVoiceFilterResonanceChange = useCallback(
    (v: number) => NativeAudioModule.setVoiceFilterResonance(channelId, v),
    [channelId],
  );
  const onVoiceFilterEnvAmountChange = useCallback(
    (v: number) => NativeAudioModule.setVoiceFilterEnvAmount(channelId, v),
    [channelId],
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
  }, [channelId, chainFilterEnabled, chainFilterCutoff, chainFilterResonance, chainFilterType]);

  const changeChainFilterType = useCallback(() => {
    const nextIndex = (FILTER_TYPES.indexOf(chainFilterType) + 1) % FILTER_TYPES.length;
    setChainFilterType(FILTER_TYPES[nextIndex]);
    const id = filterIdRef.current;
    if (chainFilterEnabled && id !== null) {
      NativeAudioModule.setEffectParameter(channelId, id, 'type', nextIndex);
    }
  }, [channelId, chainFilterType, chainFilterEnabled]);

  const onChainFilterCutoffChange = useCallback(
    (v: number) => {
      if (filterIdRef.current !== null) {
        NativeAudioModule.setEffectParameter(channelId, filterIdRef.current, 'cutoff', v);
      }
    },
    [channelId],
  );
  const onChainFilterResonanceChange = useCallback(
    (v: number) => {
      if (filterIdRef.current !== null) {
        NativeAudioModule.setEffectParameter(channelId, filterIdRef.current, 'resonance', v);
      }
    },
    [channelId],
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
  }, [channelId, reverbEnabled, reverbRoomSize, reverbWetLevel]);

  const onReverbRoomSizeChange = useCallback(
    (v: number) => {
      if (reverbIdRef.current !== null) {
        NativeAudioModule.setEffectParameter(channelId, reverbIdRef.current, 'roomSize', v);
      }
    },
    [channelId],
  );
  const onReverbWetLevelChange = useCallback(
    (v: number) => {
      if (reverbIdRef.current !== null) {
        NativeAudioModule.setEffectParameter(channelId, reverbIdRef.current, 'wetLevel', v);
      }
    },
    [channelId],
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
  }, [channelId, delayEnabled, delayTime, delayFeedback, delayWetLevel]);

  const onDelayTimeChange = useCallback(
    (v: number) => {
      if (delayIdRef.current !== null) {
        NativeAudioModule.setEffectParameter(channelId, delayIdRef.current, 'delayTime', v);
      }
    },
    [channelId],
  );
  const onDelayFeedbackChange = useCallback(
    (v: number) => {
      if (delayIdRef.current !== null) {
        NativeAudioModule.setEffectParameter(channelId, delayIdRef.current, 'feedback', v);
      }
    },
    [channelId],
  );
  const onDelayWetLevelChange = useCallback(
    (v: number) => {
      if (delayIdRef.current !== null) {
        NativeAudioModule.setEffectParameter(channelId, delayIdRef.current, 'wetLevel', v);
      }
    },
    [channelId],
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
  }, [channelId, chorusEnabled, chorusRate, chorusDepth, chorusMix]);

  const onChorusRateChange = useCallback(
    (v: number) => {
      if (chorusIdRef.current !== null) {
        NativeAudioModule.setEffectParameter(channelId, chorusIdRef.current, 'rate', v);
      }
    },
    [channelId],
  );
  const onChorusDepthChange = useCallback(
    (v: number) => {
      if (chorusIdRef.current !== null) {
        NativeAudioModule.setEffectParameter(channelId, chorusIdRef.current, 'depth', v);
      }
    },
    [channelId],
  );
  const onChorusMixChange = useCallback(
    (v: number) => {
      if (chorusIdRef.current !== null) {
        NativeAudioModule.setEffectParameter(channelId, chorusIdRef.current, 'mix', v);
      }
    },
    [channelId],
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
  }, [channelId, distortionEnabled, distortionDrive, distortionMix, distortionTone]);

  const onDistortionDriveChange = useCallback(
    (v: number) => {
      if (distortionIdRef.current !== null) {
        NativeAudioModule.setEffectParameter(channelId, distortionIdRef.current, 'drive', v);
      }
    },
    [channelId],
  );
  const onDistortionMixChange = useCallback(
    (v: number) => {
      if (distortionIdRef.current !== null) {
        NativeAudioModule.setEffectParameter(channelId, distortionIdRef.current, 'mix', v);
      }
    },
    [channelId],
  );
  const onDistortionToneChange = useCallback(
    (v: number) => {
      if (distortionIdRef.current !== null) {
        NativeAudioModule.setEffectParameter(channelId, distortionIdRef.current, 'tone', v);
      }
    },
    [channelId],
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
  }, [channelId, compressorEnabled, compThreshold, compRatio, compAttack, compRelease]);

  const onCompThresholdChange = useCallback(
    (v: number) => {
      if (compressorIdRef.current !== null) {
        NativeAudioModule.setEffectParameter(channelId, compressorIdRef.current, 'threshold', v);
      }
    },
    [channelId],
  );
  const onCompRatioChange = useCallback(
    (v: number) => {
      if (compressorIdRef.current !== null) {
        NativeAudioModule.setEffectParameter(channelId, compressorIdRef.current, 'ratio', v);
      }
    },
    [channelId],
  );
  const onCompAttackChange = useCallback(
    (v: number) => {
      if (compressorIdRef.current !== null) {
        NativeAudioModule.setEffectParameter(channelId, compressorIdRef.current, 'attack', v);
      }
    },
    [channelId],
  );
  const onCompReleaseChange = useCallback(
    (v: number) => {
      if (compressorIdRef.current !== null) {
        NativeAudioModule.setEffectParameter(channelId, compressorIdRef.current, 'release', v);
      }
    },
    [channelId],
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
    onOsc2LevelComplete: setOsc2Level,
    onOsc2SemiChange,
    onOsc2SemiComplete,
    onOsc2DetuneChange,
    onOsc2DetuneComplete: setOsc2Detune,
    onSubLevelChange,
    onSubLevelComplete: setSubLevel,
    onNoiseLevelChange,
    onNoiseLevelComplete: setNoiseLevel,
    toggleVoiceFilter,
    onVoiceFilterCutoffChange,
    onVoiceFilterCutoffComplete: setVoiceFilterCutoff,
    onVoiceFilterResonanceChange,
    onVoiceFilterResonanceComplete: setVoiceFilterResonance,
    onVoiceFilterEnvAmountChange,
    onVoiceFilterEnvAmountComplete: setVoiceFilterEnvAmount,
    toggleChainFilter,
    changeChainFilterType,
    onChainFilterCutoffChange,
    onChainFilterCutoffComplete: setChainFilterCutoff,
    onChainFilterResonanceChange,
    onChainFilterResonanceComplete: setChainFilterResonance,
    toggleReverb,
    onReverbRoomSizeChange,
    onReverbRoomSizeComplete: setReverbRoomSize,
    onReverbWetLevelChange,
    onReverbWetLevelComplete: setReverbWetLevel,
    toggleDelay,
    onDelayTimeChange,
    onDelayTimeComplete: setDelayTime,
    onDelayFeedbackChange,
    onDelayFeedbackComplete: setDelayFeedback,
    onDelayWetLevelChange,
    onDelayWetLevelComplete: setDelayWetLevel,
    toggleChorus,
    onChorusRateChange,
    onChorusRateComplete: setChorusRate,
    onChorusDepthChange,
    onChorusDepthComplete: setChorusDepth,
    onChorusMixChange,
    onChorusMixComplete: setChorusMix,
    toggleDistortion,
    onDistortionDriveChange,
    onDistortionDriveComplete: setDistortionDrive,
    onDistortionMixChange,
    onDistortionMixComplete: setDistortionMix,
    onDistortionToneChange,
    onDistortionToneComplete: setDistortionTone,
    toggleCompressor,
    onCompThresholdChange,
    onCompThresholdComplete: setCompThreshold,
    onCompRatioChange,
    onCompRatioComplete: setCompRatio,
    onCompAttackChange,
    onCompAttackComplete: setCompAttack,
    onCompReleaseChange,
    onCompReleaseComplete: setCompRelease,
  };
}
