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
import Slider from '@react-native-community/slider';
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

type TabType = 'instrument' | 'filter' | 'fx';

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

  // ── Chain filter state (user-controlled, never touched by presets) ───
  const [filterEnabled, setFilterEnabled] = useState(false);
  const [filterType, setFilterType] = useState<FilterType>('LowPass');
  const [filterCutoff, setFilterCutoff] = useState(1000);
  const [filterResonance, setFilterResonance] = useState(0.7);

  // ── Reverb state ─────────────────────────────────────────────────────
  const [reverbEnabled, setReverbEnabled] = useState(false);
  const [reverbRoomSize, setReverbRoomSize] = useState(0.5);
  const [reverbWetLevel, setReverbWetLevel] = useState(0.33);

  // ── Delay state ──────────────────────────────────────────────────────
  const [delayEnabled, setDelayEnabled] = useState(false);
  const [delayTime, setDelayTime] = useState(500);
  const [delayFeedback, setDelayFeedback] = useState(0.4);
  const [delayWetLevel, setDelayWetLevel] = useState(0.5);

  // ── Permanent effect IDs (set once on mount, never change) ───────────
  // Refs so callbacks always read the current ID with no stale closures
  // and without triggering re-renders.
  const filterIdRef = useRef<number | null>(null);
  const reverbIdRef = useRef<number | null>(null);
  const delayIdRef = useRef<number | null>(null);

  // ── Mount: create instrument + all three effects (disabled) ──────────
  useEffect(() => {
    NativeAudioModule.createOscillatorInstrument(
      channelId,
      'Main Synth',
      16,
      'sine',
    );
    NativeAudioModule.setADSR(channelId, 0.01, 0.1, 0.8, 0.3);

    // Chain filter — disabled, params match initial state above
    const fId = NativeAudioModule.addEffect(channelId, 'filter');
    if (fId >= 0) {
      NativeAudioModule.setEffectEnabled(channelId, fId, false);
      NativeAudioModule.setEffectParameter(channelId, fId, 'cutoff', 1000);
      NativeAudioModule.setEffectParameter(channelId, fId, 'resonance', 0.7);
      NativeAudioModule.setEffectParameter(channelId, fId, 'type', 0); // LowPass
      filterIdRef.current = fId;
    }

    // Reverb — disabled
    const rId = NativeAudioModule.addEffect(channelId, 'reverb');
    if (rId >= 0) {
      NativeAudioModule.setEffectEnabled(channelId, rId, false);
      NativeAudioModule.setEffectParameter(channelId, rId, 'roomSize', 0.5);
      NativeAudioModule.setEffectParameter(channelId, rId, 'wetLevel', 0.33);
      reverbIdRef.current = rId;
    }

    // Delay — disabled
    const dId = NativeAudioModule.addEffect(channelId, 'delay');
    if (dId >= 0) {
      NativeAudioModule.setEffectEnabled(channelId, dId, false);
      NativeAudioModule.setEffectParameter(channelId, dId, 'delayTime', 500);
      NativeAudioModule.setEffectParameter(channelId, dId, 'feedback', 0.4);
      NativeAudioModule.setEffectParameter(channelId, dId, 'wetLevel', 0.5);
      delayIdRef.current = dId;
    }

    return () => {
      NativeAudioModule.allNotesOff(channelId);
    };
  }, [channelId]);

  // ── Preset selection ─────────────────────────────────────────────────
  // Applies voice params + updates reverb/delay. Chain filter is untouched.
  const handlePresetSelect = useCallback(
    (preset: SynthPreset) => {
      applyPreset(channelId, preset);
      setActivePresetName(preset.name);
      setCurrentWaveform(preset.waveform1);

      const reverbEffect =
        preset.effects?.find(e => e.type === 'reverb') ?? null;
      const delayEffect = preset.effects?.find(e => e.type === 'delay') ?? null;

      // Reverb
      const hasReverb = reverbEffect !== null;
      if (reverbIdRef.current !== null) {
        NativeAudioModule.setEffectEnabled(
          channelId,
          reverbIdRef.current,
          hasReverb,
        );
        if (hasReverb) {
          const roomSize = reverbEffect!.params.roomSize ?? reverbRoomSize;
          const wetLevel = reverbEffect!.params.wetLevel ?? reverbWetLevel;
          NativeAudioModule.setEffectParameter(
            channelId,
            reverbIdRef.current,
            'roomSize',
            roomSize,
          );
          NativeAudioModule.setEffectParameter(
            channelId,
            reverbIdRef.current,
            'wetLevel',
            wetLevel,
          );
          setReverbRoomSize(roomSize);
          setReverbWetLevel(wetLevel);
        }
      }
      setReverbEnabled(hasReverb);

      // Delay
      const hasDelay = delayEffect !== null;
      if (delayIdRef.current !== null) {
        NativeAudioModule.setEffectEnabled(
          channelId,
          delayIdRef.current,
          hasDelay,
        );
        if (hasDelay) {
          const dt = delayEffect!.params.delayTime ?? delayTime;
          const fb = delayEffect!.params.feedback ?? delayFeedback;
          const wl = delayEffect!.params.wetLevel ?? delayWetLevel;
          NativeAudioModule.setEffectParameter(
            channelId,
            delayIdRef.current,
            'delayTime',
            dt,
          );
          NativeAudioModule.setEffectParameter(
            channelId,
            delayIdRef.current,
            'feedback',
            fb,
          );
          NativeAudioModule.setEffectParameter(
            channelId,
            delayIdRef.current,
            'wetLevel',
            wl,
          );
          setDelayTime(dt);
          setDelayFeedback(fb);
          setDelayWetLevel(wl);
        }
      }
      setDelayEnabled(hasDelay);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [channelId],
    // reverbRoomSize / delayTime etc. are used only as fallbacks when the preset
    // doesn't supply a value — stale closure is acceptable there. Effect IDs
    // are read from refs (always current). State setters are stable.
  );

  // ── Chain filter toggle ───────────────────────────────────────────────
  const toggleFilter = () => {
    const id = filterIdRef.current;
    if (id === null || id < 0) return;
    const newEnabled = !filterEnabled;
    NativeAudioModule.setEffectEnabled(channelId, id, newEnabled);
    if (newEnabled) {
      // Sync current UI values to native on enable
      NativeAudioModule.setEffectParameter(
        channelId,
        id,
        'cutoff',
        filterCutoff,
      );
      NativeAudioModule.setEffectParameter(
        channelId,
        id,
        'resonance',
        filterResonance,
      );
      NativeAudioModule.setEffectParameter(
        channelId,
        id,
        'type',
        FILTER_TYPES.indexOf(filterType),
      );
    }
    setFilterEnabled(newEnabled);
  };

  const changeFilterType = () => {
    const nextIndex =
      (FILTER_TYPES.indexOf(filterType) + 1) % FILTER_TYPES.length;
    setFilterType(FILTER_TYPES[nextIndex]);
    const id = filterIdRef.current;
    if (filterEnabled && id !== null) {
      NativeAudioModule.setEffectParameter(channelId, id, 'type', nextIndex);
    }
  };

  // ── Reverb toggle ─────────────────────────────────────────────────────
  const toggleReverb = () => {
    const id = reverbIdRef.current;
    if (id === null || id < 0) return;
    const newEnabled = !reverbEnabled;
    NativeAudioModule.setEffectEnabled(channelId, id, newEnabled);
    if (newEnabled) {
      NativeAudioModule.setEffectParameter(
        channelId,
        id,
        'roomSize',
        reverbRoomSize,
      );
      NativeAudioModule.setEffectParameter(
        channelId,
        id,
        'wetLevel',
        reverbWetLevel,
      );
    }
    setReverbEnabled(newEnabled);
  };

  // ── Delay toggle ──────────────────────────────────────────────────────
  const toggleDelay = () => {
    const id = delayIdRef.current;
    if (id === null || id < 0) return;
    const newEnabled = !delayEnabled;
    NativeAudioModule.setEffectEnabled(channelId, id, newEnabled);
    if (newEnabled) {
      NativeAudioModule.setEffectParameter(
        channelId,
        id,
        'delayTime',
        delayTime,
      );
      NativeAudioModule.setEffectParameter(
        channelId,
        id,
        'feedback',
        delayFeedback,
      );
      NativeAudioModule.setEffectParameter(
        channelId,
        id,
        'wetLevel',
        delayWetLevel,
      );
    }
    setDelayEnabled(newEnabled);
  };

  // ── Waveform / grid / key helpers ─────────────────────────────────────
  const changeWaveform = () => {
    const next =
      WAVEFORMS[(WAVEFORMS.indexOf(currentWaveform) + 1) % WAVEFORMS.length];
    setCurrentWaveform(next);
    setActivePresetName(null);
    NativeAudioModule.setWaveform(channelId, next);
  };

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

  // ── Tab content ───────────────────────────────────────────────────────
  const renderTabContent = () => {
    switch (activeTab) {
      case 'instrument':
        return (
          <ScrollView
            style={styles.tabContent}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
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
              <Text style={styles.label}>Waveform: {currentWaveform}</Text>
              <Button
                title="Change Wave"
                onPress={changeWaveform}
                color={color}
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

      case 'filter':
        return (
          <ScrollView
            style={styles.tabContent}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
          >
            <View style={styles.effectHeader}>
              <Text style={styles.effectTitle}>Filter</Text>
              <Button
                title={filterEnabled ? 'ON' : 'OFF'}
                onPress={toggleFilter}
                color={filterEnabled ? '#4caf50' : '#757575'}
              />
            </View>
            {filterEnabled && (
              <>
                <View style={styles.controlRow}>
                  <Text style={styles.label}>Type: {filterType}</Text>
                  <Button
                    title="Change Type"
                    onPress={changeFilterType}
                    color={color}
                  />
                </View>
                <View style={styles.sliderContainer}>
                  <Text style={styles.sliderLabel}>
                    Cutoff: {Math.round(filterCutoff)} Hz
                  </Text>
                  <Slider
                    style={styles.slider}
                    minimumValue={20}
                    maximumValue={20000}
                    value={filterCutoff}
                    onValueChange={v => {
                      setFilterCutoff(v);
                      if (filterIdRef.current !== null) {
                        NativeAudioModule.setEffectParameter(
                          channelId,
                          filterIdRef.current,
                          'cutoff',
                          v,
                        );
                      }
                    }}
                    minimumTrackTintColor={color}
                    maximumTrackTintColor="#444"
                  />
                </View>
                <View style={styles.sliderContainer}>
                  <Text style={styles.sliderLabel}>
                    Resonance: {filterResonance.toFixed(2)}
                  </Text>
                  <Slider
                    style={styles.slider}
                    minimumValue={0.1}
                    maximumValue={10}
                    value={filterResonance}
                    onValueChange={v => {
                      setFilterResonance(v);
                      if (filterIdRef.current !== null) {
                        NativeAudioModule.setEffectParameter(
                          channelId,
                          filterIdRef.current,
                          'resonance',
                          v,
                        );
                      }
                    }}
                    minimumTrackTintColor={color}
                    maximumTrackTintColor="#444"
                  />
                </View>
              </>
            )}
          </ScrollView>
        );

      case 'fx':
        return (
          <ScrollView
            style={styles.tabContent}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
          >
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
                <>
                  <View style={styles.sliderContainer}>
                    <Text style={styles.sliderLabel}>
                      Room Size: {(reverbRoomSize * 100).toFixed(0)}%
                    </Text>
                    <Slider
                      style={styles.slider}
                      minimumValue={0}
                      maximumValue={1}
                      value={reverbRoomSize}
                      onValueChange={v => {
                        setReverbRoomSize(v);
                        if (reverbIdRef.current !== null) {
                          NativeAudioModule.setEffectParameter(
                            channelId,
                            reverbIdRef.current,
                            'roomSize',
                            v,
                          );
                        }
                      }}
                      minimumTrackTintColor={color}
                      maximumTrackTintColor="#444"
                    />
                  </View>
                  <View style={styles.sliderContainer}>
                    <Text style={styles.sliderLabel}>
                      Wet: {(reverbWetLevel * 100).toFixed(0)}%
                    </Text>
                    <Slider
                      style={styles.slider}
                      minimumValue={0}
                      maximumValue={1}
                      value={reverbWetLevel}
                      onValueChange={v => {
                        setReverbWetLevel(v);
                        if (reverbIdRef.current !== null) {
                          NativeAudioModule.setEffectParameter(
                            channelId,
                            reverbIdRef.current,
                            'wetLevel',
                            v,
                          );
                        }
                      }}
                      minimumTrackTintColor={color}
                      maximumTrackTintColor="#444"
                    />
                  </View>
                </>
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
                <>
                  <View style={styles.sliderContainer}>
                    <Text style={styles.sliderLabel}>
                      Delay Time: {Math.round(delayTime)} ms
                    </Text>
                    <Slider
                      style={styles.slider}
                      minimumValue={1}
                      maximumValue={2000}
                      value={delayTime}
                      onValueChange={v => {
                        setDelayTime(v);
                        if (delayIdRef.current !== null) {
                          NativeAudioModule.setEffectParameter(
                            channelId,
                            delayIdRef.current,
                            'delayTime',
                            v,
                          );
                        }
                      }}
                      minimumTrackTintColor={color}
                      maximumTrackTintColor="#444"
                    />
                  </View>
                  <View style={styles.sliderContainer}>
                    <Text style={styles.sliderLabel}>
                      Feedback: {(delayFeedback * 100).toFixed(0)}%
                    </Text>
                    <Slider
                      style={styles.slider}
                      minimumValue={0}
                      maximumValue={0.95}
                      value={delayFeedback}
                      onValueChange={v => {
                        setDelayFeedback(v);
                        if (delayIdRef.current !== null) {
                          NativeAudioModule.setEffectParameter(
                            channelId,
                            delayIdRef.current,
                            'feedback',
                            v,
                          );
                        }
                      }}
                      minimumTrackTintColor={color}
                      maximumTrackTintColor="#444"
                    />
                  </View>
                  <View style={styles.sliderContainer}>
                    <Text style={styles.sliderLabel}>
                      Wet: {(delayWetLevel * 100).toFixed(0)}%
                    </Text>
                    <Slider
                      style={styles.slider}
                      minimumValue={0}
                      maximumValue={1}
                      value={delayWetLevel}
                      onValueChange={v => {
                        setDelayWetLevel(v);
                        if (delayIdRef.current !== null) {
                          NativeAudioModule.setEffectParameter(
                            channelId,
                            delayIdRef.current,
                            'wetLevel',
                            v,
                          );
                        }
                      }}
                      minimumTrackTintColor={color}
                      maximumTrackTintColor="#444"
                    />
                  </View>
                </>
              )}
            </View>
          </ScrollView>
        );
    }
  };

  return (
    <View style={[styles.container, { paddingTop: headerHeight }]}>
      <View style={styles.tabBar}>
        {(['instrument', 'filter', 'fx'] as TabType[]).map(tab => (
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
              {tab === 'instrument'
                ? 'Instrument'
                : tab === 'filter'
                ? 'Filter'
                : 'FX'}
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
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabText: {
    color: '#888',
    fontSize: 16,
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
  sliderContainer: {
    marginBottom: 12,
  },
  sliderLabel: {
    color: '#ffffff',
    fontSize: 14,
    marginBottom: 4,
  },
  slider: {
    width: '100%',
    height: 40,
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
