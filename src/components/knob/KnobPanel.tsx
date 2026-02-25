import React from 'react';
import { View, StyleSheet } from 'react-native';
import Knob from './Knob';

export interface KnobConfig {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  formatValue?: (v: number) => string;
  onChange: (v: number) => void;
  onComplete?: (v: number) => void;
}

interface KnobPanelProps {
  knobs: KnobConfig[];
  color?: string;
  knobSize?: number;
  maxPerRow?: number;
}

const KnobPanel: React.FC<KnobPanelProps> = ({
  knobs,
  color = '#9fb3ff',
  knobSize = 70,
  maxPerRow = 4,
}) => {
  const rows: KnobConfig[][] = [];
  for (let i = 0; i < knobs.length; i += maxPerRow) {
    rows.push(knobs.slice(i, i + maxPerRow));
  }

  return (
    <View style={styles.container}>
      {rows.map((row, ri) => (
        <View key={ri} style={styles.row}>
          {row.map((knob, ki) => (
            <Knob
              key={`${ri}-${ki}`}
              label={knob.label}
              value={knob.value}
              minimumValue={knob.min}
              maximumValue={knob.max}
              step={knob.step}
              formatValue={knob.formatValue}
              onValueChange={knob.onChange}
              onComplete={knob.onComplete}
              size={knobSize}
              tintColor={color}
            />
          ))}
        </View>
      ))}
    </View>
  );
};

export default KnobPanel;

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    paddingBottom: 10
  },
});
