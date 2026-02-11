import React from 'react';
import { View, Pressable, StyleSheet, Text } from 'react-native';
import AudioModule from './src/specs/NativeAudioModule';

const NOTES = [
  { note: 60, name: 'C' },
  { note: 62, name: 'D' },
  { note: 64, name: 'E' },
  { note: 65, name: 'F' },
  { note: 67, name: 'G' },
  { note: 69, name: 'A' },
  { note: 71, name: 'B' },
  { note: 72, name: 'C′' },
];

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>JUCE Piano</Text>
      <View style={styles.keyboard}>
        {NOTES.map(({ note, name }) => (
          <Pressable
            key={note}
            style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}
            onPressIn={() => AudioModule.startNote(note)}
            onPressOut={() => AudioModule.stopNote()}
          >
            <Text style={styles.noteName}>{name}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    color: '#fff',
    marginBottom: 40,
    fontWeight: 'bold',
  },
  keyboard: {
    flexDirection: 'row',
    gap: 8,
  },
  key: {
    width: 40,
    height: 160,
    backgroundColor: '#fff',
    borderRadius: 8,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  keyPressed: {
    backgroundColor: '#ddd',
    transform: [{ scale: 0.95 }],
  },
  noteName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
});
