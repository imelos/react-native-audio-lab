import React, { useState, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { useHeaderHeight } from '@react-navigation/elements';
import { Props } from '../navigation/Navigation';
import Player from '../features/music-pad/Player';
import {
  SynthTabs,
  useSynthChannel,
  GRID_CONFIGS,
  KEYS,
  generateScale,
  type Key,
  type ScaleType,
  type GridSize,
} from '../features/synth-instrument';

const SynthScreen: React.FC<Props<'synth'>> = ({ route }) => {
  const { channelId, color } = route.params;

  const channel = useSynthChannel(channelId);

  const [octaveShift, setOctaveShift] = useState(0);
  const [selectedKey, setSelectedKey] = useState<Key>('C');
  const [scaleType, setScaleType] = useState<ScaleType>('Major');
  const [useScale, setUseScale] = useState(true);
  const [gridSize, setGridSize] = useState<GridSize>('5x5');

  const [scrollEnabled, setScrollEnabled] = useState(true);
  const disableScroll = useCallback(() => setScrollEnabled(false), []);
  const enableScroll = useCallback(() => setScrollEnabled(true), []);

  const headerHeight = useHeaderHeight();

  const changeGridSize = useCallback(() => {
    const sizes = Object.keys(GRID_CONFIGS) as GridSize[];
    setGridSize(s => sizes[(sizes.indexOf(s) + 1) % sizes.length]);
  }, []);

  const changeKey = useCallback(() => {
    setSelectedKey(k => KEYS[(KEYS.indexOf(k) + 1) % KEYS.length]);
  }, []);

  const { rows, cols } = GRID_CONFIGS[gridSize];
  const totalPads = rows * cols;
  const rootNote = 12 * (3 + 1) + KEYS.indexOf(selectedKey) + octaveShift * 12;
  const gridNotes = useScale
    ? generateScale(rootNote, scaleType, totalPads)
    : Array.from({ length: totalPads }, (_, i) => rootNote + i);
  const scaleNotes = new Set(generateScale(rootNote, scaleType, 88));

  return (
    <View style={[styles.container, { paddingTop: headerHeight }]}>
      <SynthTabs
        channel={channel}
        color={color}
        scrollEnabled={scrollEnabled}
        disableScroll={disableScroll}
        enableScroll={enableScroll}
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
      />
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
});
