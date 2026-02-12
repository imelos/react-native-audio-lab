import React, { useState } from 'react';
import {
  View,
  Pressable,
  StyleSheet,
  Text,
  Button,
  ScrollView,
} from 'react-native';
import NativeAudioModule from './src/specs/NativeAudioModule'; // your TurboModule import

const NOTES = [
  { note: 60, name: 'C4' },
  { note: 62, name: 'D4' },
  { note: 64, name: 'E4' },
  { note: 65, name: 'F4' },
  { note: 67, name: 'G4' },
  { note: 69, name: 'A4' },
  { note: 71, name: 'B4' },
  { note: 72, name: 'C5' },
];

const WAVEFORMS = ['sine', 'saw', 'square', 'triangle'] as const;
type Waveform = (typeof WAVEFORMS)[number];

export default function App() {
  const [currentWaveform, setCurrentWaveform] = useState<Waveform>('sine');

  // Optional: you can add more controls later (volume, detune, etc.)

  const changeWaveform = () => {
    const currentIndex = WAVEFORMS.indexOf(currentWaveform);
    const nextIndex = (currentIndex + 1) % WAVEFORMS.length;
    const nextWave = WAVEFORMS[nextIndex];

    setCurrentWaveform(nextWave);
    NativeAudioModule.setWaveform(nextWave);
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>JUCE Synth</Text>

      {/* Waveform selector */}
      <View style={styles.controlRow}>
        <Text style={styles.label}>Waveform: {currentWaveform}</Text>
        <Button
          title="Change Waveform"
          onPress={changeWaveform}
          color="#6200ee"
        />
      </View>

      {/* Quick ADSR presets */}
      <View style={styles.controlRow}>
        <Text style={styles.label}>Presets:</Text>
        <View style={styles.buttonGroup}>
          <Button
            title="Pluck"
            onPress={() => NativeAudioModule.setADSR(0.005, 0.1, 0.0, 0.2)}
          />
          <Button
            title="Pad"
            onPress={() => NativeAudioModule.setADSR(0.3, 1.5, 0.7, 2.0)}
          />
          <Button
            title="Organ"
            onPress={() => NativeAudioModule.setADSR(0.01, 0.05, 1.0, 0.4)}
          />
        </View>
      </View>

      {/* Keyboard */}
      <View style={styles.keyboard}>
        {NOTES.map(({ note, name }) => (
          <Pressable
            key={note}
            style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}
            onTouchStart={() => NativeAudioModule.noteOn(note, 0.85)}
            onTouchEnd={() => NativeAudioModule.noteOff(note)}
          >
            <Text style={styles.noteName}>{name}</Text>
          </Pressable>
        ))}
      </View>

      <View style={{ height: 60 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
    paddingTop: 60,
  },
  title: {
    fontSize: 36,
    color: '#ffffff',
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 32,
  },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    gap: 12,
    flexWrap: 'wrap',
    paddingHorizontal: 16,
  },
  label: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '500',
  },
  buttonGroup: {
    flexDirection: 'row',
    gap: 12,
  },
  keyboard: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    paddingHorizontal: 16,
    gap: 10,
    marginTop: 20,
  },
  key: {
    width: 54,
    height: 180,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
    elevation: 6,
  },
  keyPressed: {
    backgroundColor: '#e0e0e0',
    transform: [{ scale: 0.94 }],
  },
  noteName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111111',
  },
});
