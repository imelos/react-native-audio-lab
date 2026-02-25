import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Text,
  Button,
  TouchableOpacity,
  ScrollView,
  FlatList,
} from 'react-native';
import NativeAudioModule from '../specs/NativeAudioModule';
import Player from '../features/music-pad/Player';
import { Props } from '../navigation/Navigation';
import { useHeaderHeight } from '@react-navigation/elements';
import {
  PRESET_CATEGORIES,
  getPresetsByCategory,
  type PresetCategory,
  type SynthPreset,
} from '../data/synthPresets';
import { applyPreset } from '../utils/applyPreset';
import KnobPanel, { type KnobConfig } from '../components/knob/KnobPanel';

const WAVEFORMS = ['sine', 'saw', 'square', 'triangle'] as const;
type Waveform = (typeof WAVEFORMS)[number];

const GRID_CONFIGS = {
  '4x4': { rows: 4, cols: 4 },
  '5x5': { rows: 5, cols: 5 },
  '6x6': { rows: 6, cols: 6 },
  '8x8': { rows: 8, cols: 8 },
} as const;

type GridSize = keyof typeof GRID_CONFIGS;

const KEYS = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
] as const;
type Key = (typeof KEYS)[number];

const SCALES = {
  Major: [0, 2, 4, 5, 7, 9, 11],
  Minor: [0, 2, 3, 5, 7, 8, 10],
} as const;

type ScaleType = keyof typeof SCALES;

const FILTER_TYPES = ['LowPass', 'HighPass', 'BandPass'] as const;
type FilterType = (typeof FILTER_TYPES)[number];

type TabType = 'instrument' | 'oscillators' | 'filter' | 'fx';

const TAB_LABELS: Record<TabType, string> = {
  instrument: 'Instrument',
  oscillators: 'Oscillators',
  filter: 'Filter',
  fx: 'FX',
};

const SynthScreen: React.FC<Props<'synth'>> = ({ route }) => {
  const { channelId, color } = route.params;

  // ── UI / instrument state ────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<TabType>('instrument');
  const [currentWaveform, setCurrentWaveform] = useState<Waveform>('sine');
  const [gridSize, setGridSize] = useState<GridSize>('5x5');
  const [selectedKey, setSelectedKey] = useState<Key>('C');
  const [scaleType, setScaleType] = useState<ScaleType>('Major');
  const [useScale, setUseScale] = useState(true);
  const [octaveShift, setOctaveShift] = useState(0);
  const [selectedCategory, setSelectedCategory] =
    useState<PresetCategory>('Keys');
  const [activePresetName, setActivePresetName] = useState<string | null>(null);

  // ── Oscillator 2 state ─────────────────────────────────────────────
  const [osc2Waveform, setOsc2Waveform] = useState<Waveform>('sine');
  const [osc2Level, setOsc2Level] = useState(0);
  const [osc2Semi, setOsc2Semi] = useState(0);
  const [osc2Detune, setOsc2Detune] = useState(0);

  // ── Sub / Noise state ──────────────────────────────────────────────
  const [subLevel, setSubLevel] = useState(0);
  const [noiseLevel, setNoiseLevel] = useState(0);

  // ── Per-voice filter state ─────────────────────────────────────────
  const [voiceFilterEnabled, setVoiceFilterEnabled] = useState(false);
  const [voiceFilterCutoff, setVoiceFilterCutoff] = useState(8000);
  const [voiceFilterResonance, setVoiceFilterResonance] = useState(0);
  const [voiceFilterEnvAmount, setVoiceFilterEnvAmount] = useState(0);

  // ── Chain filter state (user-controlled, never touched by presets) ───
  const [chainFilterEnabled, setChainFilterEnabled] = useState(false);
  const [chainFilterType, setChainFilterType] = useState<FilterType>('LowPass');
  const [chainFilterCutoff, setChainFilterCutoff] = useState(1000);
  const [chainFilterResonance, setChainFilterResonance] = useState(0.7);

  // ── Reverb state ─────────────────────────────────────────────────────
  const [reverbEnabled, setReverbEnabled] = useState(false);
  const [reverbRoomSize, setReverbRoomSize] = useState(0.5);
  const [reverbWetLevel, setReverbWetLevel] = useState(0.33);

  // ── Delay state ──────────────────────────────────────────────────────
  const [delayEnabled, setDelayEnabled] = useState(false);
  const [delayTime, setDelayTime] = useState(500);
  const [delayFeedback, setDelayFeedback] = useState(0.4);
  const [delayWetLevel, setDelayWetLevel] = useState(0.5);

  // ── Chorus state ─────────────────────────────────────────────────────
  const [chorusEnabled, setChorusEnabled] = useState(false);
  const [chorusRate, setChorusRate] = useState(1.0);
  const [chorusDepth, setChorusDepth] = useState(0.25);
  const [chorusMix, setChorusMix] = useState(0.5);

  // ── Distortion state ─────────────────────────────────────────────────
  const [distortionEnabled, setDistortionEnabled] = useState(false);
  const [distortionDrive, setDistortionDrive] = useState(1.0);
  const [distortionMix, setDistortionMix] = useState(0.5);
  const [distortionTone, setDistortionTone] = useState(0.5);

  // ── Compressor state ─────────────────────────────────────────────────
  const [compressorEnabled, setCompressorEnabled] = useState(false);
  const [compThreshold, setCompThreshold] = useState(-20);
  const [compRatio, setCompRatio] = useState(4);
  const [compAttack, setCompAttack] = useState(10);
  const [compRelease, setCompRelease] = useState(100);

  // ── Permanent effect IDs (set once on mount, never change) ───────────
  const filterIdRef = useRef<number | null>(null);
  const reverbIdRef = useRef<number | null>(null);
  const delayIdRef = useRef<number | null>(null);
  const chorusIdRef = useRef<number | null>(null);
  const distortionIdRef = useRef<number | null>(null);
  const compressorIdRef = useRef<number | null>(null);

  // ── Mount: create instrument + all six effects (disabled) ─────────
  useEffect(() => {
    const success = NativeAudioModule.createOscillatorInstrument(
      channelId,
      'Main Synth',
      16,
      'sine',
    );
    if (success) {
      NativeAudioModule.setADSR(channelId, 0.01, 0.1, 0.8, 0.3);

      // Chain filter
      const fId = NativeAudioModule.addEffect(channelId, 'filter');
      if (fId >= 0) {
        NativeAudioModule.setEffectEnabled(channelId, fId, false);
        NativeAudioModule.setEffectParameter(channelId, fId, 'cutoff', 1000);
        NativeAudioModule.setEffectParameter(channelId, fId, 'resonance', 0.7);
        NativeAudioModule.setEffectParameter(channelId, fId, 'type', 0);
        filterIdRef.current = fId;
      }

      // Reverb
      const rId = NativeAudioModule.addEffect(channelId, 'reverb');
      if (rId >= 0) {
        NativeAudioModule.setEffectEnabled(channelId, rId, false);
        NativeAudioModule.setEffectParameter(channelId, rId, 'roomSize', 0.5);
        NativeAudioModule.setEffectParameter(channelId, rId, 'wetLevel', 0.33);
        reverbIdRef.current = rId;
      }

      // Delay
      const dId = NativeAudioModule.addEffect(channelId, 'delay');
      if (dId >= 0) {
        NativeAudioModule.setEffectEnabled(channelId, dId, false);
        NativeAudioModule.setEffectParameter(channelId, dId, 'delayTime', 500);
        NativeAudioModule.setEffectParameter(channelId, dId, 'feedback', 0.4);
        NativeAudioModule.setEffectParameter(channelId, dId, 'wetLevel', 0.5);
        delayIdRef.current = dId;
      }

      // Chorus
      const chId = NativeAudioModule.addEffect(channelId, 'chorus');
      if (chId >= 0) {
        NativeAudioModule.setEffectEnabled(channelId, chId, false);
        NativeAudioModule.setEffectParameter(channelId, chId, 'rate', 1.0);
        NativeAudioModule.setEffectParameter(channelId, chId, 'depth', 0.25);
        NativeAudioModule.setEffectParameter(channelId, chId, 'mix', 0.5);
        chorusIdRef.current = chId;
      }

      // Distortion
      const distId = NativeAudioModule.addEffect(channelId, 'distortion');
      if (distId >= 0) {
        NativeAudioModule.setEffectEnabled(channelId, distId, false);
        NativeAudioModule.setEffectParameter(channelId, distId, 'drive', 1.0);
        NativeAudioModule.setEffectParameter(channelId, distId, 'mix', 0.5);
        NativeAudioModule.setEffectParameter(channelId, distId, 'tone', 0.5);
        distortionIdRef.current = distId;
      }

      // Compressor
      const compId = NativeAudioModule.addEffect(channelId, 'compressor');
      if (compId >= 0) {
        NativeAudioModule.setEffectEnabled(channelId, compId, false);
        NativeAudioModule.setEffectParameter(
          channelId,
          compId,
          'threshold',
          -20,
        );
        NativeAudioModule.setEffectParameter(channelId, compId, 'ratio', 4);
        NativeAudioModule.setEffectParameter(channelId, compId, 'attack', 10);
        NativeAudioModule.setEffectParameter(
          channelId,
          compId,
          'release',
          100,
        );
        compressorIdRef.current = compId;
      }
    }

    return () => {
      NativeAudioModule.allNotesOff(channelId);
    };
  }, [channelId]);

  // ── Preset selection ─────────────────────────────────────────────────
  const handlePresetSelect = useCallback(
    (preset: SynthPreset) => {
      applyPreset(channelId, preset);
      setActivePresetName(preset.name);
      setCurrentWaveform(preset.waveform1);

      // Sync oscillator UI state from preset
      setOsc2Waveform(preset.waveform2);
      setOsc2Level(preset.osc2Level);
      setOsc2Semi(preset.osc2Semi);
      setOsc2Detune(preset.detuneCents2);
      setSubLevel(preset.subLevel);
      setNoiseLevel(preset.noiseLevel);

      // Sync per-voice filter UI state from preset
      setVoiceFilterEnabled(preset.filterEnabled);
      setVoiceFilterCutoff(preset.filterCutoff);
      setVoiceFilterResonance(preset.filterResonance);
      setVoiceFilterEnvAmount(preset.filterEnvAmount);

      // Helper to sync an effect from preset
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
          if (has && paramSyncFn) {
            paramSyncFn(fx!.params);
          }
        }
        setEnabled(has);
      };

      // Reverb
      syncEffect('reverb', reverbIdRef, setReverbEnabled, params => {
        const rs = params.roomSize ?? reverbRoomSize;
        const wl = params.wetLevel ?? reverbWetLevel;
        NativeAudioModule.setEffectParameter(
          channelId,
          reverbIdRef.current!,
          'roomSize',
          rs,
        );
        NativeAudioModule.setEffectParameter(
          channelId,
          reverbIdRef.current!,
          'wetLevel',
          wl,
        );
        setReverbRoomSize(rs);
        setReverbWetLevel(wl);
      });

      // Delay
      syncEffect('delay', delayIdRef, setDelayEnabled, params => {
        const dt = params.delayTime ?? delayTime;
        const fb = params.feedback ?? delayFeedback;
        const wl = params.wetLevel ?? delayWetLevel;
        NativeAudioModule.setEffectParameter(
          channelId,
          delayIdRef.current!,
          'delayTime',
          dt,
        );
        NativeAudioModule.setEffectParameter(
          channelId,
          delayIdRef.current!,
          'feedback',
          fb,
        );
        NativeAudioModule.setEffectParameter(
          channelId,
          delayIdRef.current!,
          'wetLevel',
          wl,
        );
        setDelayTime(dt);
        setDelayFeedback(fb);
        setDelayWetLevel(wl);
      });

      // Chorus
      syncEffect('chorus', chorusIdRef, setChorusEnabled, params => {
        const r = params.rate ?? chorusRate;
        const d = params.depth ?? chorusDepth;
        const m = params.mix ?? chorusMix;
        NativeAudioModule.setEffectParameter(
          channelId,
          chorusIdRef.current!,
          'rate',
          r,
        );
        NativeAudioModule.setEffectParameter(
          channelId,
          chorusIdRef.current!,
          'depth',
          d,
        );
        NativeAudioModule.setEffectParameter(
          channelId,
          chorusIdRef.current!,
          'mix',
          m,
        );
        setChorusRate(r);
        setChorusDepth(d);
        setChorusMix(m);
      });

      // Distortion
      syncEffect('distortion', distortionIdRef, setDistortionEnabled, params => {
        const dr = params.drive ?? distortionDrive;
        const m = params.mix ?? distortionMix;
        const t = params.tone ?? distortionTone;
        NativeAudioModule.setEffectParameter(
          channelId,
          distortionIdRef.current!,
          'drive',
          dr,
        );
        NativeAudioModule.setEffectParameter(
          channelId,
          distortionIdRef.current!,
          'mix',
          m,
        );
        NativeAudioModule.setEffectParameter(
          channelId,
          distortionIdRef.current!,
          'tone',
          t,
        );
        setDistortionDrive(dr);
        setDistortionMix(m);
        setDistortionTone(t);
      });

      // Compressor
      syncEffect(
        'compressor',
        compressorIdRef,
        setCompressorEnabled,
        params => {
          const th = params.threshold ?? compThreshold;
          const ra = params.ratio ?? compRatio;
          const at = params.attack ?? compAttack;
          const re = params.release ?? compRelease;
          NativeAudioModule.setEffectParameter(
            channelId,
            compressorIdRef.current!,
            'threshold',
            th,
          );
          NativeAudioModule.setEffectParameter(
            channelId,
            compressorIdRef.current!,
            'ratio',
            ra,
          );
          NativeAudioModule.setEffectParameter(
            channelId,
            compressorIdRef.current!,
            'attack',
            at,
          );
          NativeAudioModule.setEffectParameter(
            channelId,
            compressorIdRef.current!,
            'release',
            re,
          );
          setCompThreshold(th);
          setCompRatio(ra);
          setCompAttack(at);
          setCompRelease(re);
        },
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [channelId],
  );

  // ── Effect toggles ──────────────────────────────────────────────────

  const makeToggle = (
    ref: React.MutableRefObject<number | null>,
    enabled: boolean,
    setEnabled: (v: boolean) => void,
    syncParams?: (id: number) => void,
  ) => {
    return () => {
      const id = ref.current;
      if (id === null || id < 0) return;
      const newEnabled = !enabled;
      NativeAudioModule.setEffectEnabled(channelId, id, newEnabled);
      if (newEnabled && syncParams) syncParams(id);
      setEnabled(newEnabled);
    };
  };

  const toggleChainFilter = makeToggle(
    filterIdRef,
    chainFilterEnabled,
    setChainFilterEnabled,
    id => {
      NativeAudioModule.setEffectParameter(
        channelId,
        id,
        'cutoff',
        chainFilterCutoff,
      );
      NativeAudioModule.setEffectParameter(
        channelId,
        id,
        'resonance',
        chainFilterResonance,
      );
      NativeAudioModule.setEffectParameter(
        channelId,
        id,
        'type',
        FILTER_TYPES.indexOf(chainFilterType),
      );
    },
  );

  const toggleReverb = makeToggle(
    reverbIdRef,
    reverbEnabled,
    setReverbEnabled,
    id => {
      NativeAudioModule.setEffectParameter(channelId, id, 'roomSize', reverbRoomSize);
      NativeAudioModule.setEffectParameter(channelId, id, 'wetLevel', reverbWetLevel);
    },
  );

  const toggleDelay = makeToggle(
    delayIdRef,
    delayEnabled,
    setDelayEnabled,
    id => {
      NativeAudioModule.setEffectParameter(channelId, id, 'delayTime', delayTime);
      NativeAudioModule.setEffectParameter(channelId, id, 'feedback', delayFeedback);
      NativeAudioModule.setEffectParameter(channelId, id, 'wetLevel', delayWetLevel);
    },
  );

  const toggleChorus = makeToggle(
    chorusIdRef,
    chorusEnabled,
    setChorusEnabled,
    id => {
      NativeAudioModule.setEffectParameter(channelId, id, 'rate', chorusRate);
      NativeAudioModule.setEffectParameter(channelId, id, 'depth', chorusDepth);
      NativeAudioModule.setEffectParameter(channelId, id, 'mix', chorusMix);
    },
  );

  const toggleDistortion = makeToggle(
    distortionIdRef,
    distortionEnabled,
    setDistortionEnabled,
    id => {
      NativeAudioModule.setEffectParameter(channelId, id, 'drive', distortionDrive);
      NativeAudioModule.setEffectParameter(channelId, id, 'mix', distortionMix);
      NativeAudioModule.setEffectParameter(channelId, id, 'tone', distortionTone);
    },
  );

  const toggleCompressor = makeToggle(
    compressorIdRef,
    compressorEnabled,
    setCompressorEnabled,
    id => {
      NativeAudioModule.setEffectParameter(channelId, id, 'threshold', compThreshold);
      NativeAudioModule.setEffectParameter(channelId, id, 'ratio', compRatio);
      NativeAudioModule.setEffectParameter(channelId, id, 'attack', compAttack);
      NativeAudioModule.setEffectParameter(channelId, id, 'release', compRelease);
    },
  );

  const changeChainFilterType = () => {
    const nextIndex =
      (FILTER_TYPES.indexOf(chainFilterType) + 1) % FILTER_TYPES.length;
    setChainFilterType(FILTER_TYPES[nextIndex]);
    const id = filterIdRef.current;
    if (chainFilterEnabled && id !== null) {
      NativeAudioModule.setEffectParameter(channelId, id, 'type', nextIndex);
    }
  };

  // ── Grid / key helpers ─────────────────────────────────────────────────
  const changeGridSize = () => {
    const sizes: GridSize[] = ['4x4', '5x5', '6x6', '8x8'];
    setGridSize(sizes[(sizes.indexOf(gridSize) + 1) % sizes.length]);
  };

  const changeKey = () => {
    setSelectedKey(KEYS[(KEYS.indexOf(selectedKey) + 1) % KEYS.length]);
  };

  // ── Notes / grid ──────────────────────────────────────────────────────
  const { rows, cols } = GRID_CONFIGS[gridSize];
  const totalPads = rows * cols;
  const rootNote = 12 * (3 + 1) + KEYS.indexOf(selectedKey) + octaveShift * 12;
  const gridNotes = useScale
    ? generateScale(rootNote, scaleType, totalPads)
    : Array.from({ length: totalPads }, (_, i) => rootNote + i);
  const scaleNotes = new Set(generateScale(rootNote, scaleType, 88));

  const headerHeight = useHeaderHeight();

  // ── Scroll lock while a knob is being dragged ─────────────────────────
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const disableScroll = useCallback(() => setScrollEnabled(false), []);
  const enableScroll = useCallback(() => setScrollEnabled(true), []);

  // ── Tab content ───────────────────────────────────────────────────────
  const renderTabContent = () => {
    switch (activeTab) {
      case 'instrument':
        return (
          <ScrollView
            style={styles.tabContent}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
            scrollEnabled={scrollEnabled}
          >
            <View style={styles.controlRow}>
              <Text style={styles.label}>
                Octave: {octaveShift >= 0 ? '+' : ''}
                {octaveShift}
              </Text>
              <View style={styles.buttonGroup}>
                <Button
                  title="-12st"
                  onPress={() => setOctaveShift(o => Math.max(o - 1, -3))}
                  color={color}
                />
                <Button
                  title="+12st"
                  onPress={() => setOctaveShift(o => Math.min(o + 1, 3))}
                  color={color}
                />
              </View>
            </View>

            <View style={styles.presetSection}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.categoryBar}
              >
                {PRESET_CATEGORIES.map(cat => (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.categoryChip,
                      selectedCategory === cat && { backgroundColor: color },
                    ]}
                    onPress={() => setSelectedCategory(cat)}
                  >
                    <Text
                      style={[
                        styles.categoryChipText,
                        selectedCategory === cat &&
                          styles.categoryChipTextActive,
                      ]}
                    >
                      {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={getPresetsByCategory(selectedCategory)}
                keyExtractor={item => item.name}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[
                      styles.presetChip,
                      activePresetName === item.name && {
                        borderColor: color,
                        backgroundColor: color + '26',
                      },
                    ]}
                    onPress={() => handlePresetSelect(item)}
                  >
                    <Text
                      style={[
                        styles.presetChipText,
                        activePresetName === item.name &&
                          styles.presetChipTextActive,
                      ]}
                    >
                      {item.name}
                    </Text>
                  </TouchableOpacity>
                )}
                style={styles.presetList}
              />
            </View>

            <View style={styles.controlRow}>
              <Text style={styles.label}>Key: {selectedKey}</Text>
              <Button title="Change Key" onPress={changeKey} color={color} />
            </View>
            <View style={styles.controlRow}>
              <Text style={styles.label}>Scale: {scaleType}</Text>
              <Button
                title="Major/Minor"
                onPress={() =>
                  setScaleType(s => (s === 'Major' ? 'Minor' : 'Major'))
                }
                color={color}
              />
            </View>
            <View style={styles.controlRow}>
              <Text style={styles.label}>
                Mode: {useScale ? 'Scale' : 'Chromatic'}
              </Text>
              <Button
                title="Toggle Mode"
                onPress={() => setUseScale(v => !v)}
                color={color}
              />
            </View>
            <View style={styles.controlRow}>
              <Text style={styles.label}>Grid: {gridSize}</Text>
              <Button
                title="Change Grid"
                onPress={changeGridSize}
                color={color}
              />
            </View>
          </ScrollView>
        );

      case 'oscillators':
        return (
          <ScrollView
            style={styles.tabContent}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
            scrollEnabled={scrollEnabled}
          >
            {/* Osc 1 + Osc 2 waveforms */}
            <KnobPanel
              color={color}
              onDragStart={disableScroll}
              onDragEnd={enableScroll}
              knobs={[
                {
                  label: 'Osc 1',
                  value: WAVEFORMS.indexOf(currentWaveform),
                  min: 0,
                  max: WAVEFORMS.length - 1,
                  step: 1,
                  formatValue: v => WAVEFORMS[Math.round(v)] ?? 'sine',
                  onChange: v => {
                    const wf = WAVEFORMS[Math.round(v)];
                    if (wf) {
                      setCurrentWaveform(wf);
                      setActivePresetName(null);
                      NativeAudioModule.setWaveform(channelId, wf);
                    }
                  },
                },
                {
                  label: 'Osc 2',
                  value: WAVEFORMS.indexOf(osc2Waveform),
                  min: 0,
                  max: WAVEFORMS.length - 1,
                  step: 1,
                  formatValue: v => WAVEFORMS[Math.round(v)] ?? 'sine',
                  onChange: v => {
                    const wf = WAVEFORMS[Math.round(v)];
                    if (wf) {
                      setOsc2Waveform(wf);
                      setActivePresetName(null);
                      NativeAudioModule.setOsc2Waveform(channelId, wf);
                    }
                  },
                },
                {
                  label: 'Osc2 Level',
                  value: osc2Level,
                  min: 0,
                  max: 1,
                  formatValue: v => `${(v * 100).toFixed(0)}%`,
                  onChange: v => NativeAudioModule.setOsc2Level(channelId, v),
                  onComplete: setOsc2Level,
                },
                {
                  label: 'Semi',
                  value: osc2Semi,
                  min: -24,
                  max: 24,
                  step: 1,
                  formatValue: v => `${v > 0 ? '+' : ''}${Math.round(v)}st`,
                  onChange: v => NativeAudioModule.setOsc2Semi(channelId, Math.round(v)),
                  onComplete: v => setOsc2Semi(Math.round(v)),
                },
              ]}
            />

            {/* Detune + Sub + Noise */}
            <KnobPanel
              color={color}
              onDragStart={disableScroll}
              onDragEnd={enableScroll}
              knobs={[
                {
                  label: 'Detune',
                  value: osc2Detune,
                  min: -100,
                  max: 100,
                  step: 1,
                  formatValue: v => `${v > 0 ? '+' : ''}${v.toFixed(0)}ct`,
                  onChange: v => NativeAudioModule.setOsc2Detune(channelId, v),
                  onComplete: setOsc2Detune,
                },
                {
                  label: 'Sub',
                  value: subLevel,
                  min: 0,
                  max: 1,
                  formatValue: v => `${(v * 100).toFixed(0)}%`,
                  onChange: v => NativeAudioModule.setSubLevel(channelId, v),
                  onComplete: setSubLevel,
                },
                {
                  label: 'Noise',
                  value: noiseLevel,
                  min: 0,
                  max: 1,
                  formatValue: v => `${(v * 100).toFixed(0)}%`,
                  onChange: v => NativeAudioModule.setNoiseLevel(channelId, v),
                  onComplete: setNoiseLevel,
                },
              ]}
            />
          </ScrollView>
        );

      case 'filter':
        return (
          <ScrollView
            style={styles.tabContent}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
            scrollEnabled={scrollEnabled}
          >
            {/* Per-voice filter */}
            <View style={styles.effectSection}>
              <View style={styles.effectHeader}>
                <Text style={styles.effectTitle}>Voice Filter</Text>
                <Button
                  title={voiceFilterEnabled ? 'ON' : 'OFF'}
                  onPress={() => {
                    const next = !voiceFilterEnabled;
                    setVoiceFilterEnabled(next);
                    NativeAudioModule.setVoiceFilterEnabled(channelId, next);
                  }}
                  color={voiceFilterEnabled ? '#4caf50' : '#757575'}
                />
              </View>
              {voiceFilterEnabled && (
                <KnobPanel
                  color={color}
                  onDragStart={disableScroll}
                  onDragEnd={enableScroll}
                  knobs={[
                    {
                      label: 'Cutoff',
                      value: voiceFilterCutoff,
                      min: 20,
                      max: 20000,
                      formatValue: v => `${Math.round(v)}`,
                      onChange: v => NativeAudioModule.setVoiceFilterCutoff(channelId, v),
                      onComplete: setVoiceFilterCutoff,
                    },
                    {
                      label: 'Resonance',
                      value: voiceFilterResonance,
                      min: 0,
                      max: 1,
                      formatValue: v => v.toFixed(2),
                      onChange: v => NativeAudioModule.setVoiceFilterResonance(channelId, v),
                      onComplete: setVoiceFilterResonance,
                    },
                    {
                      label: 'Env Amt',
                      value: voiceFilterEnvAmount,
                      min: 0,
                      max: 1,
                      formatValue: v => `${(v * 100).toFixed(0)}%`,
                      onChange: v => NativeAudioModule.setVoiceFilterEnvAmount(channelId, v),
                      onComplete: setVoiceFilterEnvAmount,
                    },
                  ]}
                />
              )}
            </View>
          </ScrollView>
        );

      case 'fx':
        return (
          <ScrollView
            style={styles.tabContent}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
            scrollEnabled={scrollEnabled}
          >
            {/* Chain Filter */}
            <View style={styles.effectSection}>
              <View style={styles.effectHeader}>
                <Text style={styles.effectTitle}>Chain Filter</Text>
                <Button
                  title={chainFilterEnabled ? 'ON' : 'OFF'}
                  onPress={toggleChainFilter}
                  color={chainFilterEnabled ? '#4caf50' : '#757575'}
                />
              </View>
              {chainFilterEnabled && (
                <>
                  <View style={styles.controlRow}>
                    <Text style={styles.label}>Type: {chainFilterType}</Text>
                    <Button
                      title="Change Type"
                      onPress={changeChainFilterType}
                      color={color}
                    />
                  </View>
                  <KnobPanel
                    color={color}
                    onDragStart={disableScroll}
                    onDragEnd={enableScroll}
                    knobs={[
                      {
                        label: 'Cutoff',
                        value: chainFilterCutoff,
                        min: 20,
                        max: 20000,
                        formatValue: v => `${Math.round(v)}`,
                        onChange: v => filterIdRef.current !== null && NativeAudioModule.setEffectParameter(channelId, filterIdRef.current, 'cutoff', v),
                        onComplete: setChainFilterCutoff,
                      },
                      {
                        label: 'Resonance',
                        value: chainFilterResonance,
                        min: 0.1,
                        max: 10,
                        formatValue: v => v.toFixed(2),
                        onChange: v => filterIdRef.current !== null && NativeAudioModule.setEffectParameter(channelId, filterIdRef.current, 'resonance', v),
                        onComplete: setChainFilterResonance,
                      },
                    ]}
                  />
                </>
              )}
            </View>

            {/* Reverb */}
            <View style={styles.effectSection}>
              <View style={styles.effectHeader}>
                <Text style={styles.effectTitle}>Reverb</Text>
                <Button
                  title={reverbEnabled ? 'ON' : 'OFF'}
                  onPress={toggleReverb}
                  color={reverbEnabled ? '#4caf50' : '#757575'}
                />
              </View>
              {reverbEnabled && (
                <KnobPanel
                  color={color}
                  onDragStart={disableScroll}
                  onDragEnd={enableScroll}
                  knobs={[
                    {
                      label: 'Room Size',
                      value: reverbRoomSize,
                      min: 0,
                      max: 1,
                      formatValue: v => `${(v * 100).toFixed(0)}%`,
                      onChange: v => reverbIdRef.current !== null && NativeAudioModule.setEffectParameter(channelId, reverbIdRef.current, 'roomSize', v),
                      onComplete: setReverbRoomSize,
                    },
                    {
                      label: 'Wet',
                      value: reverbWetLevel,
                      min: 0,
                      max: 1,
                      formatValue: v => `${(v * 100).toFixed(0)}%`,
                      onChange: v => reverbIdRef.current !== null && NativeAudioModule.setEffectParameter(channelId, reverbIdRef.current, 'wetLevel', v),
                      onComplete: setReverbWetLevel,
                    },
                  ]}
                />
              )}
            </View>

            {/* Delay */}
            <View style={styles.effectSection}>
              <View style={styles.effectHeader}>
                <Text style={styles.effectTitle}>Delay</Text>
                <Button
                  title={delayEnabled ? 'ON' : 'OFF'}
                  onPress={toggleDelay}
                  color={delayEnabled ? '#4caf50' : '#757575'}
                />
              </View>
              {delayEnabled && (
                <KnobPanel
                  color={color}
                  onDragStart={disableScroll}
                  onDragEnd={enableScroll}
                  knobs={[
                    {
                      label: 'Time',
                      value: delayTime,
                      min: 1,
                      max: 2000,
                      formatValue: v => `${Math.round(v)}ms`,
                      onChange: v => delayIdRef.current !== null && NativeAudioModule.setEffectParameter(channelId, delayIdRef.current, 'delayTime', v),
                      onComplete: setDelayTime,
                    },
                    {
                      label: 'Feedback',
                      value: delayFeedback,
                      min: 0,
                      max: 0.95,
                      formatValue: v => `${(v * 100).toFixed(0)}%`,
                      onChange: v => delayIdRef.current !== null && NativeAudioModule.setEffectParameter(channelId, delayIdRef.current, 'feedback', v),
                      onComplete: setDelayFeedback,
                    },
                    {
                      label: 'Wet',
                      value: delayWetLevel,
                      min: 0,
                      max: 1,
                      formatValue: v => `${(v * 100).toFixed(0)}%`,
                      onChange: v => delayIdRef.current !== null && NativeAudioModule.setEffectParameter(channelId, delayIdRef.current, 'wetLevel', v),
                      onComplete: setDelayWetLevel,
                    },
                  ]}
                />
              )}
            </View>

            {/* Chorus */}
            <View style={styles.effectSection}>
              <View style={styles.effectHeader}>
                <Text style={styles.effectTitle}>Chorus</Text>
                <Button
                  title={chorusEnabled ? 'ON' : 'OFF'}
                  onPress={toggleChorus}
                  color={chorusEnabled ? '#4caf50' : '#757575'}
                />
              </View>
              {chorusEnabled && (
                <KnobPanel
                  color={color}
                  onDragStart={disableScroll}
                  onDragEnd={enableScroll}
                  knobs={[
                    {
                      label: 'Rate',
                      value: chorusRate,
                      min: 0.1,
                      max: 10,
                      formatValue: v => `${v.toFixed(1)}Hz`,
                      onChange: v => chorusIdRef.current !== null && NativeAudioModule.setEffectParameter(channelId, chorusIdRef.current, 'rate', v),
                      onComplete: setChorusRate,
                    },
                    {
                      label: 'Depth',
                      value: chorusDepth,
                      min: 0,
                      max: 1,
                      formatValue: v => `${(v * 100).toFixed(0)}%`,
                      onChange: v => chorusIdRef.current !== null && NativeAudioModule.setEffectParameter(channelId, chorusIdRef.current, 'depth', v),
                      onComplete: setChorusDepth,
                    },
                    {
                      label: 'Mix',
                      value: chorusMix,
                      min: 0,
                      max: 1,
                      formatValue: v => `${(v * 100).toFixed(0)}%`,
                      onChange: v => chorusIdRef.current !== null && NativeAudioModule.setEffectParameter(channelId, chorusIdRef.current, 'mix', v),
                      onComplete: setChorusMix,
                    },
                  ]}
                />
              )}
            </View>

            {/* Distortion */}
            <View style={styles.effectSection}>
              <View style={styles.effectHeader}>
                <Text style={styles.effectTitle}>Distortion</Text>
                <Button
                  title={distortionEnabled ? 'ON' : 'OFF'}
                  onPress={toggleDistortion}
                  color={distortionEnabled ? '#4caf50' : '#757575'}
                />
              </View>
              {distortionEnabled && (
                <KnobPanel
                  color={color}
                  onDragStart={disableScroll}
                  onDragEnd={enableScroll}
                  knobs={[
                    {
                      label: 'Drive',
                      value: distortionDrive,
                      min: 1,
                      max: 100,
                      formatValue: v => v.toFixed(1),
                      onChange: v => distortionIdRef.current !== null && NativeAudioModule.setEffectParameter(channelId, distortionIdRef.current, 'drive', v),
                      onComplete: setDistortionDrive,
                    },
                    {
                      label: 'Mix',
                      value: distortionMix,
                      min: 0,
                      max: 1,
                      formatValue: v => `${(v * 100).toFixed(0)}%`,
                      onChange: v => distortionIdRef.current !== null && NativeAudioModule.setEffectParameter(channelId, distortionIdRef.current, 'mix', v),
                      onComplete: setDistortionMix,
                    },
                    {
                      label: 'Tone',
                      value: distortionTone,
                      min: 0,
                      max: 1,
                      formatValue: v => `${(v * 100).toFixed(0)}%`,
                      onChange: v => distortionIdRef.current !== null && NativeAudioModule.setEffectParameter(channelId, distortionIdRef.current, 'tone', v),
                      onComplete: setDistortionTone,
                    },
                  ]}
                />
              )}
            </View>

            {/* Compressor */}
            <View style={styles.effectSection}>
              <View style={styles.effectHeader}>
                <Text style={styles.effectTitle}>Compressor</Text>
                <Button
                  title={compressorEnabled ? 'ON' : 'OFF'}
                  onPress={toggleCompressor}
                  color={compressorEnabled ? '#4caf50' : '#757575'}
                />
              </View>
              {compressorEnabled && (
                <KnobPanel
                  color={color}
                  onDragStart={disableScroll}
                  onDragEnd={enableScroll}
                  knobs={[
                    {
                      label: 'Threshold',
                      value: compThreshold,
                      min: -60,
                      max: 0,
                      formatValue: v => `${v.toFixed(0)}dB`,
                      onChange: v => compressorIdRef.current !== null && NativeAudioModule.setEffectParameter(channelId, compressorIdRef.current, 'threshold', v),
                      onComplete: setCompThreshold,
                    },
                    {
                      label: 'Ratio',
                      value: compRatio,
                      min: 1,
                      max: 20,
                      formatValue: v => `${v.toFixed(1)}:1`,
                      onChange: v => compressorIdRef.current !== null && NativeAudioModule.setEffectParameter(channelId, compressorIdRef.current, 'ratio', v),
                      onComplete: setCompRatio,
                    },
                    {
                      label: 'Attack',
                      value: compAttack,
                      min: 0.1,
                      max: 100,
                      formatValue: v => `${v.toFixed(1)}ms`,
                      onChange: v => compressorIdRef.current !== null && NativeAudioModule.setEffectParameter(channelId, compressorIdRef.current, 'attack', v),
                      onComplete: setCompAttack,
                    },
                    {
                      label: 'Release',
                      value: compRelease,
                      min: 10,
                      max: 1000,
                      formatValue: v => `${v.toFixed(0)}ms`,
                      onChange: v => compressorIdRef.current !== null && NativeAudioModule.setEffectParameter(channelId, compressorIdRef.current, 'release', v),
                      onComplete: setCompRelease,
                    },
                  ]}
                />
              )}
            </View>
          </ScrollView>
        );
    }
  };

  return (
    <View style={[styles.container, { paddingTop: headerHeight }]}>
      <View style={styles.tabBar}>
        {(
          ['instrument', 'oscillators', 'filter', 'fx'] as TabType[]
        ).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[
              styles.tab,
              activeTab === tab && { borderBottomColor: color },
            ]}
            onPress={() => setActiveTab(tab)}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === tab && styles.activeTabText,
              ]}
            >
              {TAB_LABELS[tab]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.tabContentContainer}>{renderTabContent()}</View>

      <Player
        channel={channelId}
        color={color}
        gridNotes={gridNotes}
        rows={rows}
        cols={cols}
        gridSize={gridSize}
        useScale={useScale}
        scaleNotes={scaleNotes}
      />
    </View>
  );
};

function generateScale(
  rootNote: number,
  scaleType: ScaleType,
  count: number,
): number[] {
  const intervals = SCALES[scaleType];
  const notes: number[] = [];
  let octaveOffset = 0;
  for (let i = 0; i < count; i++) {
    const scaleIndex = i % intervals.length;
    if (i > 0 && scaleIndex === 0) octaveOffset += 12;
    notes.push(rootNote + intervals[scaleIndex] + octaveOffset);
  }
  return notes;
}

export default SynthScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  tab: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabText: {
    color: '#888',
    fontSize: 13,
    fontWeight: '600',
  },
  activeTabText: {
    color: '#ffffff',
  },
  tabContentContainer: {
    height: 150,
  },
  tabContent: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    gap: 12,
    flexWrap: 'wrap',
  },
  label: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '500',
  },
  buttonGroup: {
    flexDirection: 'row',
    gap: 8,
  },
  effectSection: {
    backgroundColor: '#1e1e1e',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  effectHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  effectTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  presetSection: {
    marginBottom: 12,
  },
  categoryBar: {
    flexGrow: 0,
    marginBottom: 8,
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#2a2a2a',
    marginRight: 8,
  },
  categoryChipText: {
    color: '#999',
    fontSize: 13,
    fontWeight: '600',
  },
  categoryChipTextActive: {
    color: '#fff',
  },
  presetList: {
    flexGrow: 0,
  },
  presetChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#1e1e1e',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#333',
  },
  presetChipText: {
    color: '#ccc',
    fontSize: 13,
  },
  presetChipTextActive: {
    color: '#fff',
  },
});
