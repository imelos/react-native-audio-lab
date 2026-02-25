import React from 'react';
import {
  View,
  Text,
  Button,
  TouchableOpacity,
  ScrollView,
  FlatList,
  StyleSheet,
} from 'react-native';
import {
  PRESET_CATEGORIES,
  getPresetsByCategory,
  type PresetCategory,
  type SynthPreset,
} from '../../../data/synthPresets';
import { type Key, type ScaleType, type GridSize } from '../types';

interface Props {
  color: string;
  scrollEnabled: boolean;
  octaveShift: number;
  setOctaveShift: React.Dispatch<React.SetStateAction<number>>;
  selectedKey: Key;
  changeKey: () => void;
  scaleType: ScaleType;
  setScaleType: React.Dispatch<React.SetStateAction<ScaleType>>;
  useScale: boolean;
  setUseScale: React.Dispatch<React.SetStateAction<boolean>>;
  gridSize: GridSize;
  changeGridSize: () => void;
  selectedCategory: PresetCategory;
  setSelectedCategory: (cat: PresetCategory) => void;
  activePresetName: string | null;
  handlePresetSelect: (preset: SynthPreset) => void;
}

export const InstrumentTab: React.FC<Props> = ({
  color,
  scrollEnabled,
  octaveShift,
  setOctaveShift,
  selectedKey,
  changeKey,
  scaleType,
  setScaleType,
  useScale,
  setUseScale,
  gridSize,
  changeGridSize,
  selectedCategory,
  setSelectedCategory,
  activePresetName,
  handlePresetSelect,
}) => (
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
                selectedCategory === cat && styles.categoryChipTextActive,
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
                activePresetName === item.name && styles.presetChipTextActive,
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
        onPress={() => setScaleType(s => (s === 'Major' ? 'Minor' : 'Major'))}
        color={color}
      />
    </View>
    <View style={styles.controlRow}>
      <Text style={styles.label}>Mode: {useScale ? 'Scale' : 'Chromatic'}</Text>
      <Button title="Toggle Mode" onPress={() => setUseScale(v => !v)} color={color} />
    </View>
    <View style={styles.controlRow}>
      <Text style={styles.label}>Grid: {gridSize}</Text>
      <Button title="Change Grid" onPress={changeGridSize} color={color} />
    </View>
  </ScrollView>
);

const styles = StyleSheet.create({
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
