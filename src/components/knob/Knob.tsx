import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-worklets';

const DEFAULT_SIZE = 70;
const STROKE = 8;

const START_ANGLE = -225;
const ARC_RATIO = 0.75; // 270 degrees

interface KnobProps {
  label: string;
  value: number;
  onValueChange: (v: number) => void;
  onComplete?: (v: number) => void;
  minimumValue?: number;
  maximumValue?: number;
  step?: number;
  size?: number;
  tintColor?: string;
  formatValue?: (v: number) => string;
}

const Knob: React.FC<KnobProps> = ({
  value,
  onValueChange,
  onComplete,
  label = '',
  minimumValue = 0,
  maximumValue = 100,
  step = 0,
  size = DEFAULT_SIZE,
  tintColor = '#9fb3ff',
  formatValue,
}) => {
  const radius = (size - STROKE) / 2;
  const circ = 2 * Math.PI * radius;
  const arcLength = circ * ARC_RATIO;

  const [innerValue, setInnerValue] = useState(value || 0);
  const dragging = useRef(false);

  const progress = (innerValue - minimumValue) / (maximumValue - minimumValue);
  const startValue = useRef(value);
  const RANGE = maximumValue - minimumValue;
  const DRAG_PIXELS = 150;

  useEffect(() => {
    if (!dragging.current) setInnerValue(value);
  }, [value]);

  const panCallback = (val: number) => {
    onValueChange(val);
    setInnerValue(val);
  };

  const completeCallback = (val: number) => {
    dragging.current = false;
    onComplete?.(val);
  };

  const pan = Gesture.Pan()
    .onBegin(() => {
      startValue.current = innerValue;
      dragging.current = true;
    })
    .onUpdate(e => {
      const deltaRatio = -e.translationY / DRAG_PIXELS;
      let next = startValue.current + deltaRatio * RANGE;

      next = Math.min(maximumValue, Math.max(minimumValue, next));
      next = applyStep(next, step, minimumValue);

      runOnJS(panCallback)(next);
    })
    .onEnd(() => {
      runOnJS(completeCallback)(innerValue);
    });

  const displayValue = formatValue
    ? formatValue(innerValue)
    : innerValue.toFixed(step >= 1 ? 0 : 1);

  return (
    <View style={styles.container}>
      <GestureDetector gesture={pan}>
        <View style={[styles.knob, { width: size, height: size }]}>
          <Svg width={size} height={size}>
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke="#2a2a2a"
              strokeWidth={STROKE}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${circ * 0.75} ${circ}`}
              rotation={START_ANGLE}
              origin={`${size / 2}, ${size / 2}`}
            />
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={tintColor}
              strokeWidth={STROKE}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${arcLength} ${circ}`}
              strokeDashoffset={arcLength * (1 - progress)}
              rotation={START_ANGLE}
              origin={`${size / 2}, ${size / 2}`}
            />
          </Svg>
          <Text
            style={[styles.valueText, { fontSize: size * 0.15 }]}
            numberOfLines={1}
          >
            {displayValue}
          </Text>
        </View>
      </GestureDetector>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
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
    marginTop: 4,
    fontSize: 11,
  },
  knob: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  valueText: {
    position: 'absolute',
    color: '#ffffff',
    fontWeight: '600',
    textAlign: 'center',
  },
});
