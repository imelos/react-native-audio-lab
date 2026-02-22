import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Slider, { SliderProps } from '@react-native-community/slider';
import Svg, { Circle } from 'react-native-svg';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-worklets';

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

// interface KnobProps extends Omit<SliderProps, 'StepMarker'> {
//   label: string;
// }

interface KnobProps {
  label: string;
  value: number;
  onValueChange: (v: number) => void;
  minimumValue?: number;
  maximumValue?: number;
  step?: number;
}

const Knob: React.FC<KnobProps> = ({
  value,
  onValueChange,
  label = '',
  minimumValue = 0,
  maximumValue = 100,
  step = 0,
}) => {
  const [innerValue, setInnerValue] = useState(value || 0);

  const progress = (innerValue - minimumValue) / (maximumValue - minimumValue);
  const startValue = useRef(value);
  const RANGE = maximumValue - minimumValue;
  const DRAG_PIXELS = 150; // how much drag = full range

  useEffect(() => {
    setInnerValue(value);
  }, [value]);

  const panCallback = (val: number) => {
    onValueChange(val);
    setInnerValue(val);
  };

  const pan = Gesture.Pan()
    .onBegin(() => {
      startValue.current = innerValue;
    })
    .onUpdate(e => {
      const deltaRatio = -e.translationY / DRAG_PIXELS; // -1 → 1
      let next = startValue.current + deltaRatio * RANGE;

      next = Math.min(maximumValue, Math.max(minimumValue, next));
      next = applyStep(next, step, minimumValue);

      runOnJS(panCallback)(next);
    });

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <GestureDetector gesture={pan}>
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
        </View>
      </GestureDetector>
    </View>
  );
};

const applyStep = (value: number, step?: number, min = 0) => {
  'worklet';
  if (!step || step <= 0) return value;
  return Math.round((value - min) / step) * step + min;
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
    // width: 0,
    // height: 0,
    // transform: [{ rotate: '-90deg' }],
  },
});
