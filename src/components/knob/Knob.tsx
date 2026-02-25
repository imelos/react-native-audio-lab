import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue } from 'react-native-reanimated';

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

  // React state drives the SVG arc and value label (JS thread only)
  const [innerValue, setInnerValue] = useState(value || 0);

  // SharedValues are safe to read/write from both worklet (UI) and JS thread
  const sharedCurrent = useSharedValue(value || 0);
  const sharedStart = useSharedValue(value || 0);

  const RANGE = maximumValue - minimumValue;
  const DRAG_PIXELS = 150;

  // Sync when an external value change arrives (e.g. preset load).
  // Parent only calls setState in onComplete (not during drag), so this
  // won't fight with an in-progress gesture.
  useEffect(() => {
    sharedCurrent.value = value;
    setInnerValue(value);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const progress = (innerValue - minimumValue) / (maximumValue - minimumValue);

  // These run on the JS thread (via runOnJS)
  const notifyChange = (v: number) => {
    setInnerValue(v);
    onValueChange(v);
  };

  const notifyComplete = (v: number) => {
    onComplete?.(v);
  };

  const pan = Gesture.Pan()
    .minDistance(6)
    .onBegin(() => {
      sharedStart.value = sharedCurrent.value;
    })
    .onUpdate(e => {
      'worklet';
      const deltaRatio = -e.translationY / DRAG_PIXELS;
      let next = sharedStart.value + deltaRatio * RANGE;
      next = Math.min(maximumValue, Math.max(minimumValue, next));
      next = applyStep(next, step, minimumValue);
      sharedCurrent.value = next;
      runOnJS(notifyChange)(next);
    })
    .onFinalize((_, success) => {
      'worklet';
      if (success) {
        runOnJS(notifyComplete)(sharedCurrent.value);
      }
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
