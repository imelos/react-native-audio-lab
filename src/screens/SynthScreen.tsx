import React, { useState, useRef, useEffect, useCallback } from 'react';
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
  SYNTH_PRESETS,
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

// CHANNEL CONSTANTS - Define which channel to use

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
    if (i > 0 && scaleIndex === 0) {
      octaveOffset += 12;
    }
    notes.push(rootNote + intervals[scaleIndex] + octaveOffset);
  }

  return notes;
}

const SynthScreen: React.FC<Props<'synth'>> = ({ navigation, route }) => {
  const { channelId, color } = route?.params || { channelId: 1, color: '#6200ee' };
  const [activeTab, setActiveTab] = useState<TabType>('instrument');
  const [currentWaveform, setCurrentWaveform] = useState<Waveform>('sine');
  const [gridSize, setGridSize] = useState<GridSize>('5x5');
  const [selectedKey, setSelectedKey] = useState<Key>('C');
  const [scaleType, setScaleType] = useState<ScaleType>('Major');
  const [useScale, setUseScale] = useState(true);
  const [octaveShift, setOctaveShift] = useState(0);

  // Preset state
  const [selectedCategory, setSelectedCategory] =
    useState<PresetCategory>('Keys');
  const [activePresetName, setActivePresetName] = useState<string | null>(null);

  const handlePresetSelect = useCallback(
    (preset: SynthPreset) => {
      const { reverbId, delayId, filterId } = applyPreset(channelId, preset);
      setActivePresetName(preset.name);
      setCurrentWaveform(preset.waveform1);
      // Store native effect IDs returned by applyPreset
      reverbEffectIdRef.current = reverbId;
      delayEffectIdRef.current = delayId;
      filterEffectIdRef.current = filterId;
      // Sync FX toggle state and slider values from preset
      setReverbEnabled(reverbId !== null);
      setDelayEnabled(delayId !== null);
      setFilterEnabled(filterId !== null);
      if (preset.effects) {
        for (const effect of preset.effects) {
          if (effect.type === 'reverb') {
            if (effect.params.roomSize != null)
              setReverbRoomSize(effect.params.roomSize);
            if (effect.params.wetLevel != null)
              setReverbWetLevel(effect.params.wetLevel);
          }
          if (effect.type === 'delay') {
            if (effect.params.delayTime != null)
              setDelayTime(effect.params.delayTime);
            if (effect.params.feedback != null)
              setDelayFeedback(effect.params.feedback);
            if (effect.params.wetLevel != null)
              setDelayWetLevel(effect.params.wetLevel);
          }
        }
      }
    },
    [channelId],
  );

  // Filter state
  const [filterEnabled, setFilterEnabled] = useState(false);
  const filterEffectIdRef = useRef<number | null>(null);
  const [filterType, setFilterType] = useState<FilterType>('LowPass');
  const [filterCutoff, setFilterCutoff] = useState(1000); // 20 - 20000 Hz
  const [filterResonance, setFilterResonance] = useState(0.7); // 0.1 - 10

  // Reverb state
  const [reverbEnabled, setReverbEnabled] = useState(false);
  const reverbEffectIdRef = useRef<number | null>(null);
  const [reverbRoomSize, setReverbRoomSize] = useState(0.5); // 0 - 1
  const [reverbWetLevel, setReverbWetLevel] = useState(0.33); // 0 - 1

  // Delay state
  const [delayEnabled, setDelayEnabled] = useState(false);
  const delayEffectIdRef = useRef<number | null>(null);
  const [delayTime, setDelayTime] = useState(500); // 1 - 2000 ms
  const [delayFeedback, setDelayFeedback] = useState(0.4); // 0 - 0.95
  const [delayWetLevel, setDelayWetLevel] = useState(0.5); // 0 - 1

  const { rows, cols } = GRID_CONFIGS[gridSize];
  const totalPads = rows * cols;

  const baseOctave = 3;
  const keyOffset = KEYS.indexOf(selectedKey);
  const rootNote = 12 * (baseOctave + 1) + keyOffset + octaveShift * 12;

  const gridNotes = useScale
    ? generateScale(rootNote, scaleType, totalPads)
    : Array.from({ length: totalPads }, (_, i) => rootNote + i);

  const scaleNotes = new Set(generateScale(rootNote, scaleType, 88));

  const headerHeight = useHeaderHeight();

  // Initialize audio engine on mount
  useEffect(() => {
    // Create main instrument on channel
    NativeAudioModule.createOscillatorInstrument(
      channelId,
      'Main Synth',
      16,
      'sine',
    );

    // Set initial ADSR
    NativeAudioModule.setADSR(channelId, 0.01, 0.1, 0.8, 0.3);

    return () => {
      // Cleanup: stop all notes and remove instruments
      NativeAudioModule.allNotesOff(channelId);
    };
  }, [channelId]);

  // Toggle Filter
  const toggleFilter = () => {
    if (!filterEnabled) {
      const effectId = NativeAudioModule.addEffect(channelId, 'filter');
      filterEffectIdRef.current = effectId;
      NativeAudioModule.setEffectParameter(
        channelId,
        effectId,
        'cutoff',
        filterCutoff,
      );
      NativeAudioModule.setEffectParameter(
        channelId,
        effectId,
        'resonance',
        filterResonance,
      );
      NativeAudioModule.setEffectParameter(
        channelId,
        effectId,
        'type',
        FILTER_TYPES.indexOf(filterType),
      );

      setFilterEnabled(true);
    } else {
      if (filterEffectIdRef.current !== null) {
        NativeAudioModule.removeEffect(channelId, filterEffectIdRef.current);
      }
      setFilterEnabled(false);
      filterEffectIdRef.current = null;
    }
  };

  // Update filter parameters
  useEffect(() => {
    if (filterEnabled && filterEffectIdRef.current !== null) {
      NativeAudioModule.setEffectParameter(
        channelId,
        filterEffectIdRef.current,
        'cutoff',
        filterCutoff,
      );
    }
  }, [filterCutoff, filterEnabled]);

  useEffect(() => {
    if (filterEnabled && filterEffectIdRef.current !== null) {
      NativeAudioModule.setEffectParameter(
        channelId,
        filterEffectIdRef.current,
        'resonance',
        filterResonance,
      );
    }
  }, [filterResonance, filterEnabled]);

  useEffect(() => {
    if (filterEnabled && filterEffectIdRef.current !== null) {
      const typeIndex = FILTER_TYPES.indexOf(filterType);
      NativeAudioModule.setEffectParameter(
        channelId,
        filterEffectIdRef.current,
        'type',
        typeIndex,
      );
    }
  }, [filterType, filterEnabled]);

  // Toggle Reverb
  const toggleReverb = () => {
    if (!reverbEnabled) {
      const effectId = NativeAudioModule.addEffect(channelId, 'reverb');
      reverbEffectIdRef.current = effectId;

      NativeAudioModule.setEffectParameter(
        channelId,
        effectId,
        'roomSize',
        reverbRoomSize,
      );
      NativeAudioModule.setEffectParameter(
        channelId,
        effectId,
        'wetLevel',
        reverbWetLevel,
      );

      setReverbEnabled(true);
    } else {
      if (reverbEffectIdRef.current !== null) {
        NativeAudioModule.removeEffect(channelId, reverbEffectIdRef.current);
      }
      setReverbEnabled(false);
      reverbEffectIdRef.current = null;
    }
  };

  // Update reverb parameters
  useEffect(() => {
    if (reverbEnabled && reverbEffectIdRef.current !== null) {
      NativeAudioModule.setEffectParameter(
        channelId,
        reverbEffectIdRef.current,
        'roomSize',
        reverbRoomSize,
      );
    }
  }, [reverbRoomSize, reverbEnabled]);

  useEffect(() => {
    if (reverbEnabled && reverbEffectIdRef.current !== null) {
      NativeAudioModule.setEffectParameter(
        channelId,
        reverbEffectIdRef.current,
        'wetLevel',
        reverbWetLevel,
      );
    }
  }, [reverbWetLevel, reverbEnabled]);

  // Toggle Delay
  const toggleDelay = () => {
    if (!delayEnabled) {
      const effectId = NativeAudioModule.addEffect(channelId, 'delay');
      delayEffectIdRef.current = effectId;

      NativeAudioModule.setEffectParameter(
        channelId,
        effectId,
        'delayTime',
        delayTime,
      );
      NativeAudioModule.setEffectParameter(
        channelId,
        effectId,
        'feedback',
        delayFeedback,
      );
      NativeAudioModule.setEffectParameter(
        channelId,
        effectId,
        'wetLevel',
        delayWetLevel,
      );

      setDelayEnabled(true);
    } else {
      if (delayEffectIdRef.current !== null) {
        NativeAudioModule.removeEffect(channelId, delayEffectIdRef.current);
      }
      setDelayEnabled(false);
      delayEffectIdRef.current = null;
    }
  };

  // Update delay parameters
  useEffect(() => {
    if (delayEnabled && delayEffectIdRef.current !== null) {
      NativeAudioModule.setEffectParameter(
        channelId,
        delayEffectIdRef.current,
        'delayTime',
        delayTime,
      );
    }
  }, [delayTime, delayEnabled]);

  useEffect(() => {
    if (delayEnabled && delayEffectIdRef.current !== null) {
      NativeAudioModule.setEffectParameter(
        channelId,
        delayEffectIdRef.current,
        'feedback',
        delayFeedback,
      );
    }
  }, [delayFeedback, delayEnabled]);

  useEffect(() => {
    if (delayEnabled && delayEffectIdRef.current !== null) {
      NativeAudioModule.setEffectParameter(
        channelId,
        delayEffectIdRef.current,
        'wetLevel',
        delayWetLevel,
      );
    }
  }, [delayWetLevel, delayEnabled]);

  const changeFilterType = () => {
    const currentIndex = FILTER_TYPES.indexOf(filterType);
    const nextIndex = (currentIndex + 1) % FILTER_TYPES.length;
    setFilterType(FILTER_TYPES[nextIndex]);
  };

  const changeWaveform = () => {
    const currentIndex = WAVEFORMS.indexOf(currentWaveform);
    const nextIndex = (currentIndex + 1) % WAVEFORMS.length;
    const nextWave = WAVEFORMS[nextIndex];

    setCurrentWaveform(nextWave);
    setActivePresetName(null); // Mark as custom
    NativeAudioModule.setWaveform(channelId, nextWave);
  };

  const changeGridSize = () => {
    const sizes: GridSize[] = ['4x4', '5x5', '6x6', '8x8'];
    const currentIndex = sizes.indexOf(gridSize);
    const nextIndex = (currentIndex + 1) % sizes.length;
    setGridSize(sizes[nextIndex]);
  };

  const changeKey = () => {
    const currentIndex = KEYS.indexOf(selectedKey);
    const nextIndex = (currentIndex + 1) % KEYS.length;
    setSelectedKey(KEYS[nextIndex]);
  };

  const toggleScale = () => {
    setScaleType(current => (current === 'Major' ? 'Minor' : 'Major'));
  };

  const toggleScaleMode = () => {
    setUseScale(current => !current);
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'instrument':
        return (
          <ScrollView
            style={styles.tabContent}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled={true}
          >
            <View style={styles.controlRow}>
              <Text style={styles.label}>Key: {selectedKey}</Text>
              <Button title="Change Key" onPress={changeKey} color={color} />
            </View>

            <View style={styles.controlRow}>
              <Text style={styles.label}>Scale: {scaleType}</Text>
              <Button
                title="Major/Minor"
                onPress={toggleScale}
                color={color}
              />
            </View>

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

            <View style={styles.controlRow}>
              <Text style={styles.label}>
                Mode: {useScale ? 'Scale' : 'Chromatic'}
              </Text>
              <Button
                title="Toggle Mode"
                onPress={toggleScaleMode}
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

            <View style={styles.controlRow}>
              <Text style={styles.label}>Waveform: {currentWaveform}</Text>
              <Button
                title="Change Wave"
                onPress={changeWaveform}
                color={color}
              />
            </View>

            {/* Preset Picker */}
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
                      activePresetName === item.name && { borderColor: color, backgroundColor: color + '26' },
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
          </ScrollView>
        );

      case 'filter':
        return (
          <ScrollView
            style={styles.tabContent}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled={true}
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
                    onValueChange={setFilterCutoff}
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
                    onValueChange={setFilterResonance}
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
            nestedScrollEnabled={true}
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
                      onValueChange={setReverbRoomSize}
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
                      onValueChange={setReverbWetLevel}
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
                      onValueChange={setDelayTime}
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
                      onValueChange={setDelayFeedback}
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
                      onValueChange={setDelayWetLevel}
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
        <TouchableOpacity
          style={[styles.tab, activeTab === 'instrument' && { borderBottomColor: color }]}
          onPress={() => setActiveTab('instrument')}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'instrument' && styles.activeTabText,
            ]}
          >
            Instrument
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'filter' && { borderBottomColor: color }]}
          onPress={() => setActiveTab('filter')}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'filter' && styles.activeTabText,
            ]}
          >
            Filter
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'fx' && { borderBottomColor: color }]}
          onPress={() => setActiveTab('fx')}
        >
          <Text
            style={[styles.tabText, activeTab === 'fx' && styles.activeTabText]}
          >
            FX
          </Text>
        </TouchableOpacity>
      </View>

      {/* Tab Content */}
      <View style={styles.tabContentContainer}>{renderTabContent()}</View>

      {/* Player: MidiVisualizer + Grid + Recording/Playback */}
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

export default SynthScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  title: {
    fontSize: 36,
    color: '#ffffff',
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 16,
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
  activeTab: {},
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
  categoryChipActive: {},
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
  presetChipActive: {},
  presetChipText: {
    color: '#ccc',
    fontSize: 13,
  },
  presetChipTextActive: {
    color: '#fff',
  },
});
