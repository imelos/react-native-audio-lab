import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { SynthChannelHandle } from './useSynthChannel';
import { InstrumentTab } from './tabs/InstrumentTab';
import { OscillatorsTab } from './tabs/OscillatorsTab';
import { FilterTab } from './tabs/FilterTab';
import { FxTab } from './tabs/FxTab';
import type { Key, ScaleType, GridSize } from './types';

type TabType = 'instrument' | 'oscillators' | 'filter' | 'fx';

const TAB_LABELS: Record<TabType, string> = {
  instrument: 'Instrument',
  oscillators: 'Oscillators',
  filter: 'Filter',
  fx: 'FX',
};

const TABS = ['instrument', 'oscillators', 'filter', 'fx'] as TabType[];

interface Props {
  channel: SynthChannelHandle;
  color: string;
  scrollEnabled: boolean;
  disableScroll: () => void;
  enableScroll: () => void;
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
}

export const SynthTabs: React.FC<Props> = ({
  channel,
  color,
  scrollEnabled,
  disableScroll,
  enableScroll,
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
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('instrument');

  const renderContent = () => {
    switch (activeTab) {
      case 'instrument':
        return (
          <InstrumentTab
            color={color}
            scrollEnabled={scrollEnabled}
            octaveShift={octaveShift}
            setOctaveShift={setOctaveShift}
            selectedKey={selectedKey}
            changeKey={changeKey}
            scaleType={scaleType}
            setScaleType={setScaleType}
            useScale={useScale}
            setUseScale={setUseScale}
            gridSize={gridSize}
            changeGridSize={changeGridSize}
            selectedCategory={channel.selectedCategory}
            setSelectedCategory={channel.setSelectedCategory}
            activePresetName={channel.activePresetName}
            handlePresetSelect={channel.handlePresetSelect}
          />
        );
      case 'oscillators':
        return (
          <OscillatorsTab
            channel={channel}
            color={color}
            scrollEnabled={scrollEnabled}
            disableScroll={disableScroll}
            enableScroll={enableScroll}
          />
        );
      case 'filter':
        return (
          <FilterTab
            channel={channel}
            color={color}
            scrollEnabled={scrollEnabled}
            disableScroll={disableScroll}
            enableScroll={enableScroll}
          />
        );
      case 'fx':
        return (
          <FxTab
            channel={channel}
            color={color}
            scrollEnabled={scrollEnabled}
            disableScroll={disableScroll}
            enableScroll={enableScroll}
          />
        );
    }
  };

  return (
    <>
      <View style={styles.tabBar}>
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && { borderBottomColor: color }]}
            onPress={() => setActiveTab(tab)}
          >
            <Text
              style={[styles.tabText, activeTab === tab && styles.activeTabText]}
            >
              {TAB_LABELS[tab]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.tabContentContainer}>{renderContent()}</View>
    </>
  );
};

const styles = StyleSheet.create({
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
});
