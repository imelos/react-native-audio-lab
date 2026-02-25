import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, PanResponder } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

const DEFAULT_SIZE = 70;
const STROKE = 8;
const START_ANGLE = -225;
const ARC_RATIO = 0.75;
const DRAG_PIXELS = 150;

interface KnobProps {
  label: string;
  value: number;
  onValueChange: (v: number) => void;
  onComplete?: (v: number) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
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
  onDragStart,
  onDragEnd,
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

  // Mutable refs safe to read in PanResponder callbacks (no closure staleness)
  const currentRef = useRef(value || 0);
  const startRef = useRef(value || 0);
  const onValueChangeRef = useRef(onValueChange);
  const onCompleteRef = useRef(onComplete);

  // Keep callback refs current every render
  onValueChangeRef.current = onValueChange;
  onCompleteRef.current = onComplete;
  const onDragStartRef = useRef(onDragStart);
  const onDragEndRef = useRef(onDragEnd);
  onDragStartRef.current = onDragStart;
  onDragEndRef.current = onDragEnd;

  // Sync from external value (e.g. preset load) — only outside a drag
  const dragging = useRef(false);
  useEffect(() => {
    if (!dragging.current) {
      currentRef.current = value;
      setInnerValue(value);
    }
  }, [value]);

  const RANGE = maximumValue - minimumValue;

  // PanResponder lives in the same UIView touch layer as the grid's
  // onTouchStart/End — no UIGestureRecognizer interference.
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // Claim on touch start so the parent ScrollView can't steal the drag
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponderCapture: () => false,
        // Refuse termination so ScrollView can't reclaim mid-drag
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          dragging.current = true;
          startRef.current = currentRef.current;
          onDragStartRef.current?.();
        },
        onPanResponderMove: (_, g) => {
          const deltaRatio = -g.dy / DRAG_PIXELS;
          let next = startRef.current + deltaRatio * RANGE;
          next = Math.min(maximumValue, Math.max(minimumValue, next));
          if (step > 0) {
            next =
              Math.round((next - minimumValue) / step) * step + minimumValue;
          }
          currentRef.current = next;
          setInnerValue(next);
          onValueChangeRef.current(next);
        },
        onPanResponderRelease: () => {
          dragging.current = false;
          onCompleteRef.current?.(currentRef.current);
          onDragEndRef.current?.();
        },
        onPanResponderTerminate: () => {
          dragging.current = false;
          onDragEndRef.current?.();
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [minimumValue, maximumValue, step, RANGE],
  );

  const progress = (innerValue - minimumValue) / (maximumValue - minimumValue);
  const displayValue = formatValue
    ? formatValue(innerValue)
    : innerValue.toFixed(step >= 1 ? 0 : 1);

  return (
    <View style={styles.container}>
      <View
        style={[styles.knob, { width: size, height: size }]}
        {...panResponder.panHandlers}
      >
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
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
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
