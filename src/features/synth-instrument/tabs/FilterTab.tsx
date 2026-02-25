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

export const FilterTab: React.FC<Props> = ({
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
    <View style={styles.effectSection}>
      <View style={styles.effectHeader}>
        <Text style={styles.effectTitle}>Voice Filter</Text>
        <Button
          title={channel.voiceFilterEnabled ? 'ON' : 'OFF'}
          onPress={channel.toggleVoiceFilter}
          color={channel.voiceFilterEnabled ? '#4caf50' : '#757575'}
        />
      </View>
      {channel.voiceFilterEnabled && (
        <KnobPanel
          color={color}
          onDragStart={disableScroll}
          onDragEnd={enableScroll}
          knobs={[
            {
              label: 'Cutoff',
              value: channel.voiceFilterCutoff,
              min: 20,
              max: 20000,
              formatValue: v => `${Math.round(v)}`,
              onChange: channel.onVoiceFilterCutoffChange,
              onComplete: channel.onVoiceFilterCutoffComplete,
            },
            {
              label: 'Resonance',
              value: channel.voiceFilterResonance,
              min: 0,
              max: 1,
              formatValue: v => v.toFixed(2),
              onChange: channel.onVoiceFilterResonanceChange,
              onComplete: channel.onVoiceFilterResonanceComplete,
            },
            {
              label: 'Env Amt',
              value: channel.voiceFilterEnvAmount,
              min: 0,
              max: 1,
              formatValue: v => `${(v * 100).toFixed(0)}%`,
              onChange: channel.onVoiceFilterEnvAmountChange,
              onComplete: channel.onVoiceFilterEnvAmountComplete,
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
