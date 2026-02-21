import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Slider, { SliderProps } from '@react-native-community/slider';
import Svg, { Circle } from 'react-native-svg';

const SIZE = 140;
const STROKE = 12;
const RADIUS = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * RADIUS;

// visual range like your image (≈ 270°)
const START_ANGLE = -225;
// const END_ANGLE = 45;
// const ANGLE_RANGE = END_ANGLE - START_ANGLE;

const ARC_RATIO = 0.75; // 270 degrees
const ARC_LENGTH = CIRC * ARC_RATIO;

interface KnobProps extends Omit<SliderProps, 'StepMarker'> {
  label: string;
}

const Knob: React.FC<KnobProps> = ({
  value,
  onValueChange,
  label = 'Filter Cutoff',
  minimumValue = 0,
  maximumValue = 1,
}) => {
  const [innerValue, setInnerValue] = useState(value || 0);

  const progress = (innerValue - minimumValue) / (maximumValue - minimumValue);

  //   const strokeDashoffset = useMemo(() => CIRC * (1 - progress), [progress]);

  const _onValueChange = (v: number) => {
    onValueChange?.(v);
    setInnerValue(v);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>

      {/* Visual knob */}
      <View style={styles.knob}>
        <Svg width={SIZE} height={SIZE}>
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            stroke="#2a2a2a"
            strokeWidth={STROKE}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${CIRC * 0.75} ${CIRC}`}
            rotation={START_ANGLE}
            origin={`${SIZE / 2}, ${SIZE / 2}`}
          />
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            stroke="#9fb3ff"
            strokeWidth={STROKE}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${ARC_LENGTH} ${CIRC}`}
            strokeDashoffset={ARC_LENGTH * (1 - progress)}
            rotation={START_ANGLE}
            origin={`${SIZE / 2}, ${SIZE / 2}`}
          />
        </Svg>

        {/* Invisible vertical slider */}
        <Slider
          style={styles.slider}
          minimumValue={minimumValue}
          maximumValue={maximumValue}
          value={innerValue}
          onValueChange={_onValueChange}
          minimumTrackTintColor="transparent"
          maximumTrackTintColor="transparent"
          thumbTintColor="transparent"
        />
      </View>
    </View>
  );
};

export default Knob;

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  label: {
    color: '#9a9a9a',
    marginBottom: 16,
    fontSize: 16,
  },
  knob: {
    width: SIZE,
    height: SIZE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  slider: {
    position: 'absolute',
    width: SIZE,
    height: 40,
    transform: [{ rotate: '-90deg' }],
  },
});
