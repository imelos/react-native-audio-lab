import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import KnobPanel from '../../../components/knob/KnobPanel';
import { WAVEFORMS } from '../types';
import type { SynthChannelHandle } from '../useSynthChannel';

interface Props {
  channel: SynthChannelHandle;
  color: string;
  scrollEnabled: boolean;
  disableScroll: () => void;
  enableScroll: () => void;
}

export const OscillatorsTab: React.FC<Props> = ({
  channel,
  color,
  scrollEnabled,
  disableScroll,
  enableScroll,
}) => (
  <ScrollView
    style={styles.tabContent}
    showsVerticalScrollIndicator={false}
    nestedScrollEnabled
    scrollEnabled={scrollEnabled}
  >
    <KnobPanel
      color={color}
      onDragStart={disableScroll}
      onDragEnd={enableScroll}
      knobs={[
        {
          label: 'Osc 1',
          value: WAVEFORMS.indexOf(channel.waveform),
          min: 0,
          max: WAVEFORMS.length - 1,
          step: 1,
          formatValue: v => WAVEFORMS[Math.round(v)] ?? 'sine',
          onChange: channel.onWaveformChange,
        },
        {
          label: 'Osc 2',
          value: WAVEFORMS.indexOf(channel.osc2Waveform),
          min: 0,
          max: WAVEFORMS.length - 1,
          step: 1,
          formatValue: v => WAVEFORMS[Math.round(v)] ?? 'sine',
          onChange: channel.onOsc2WaveformChange,
        },
        {
          label: 'Osc2 Level',
          value: channel.osc2Level,
          min: 0,
          max: 1,
          formatValue: v => `${(v * 100).toFixed(0)}%`,
          onChange: channel.onOsc2LevelChange,
          onComplete: channel.onOsc2LevelComplete,
        },
        {
          label: 'Osc2 Semi',
          value: channel.osc2Semi,
          min: -24,
          max: 24,
          step: 1,
          formatValue: v => `${v > 0 ? '+' : ''}${Math.round(v)}st`,
          onChange: channel.onOsc2SemiChange,
          onComplete: channel.onOsc2SemiComplete,
        },
      ]}
    />

    <KnobPanel
      color={color}
      onDragStart={disableScroll}
      onDragEnd={enableScroll}
      knobs={[
        {
          label: 'Detune',
          value: channel.osc2Detune,
          min: -100,
          max: 100,
          step: 1,
          formatValue: v => `${v > 0 ? '+' : ''}${v.toFixed(0)}ct`,
          onChange: channel.onOsc2DetuneChange,
          onComplete: channel.onOsc2DetuneComplete,
        },
        {
          label: 'Sub',
          value: channel.subLevel,
          min: 0,
          max: 1,
          formatValue: v => `${(v * 100).toFixed(0)}%`,
          onChange: channel.onSubLevelChange,
          onComplete: channel.onSubLevelComplete,
        },
        {
          label: 'Noise',
          value: channel.noiseLevel,
          min: 0,
          max: 1,
          formatValue: v => `${(v * 100).toFixed(0)}%`,
          onChange: channel.onNoiseLevelChange,
          onComplete: channel.onNoiseLevelComplete,
        },
      ]}
    />
  </ScrollView>
);

const styles = StyleSheet.create({
  tabContent: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
});
