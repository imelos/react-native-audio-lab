import React from 'react';
import { View, Text, Button, ScrollView, StyleSheet } from 'react-native';
import KnobPanel from '../../../components/knob/KnobPanel';
import type { SynthChannelHandle } from '../useSynthChannel';

interface Props {
  channel: SynthChannelHandle;
  color: string;
  scrollEnabled: boolean;
  disableScroll: () => void;
  enableScroll: () => void;
}

export const FxTab: React.FC<Props> = ({
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
    {/* Chain Filter */}
    <View style={styles.effectSection}>
      <View style={styles.effectHeader}>
        <Text style={styles.effectTitle}>Chain Filter</Text>
        <Button
          title={channel.chainFilterEnabled ? 'ON' : 'OFF'}
          onPress={channel.toggleChainFilter}
          color={channel.chainFilterEnabled ? '#4caf50' : '#757575'}
        />
      </View>
      {channel.chainFilterEnabled && (
        <>
          <View style={styles.controlRow}>
            <Text style={styles.label}>Type: {channel.chainFilterType}</Text>
            <Button title="Change Type" onPress={channel.changeChainFilterType} color={color} />
          </View>
          <KnobPanel
            color={color}
            onDragStart={disableScroll}
            onDragEnd={enableScroll}
            knobs={[
              {
                label: 'Cutoff',
                value: channel.chainFilterCutoff,
                min: 20,
                max: 20000,
                formatValue: v => `${Math.round(v)}`,
                onChange: channel.onChainFilterCutoffChange,
                onComplete: channel.onChainFilterCutoffComplete,
              },
              {
                label: 'Resonance',
                value: channel.chainFilterResonance,
                min: 0.1,
                max: 10,
                formatValue: v => v.toFixed(2),
                onChange: channel.onChainFilterResonanceChange,
                onComplete: channel.onChainFilterResonanceComplete,
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
          title={channel.reverbEnabled ? 'ON' : 'OFF'}
          onPress={channel.toggleReverb}
          color={channel.reverbEnabled ? '#4caf50' : '#757575'}
        />
      </View>
      {channel.reverbEnabled && (
        <KnobPanel
          color={color}
          onDragStart={disableScroll}
          onDragEnd={enableScroll}
          knobs={[
            {
              label: 'Room Size',
              value: channel.reverbRoomSize,
              min: 0,
              max: 1,
              formatValue: v => `${(v * 100).toFixed(0)}%`,
              onChange: channel.onReverbRoomSizeChange,
              onComplete: channel.onReverbRoomSizeComplete,
            },
            {
              label: 'Wet',
              value: channel.reverbWetLevel,
              min: 0,
              max: 1,
              formatValue: v => `${(v * 100).toFixed(0)}%`,
              onChange: channel.onReverbWetLevelChange,
              onComplete: channel.onReverbWetLevelComplete,
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
          title={channel.delayEnabled ? 'ON' : 'OFF'}
          onPress={channel.toggleDelay}
          color={channel.delayEnabled ? '#4caf50' : '#757575'}
        />
      </View>
      {channel.delayEnabled && (
        <KnobPanel
          color={color}
          onDragStart={disableScroll}
          onDragEnd={enableScroll}
          knobs={[
            {
              label: 'Time',
              value: channel.delayTime,
              min: 1,
              max: 2000,
              formatValue: v => `${Math.round(v)}ms`,
              onChange: channel.onDelayTimeChange,
              onComplete: channel.onDelayTimeComplete,
            },
            {
              label: 'Feedback',
              value: channel.delayFeedback,
              min: 0,
              max: 0.95,
              formatValue: v => `${(v * 100).toFixed(0)}%`,
              onChange: channel.onDelayFeedbackChange,
              onComplete: channel.onDelayFeedbackComplete,
            },
            {
              label: 'Wet',
              value: channel.delayWetLevel,
              min: 0,
              max: 1,
              formatValue: v => `${(v * 100).toFixed(0)}%`,
              onChange: channel.onDelayWetLevelChange,
              onComplete: channel.onDelayWetLevelComplete,
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
          title={channel.chorusEnabled ? 'ON' : 'OFF'}
          onPress={channel.toggleChorus}
          color={channel.chorusEnabled ? '#4caf50' : '#757575'}
        />
      </View>
      {channel.chorusEnabled && (
        <KnobPanel
          color={color}
          onDragStart={disableScroll}
          onDragEnd={enableScroll}
          knobs={[
            {
              label: 'Rate',
              value: channel.chorusRate,
              min: 0.1,
              max: 10,
              formatValue: v => `${v.toFixed(1)}Hz`,
              onChange: channel.onChorusRateChange,
              onComplete: channel.onChorusRateComplete,
            },
            {
              label: 'Depth',
              value: channel.chorusDepth,
              min: 0,
              max: 1,
              formatValue: v => `${(v * 100).toFixed(0)}%`,
              onChange: channel.onChorusDepthChange,
              onComplete: channel.onChorusDepthComplete,
            },
            {
              label: 'Mix',
              value: channel.chorusMix,
              min: 0,
              max: 1,
              formatValue: v => `${(v * 100).toFixed(0)}%`,
              onChange: channel.onChorusMixChange,
              onComplete: channel.onChorusMixComplete,
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
          title={channel.distortionEnabled ? 'ON' : 'OFF'}
          onPress={channel.toggleDistortion}
          color={channel.distortionEnabled ? '#4caf50' : '#757575'}
        />
      </View>
      {channel.distortionEnabled && (
        <KnobPanel
          color={color}
          onDragStart={disableScroll}
          onDragEnd={enableScroll}
          knobs={[
            {
              label: 'Drive',
              value: channel.distortionDrive,
              min: 1,
              max: 100,
              formatValue: v => v.toFixed(1),
              onChange: channel.onDistortionDriveChange,
              onComplete: channel.onDistortionDriveComplete,
            },
            {
              label: 'Mix',
              value: channel.distortionMix,
              min: 0,
              max: 1,
              formatValue: v => `${(v * 100).toFixed(0)}%`,
              onChange: channel.onDistortionMixChange,
              onComplete: channel.onDistortionMixComplete,
            },
            {
              label: 'Tone',
              value: channel.distortionTone,
              min: 0,
              max: 1,
              formatValue: v => `${(v * 100).toFixed(0)}%`,
              onChange: channel.onDistortionToneChange,
              onComplete: channel.onDistortionToneComplete,
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
          title={channel.compressorEnabled ? 'ON' : 'OFF'}
          onPress={channel.toggleCompressor}
          color={channel.compressorEnabled ? '#4caf50' : '#757575'}
        />
      </View>
      {channel.compressorEnabled && (
        <KnobPanel
          color={color}
          onDragStart={disableScroll}
          onDragEnd={enableScroll}
          knobs={[
            {
              label: 'Threshold',
              value: channel.compThreshold,
              min: -60,
              max: 0,
              formatValue: v => `${v.toFixed(0)}dB`,
              onChange: channel.onCompThresholdChange,
              onComplete: channel.onCompThresholdComplete,
            },
            {
              label: 'Ratio',
              value: channel.compRatio,
              min: 1,
              max: 20,
              formatValue: v => `${v.toFixed(1)}:1`,
              onChange: channel.onCompRatioChange,
              onComplete: channel.onCompRatioComplete,
            },
            {
              label: 'Attack',
              value: channel.compAttack,
              min: 0.1,
              max: 100,
              formatValue: v => `${v.toFixed(1)}ms`,
              onChange: channel.onCompAttackChange,
              onComplete: channel.onCompAttackComplete,
            },
            {
              label: 'Release',
              value: channel.compRelease,
              min: 10,
              max: 1000,
              formatValue: v => `${v.toFixed(0)}ms`,
              onChange: channel.onCompReleaseChange,
              onComplete: channel.onCompReleaseComplete,
            },
          ]}
        />
      )}
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
});
