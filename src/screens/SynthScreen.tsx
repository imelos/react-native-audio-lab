import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Text,
  Button,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import NativeAudioModule from '../specs/NativeAudioModule';
import Slider from '@react-native-community/slider';
import Player from '../features/music-pad/Player';
import { Props } from '../navigation/Navigation';

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
  const { channelId } = route?.params || { channelId: 1 };
  const [activeTab, setActiveTab] = useState<TabType>('instrument');
  const [currentWaveform, setCurrentWaveform] = useState<Waveform>('sine');
  const [gridSize, setGridSize] = useState<GridSize>('5x5');
  const [selectedKey, setSelectedKey] = useState<Key>('C');
  const [scaleType, setScaleType] = useState<ScaleType>('Major');
  const [useScale, setUseScale] = useState(true);
  const [octaveShift, setOctaveShift] = useState(0);

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

  // Effect ID counter to ensure unique IDs
  const nextEffectIdRef = useRef(1);

  const { rows, cols } = GRID_CONFIGS[gridSize];
  const totalPads = rows * cols;

  const baseOctave = 3;
  const keyOffset = KEYS.indexOf(selectedKey);
  const rootNote = 12 * (baseOctave + 1) + keyOffset + octaveShift * 12;

  const gridNotes = useScale
    ? generateScale(rootNote, scaleType, totalPads)
    : Array.from({ length: totalPads }, (_, i) => rootNote + i);

  const scaleNotes = new Set(generateScale(rootNote, scaleType, 88));

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
      NativeAudioModule.addEffect(channelId, 'filter');
      const effectId = nextEffectIdRef.current++;
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
      NativeAudioModule.addEffect(channelId, 'reverb');
      const effectId = nextEffectIdRef.current++;
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
      NativeAudioModule.addEffect(channelId, 'delay');
      const effectId = nextEffectIdRef.current++;
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
              <Button title="Change Key" onPress={changeKey} color="#6200ee" />
            </View>

            <View style={styles.controlRow}>
              <Text style={styles.label}>Scale: {scaleType}</Text>
              <Button
                title="Major/Minor"
                onPress={toggleScale}
                color="#6200ee"
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
                  color="#6200ee"
                />
                <Button
                  title="+12st"
                  onPress={() => setOctaveShift(o => Math.min(o + 1, 3))}
                  color="#6200ee"
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
                color="#6200ee"
              />
            </View>

            <View style={styles.controlRow}>
              <Text style={styles.label}>Grid: {gridSize}</Text>
              <Button
                title="Change Grid"
                onPress={changeGridSize}
                color="#6200ee"
              />
            </View>

            <View style={styles.controlRow}>
              <Text style={styles.label}>Waveform: {currentWaveform}</Text>
              <Button
                title="Change Wave"
                onPress={changeWaveform}
                color="#6200ee"
              />
            </View>

            <View style={styles.controlRow}>
              <Text style={styles.label}>Presets:</Text>
              <View style={styles.buttonGroup}>
                <Button
                  title="Pluck"
                  onPress={() =>
                    NativeAudioModule.setADSR(channelId, 0.005, 0.1, 0.0, 0.2)
                  }
                />
                <Button
                  title="Pad"
                  onPress={() =>
                    NativeAudioModule.setADSR(channelId, 0.3, 1.5, 0.7, 2.0)
                  }
                />
                <Button
                  title="Organ"
                  onPress={() =>
                    NativeAudioModule.setADSR(channelId, 0.01, 0.05, 1.0, 0.4)
                  }
                />
              </View>
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
                    color="#6200ee"
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
                    minimumTrackTintColor="#6200ee"
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
                    minimumTrackTintColor="#6200ee"
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
                      minimumTrackTintColor="#6200ee"
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
                      minimumTrackTintColor="#6200ee"
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
                      minimumTrackTintColor="#6200ee"
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
                      minimumTrackTintColor="#6200ee"
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
                      minimumTrackTintColor="#6200ee"
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
    <View style={styles.container}>
      <View style={styles.contentContainer}>
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'instrument' && styles.activeTab]}
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
            style={[styles.tab, activeTab === 'filter' && styles.activeTab]}
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
            style={[styles.tab, activeTab === 'fx' && styles.activeTab]}
            onPress={() => setActiveTab('fx')}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === 'fx' && styles.activeTabText,
              ]}
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
          gridNotes={gridNotes}
          rows={rows}
          cols={cols}
          gridSize={gridSize}
          useScale={useScale}
          scaleNotes={scaleNotes}
        />
      </View>
    </View>
  );
};

export default SynthScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  contentContainer: {
    flex: 1,
    paddingTop: 60,
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
  activeTab: {
    borderBottomColor: '#6200ee',
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
});
