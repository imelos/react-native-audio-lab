import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import KnobPanel from '../../../components/knob/KnobPanel';
import { WAVEFORMS } from '../types';
import type { SynthChannelHandle } from '../useSynthChannel';

const LFO_DEST_LABELS = ['Pitch', 'Filter', 'Vol'];

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

    <KnobPanel
      color={color}
      onDragStart={disableScroll}
      onDragEnd={enableScroll}
      knobs={[
        {
          label: 'PW',
          value: channel.pulseWidth,
          min: 0.01,
          max: 0.99,
          formatValue: v => `${(v * 100).toFixed(0)}%`,
          onChange: channel.onPulseWidthChange,
          onComplete: channel.onPulseWidthComplete,
        },
        {
          label: 'Unison',
          value: channel.unisonCount,
          min: 1,
          max: 8,
          step: 1,
          formatValue: v => `${Math.round(v)}`,
          onChange: channel.onUnisonCountChange,
          onComplete: channel.onUnisonCountComplete,
        },
        {
          label: 'Spread',
          value: channel.unisonSpread,
          min: 0,
          max: 100,
          formatValue: v => `${v.toFixed(0)}ct`,
          onChange: channel.onUnisonSpreadChange,
          onComplete: channel.onUnisonSpreadComplete,
        },
        {
          label: 'Glide',
          value: channel.glideTime,
          min: 0,
          max: 2,
          formatValue: v =>
            v < 0.001 ? 'Off' : v < 1 ? `${(v * 1000).toFixed(0)}ms` : `${v.toFixed(2)}s`,
          onChange: channel.onGlideTimeChange,
          onComplete: channel.onGlideTimeComplete,
        },
      ]}
    />

    <KnobPanel
      color={color}
      onDragStart={disableScroll}
      onDragEnd={enableScroll}
      knobs={[
        {
          label: 'LFO Rate',
          value: channel.lfoRate,
          min: 0.1,
          max: 20,
          formatValue: v => `${v.toFixed(1)}Hz`,
          onChange: channel.onLfoRateChange,
          onComplete: channel.onLfoRateComplete,
        },
        {
          label: 'LFO Depth',
          value: channel.lfoDepth,
          min: 0,
          max: 1,
          formatValue: v => `${(v * 100).toFixed(0)}%`,
          onChange: channel.onLfoDepthChange,
          onComplete: channel.onLfoDepthComplete,
        },
        {
          label: 'LFO Dest',
          value: channel.lfoDestination,
          min: 0,
          max: 2,
          step: 1,
          formatValue: v => LFO_DEST_LABELS[Math.round(v)] ?? 'Pitch',
          onChange: channel.onLfoDestinationChange,
        },
        {
          label: 'LFO Wave',
          value: WAVEFORMS.indexOf(channel.lfoWaveform),
          min: 0,
          max: WAVEFORMS.length - 1,
          step: 1,
          formatValue: v => WAVEFORMS[Math.round(v)] ?? 'sine',
          onChange: channel.onLfoWaveformChange,
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
