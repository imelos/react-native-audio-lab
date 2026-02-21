import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Pressable,
} from 'react-native';
import {
  NoteRepeatMode,
  NOTE_REPEAT_MODES,
} from './hooks/useNoteRepeat';

interface NoteRepeatSelectorProps {
  color: string;
  mode: NoteRepeatMode;
  visible: boolean;
  onSelect: (mode: NoteRepeatMode) => void;
  onClose: () => void;
}

export default function NoteRepeatSelector({
  color,
  mode,
  visible,
  onSelect,
  onClose,
}: NoteRepeatSelectorProps) {
  if (!visible) return null;

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      {/* Backdrop — tap to close */}
      <Pressable style={styles.backdrop} onPress={onClose} />

      {/* Left-side mode column */}
      <View style={styles.panel}>
        <Text style={styles.title}>REPEAT</Text>
        {NOTE_REPEAT_MODES.map(m => {
          const isActive = m === mode;
          return (
            <TouchableOpacity
              key={m}
              style={[styles.modeButton, isActive && { backgroundColor: color }]}
              onPress={() => {
                onSelect(m);
                onClose();
              }}
            >
              <Text
                style={[styles.modeText, isActive && styles.activeModeText]}
              >
                {m === 'off' ? 'OFF' : m}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    zIndex: 10,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  panel: {
    width: 72,
    backgroundColor: '#1a1a1a',
    borderRightWidth: 1,
    borderRightColor: '#333',
    paddingVertical: 8,
    paddingHorizontal: 4,
    justifyContent: 'center',
    gap: 4,
  },
  title: {
    color: '#666',
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
    letterSpacing: 1,
  },
  modeButton: {
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 4,
    alignItems: 'center',
  },
  activeModeButton: {},
  modeText: {
    color: '#888',
    fontSize: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  activeModeText: {
    color: '#ffffff',
  },
});
