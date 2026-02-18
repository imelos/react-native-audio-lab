import React, { useRef, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import NativeAudioModule from '../../specs/NativeAudioModule';
import { MidiVisualizer } from './midi-visualiser/MidiVisualiser';
import Grid, { GridHandle } from './grid/Grid';
import { createLoopSequence, quantizeEvents } from './utils/loopUtils.ts';
import { useSequencer } from './hooks/useSequencer.ts';

export interface PlayerProps {
  channel: number;
  gridNotes: number[];
  rows: number;
  cols: number;
  gridSize: string;
  useScale: boolean;
  scaleNotes: Set<number>;
}

export default function Player({
  channel,
  gridNotes,
  rows,
  cols,
  gridSize,
  useScale,
  scaleNotes,
}: PlayerProps) {
  const gridRef = useRef<GridHandle>(null);
  const windowWidth = Dimensions.get('window').width;

  // ── Hook into the global sequencer ───────────────────────────────────────

  const {
    // transportState,
    sequence,
    isRecording,
    isPlaying,
    playheadX,
    currentMusicalMs,
    visualNotesRef,
    masterDuration,
    // play,
    // stop,
    togglePlayback,
    startRecording,
    clearRecording,
    commitRecording,
    deleteSequence,
    quantize,
    pushNoteOn,
    pushNoteOff,
  } = useSequencer({ channel, gridRef });

  // ── Grid note handlers ───────────────────────────────────────────────────

  const handleNoteOn = useCallback(
    (note: number, velocity: number) => {
      // Auto-start recording on first touch if nothing exists yet
      if (!isRecording && !sequence) {
        startRecording();
      }

      NativeAudioModule.noteOn(channel, note, velocity);
      pushNoteOn(note, velocity);

      // Live visual feedback (not from sequencer, since we're recording live)
      gridRef.current?.setPadActive(note, true);
    },
    [channel, isRecording, sequence, startRecording, pushNoteOn],
  );

  const handleNoteOff = useCallback(
    (note: number) => {
      NativeAudioModule.noteOff(channel, note);
      pushNoteOff(note);
      gridRef.current?.setPadActive(note, false);
    },
    [channel, pushNoteOff],
  );

  // ── Actions ──────────────────────────────────────────────────────────────

  const handleAdd = useCallback(() => {
    commitRecording(createLoopSequence);
  }, [commitRecording]);

  const handleQuantize = useCallback(() => {
    quantize(quantizeEvents);
  }, [quantize]);

  // ── Memoized visualizer ──────────────────────────────────────────────────

  const MemoizedVisualizer = useMemo(
    () => (
      <MidiVisualizer
        height={50}
        width={windowWidth}
        notesRef={visualNotesRef}
        currentMusicalMs={currentMusicalMs}
        playheadX={playheadX}
        sequence={sequence ?? undefined}
        loopDuration={
          !sequence && masterDuration > 0 ? masterDuration : undefined
        }
      />
    ),
    [
      sequence,
      currentMusicalMs,
      playheadX,
      windowWidth,
      visualNotesRef,
      masterDuration,
    ],
  );

  const sequenceInfo = useMemo(() => {
    if (!sequence) return null;
    return {
      bpm: sequence.bpm.toFixed(1),
      bars: sequence.durationBars,
      duration: (sequence.duration / 1000).toFixed(2),
      confidence: (sequence.confidence * 100).toFixed(0),
    };
  }, [sequence]);

  // ── Render ───────────────────────────────────────────────────────────────

  const showRecordingButtons = isRecording;
  const showTransportButtons = !!sequence && !isRecording;

  return (
    <>
      <View style={styles.midiVisualiser}>{MemoizedVisualizer}</View>

      {sequenceInfo && (
        <View style={styles.sequenceInfo}>
          <Text style={styles.sequenceInfoText}>
            BPM: {sequenceInfo.bpm} | Bars: {sequenceInfo.bars} | Duration:{' '}
            {sequenceInfo.duration}s | Confidence: {sequenceInfo.confidence}%
          </Text>
        </View>
      )}

      <Grid
        ref={gridRef}
        gridNotes={gridNotes}
        rows={rows}
        cols={cols}
        gridSize={gridSize}
        useScale={useScale}
        scaleNotes={scaleNotes}
        onNoteOn={handleNoteOn}
        onNoteOff={handleNoteOff}
      />

      <View style={styles.footer} pointerEvents="box-none">
        {showRecordingButtons && (
          <View style={styles.footerButtons} pointerEvents="auto">
            <View style={styles.footerButtonRow}>
              <TouchableOpacity
                style={[styles.footerButton, styles.addButton]}
                onPress={handleAdd}
              >
                <Text style={styles.footerButtonText}>ADD</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.footerButton, styles.clearButton]}
                onPress={clearRecording}
              >
                <Text style={styles.footerButtonText}>CLEAR</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {showTransportButtons && (
          <View style={styles.footerButtons} pointerEvents="auto">
            <TouchableOpacity
              style={[styles.footerButton, styles.playButton]}
              onPress={handleQuantize}
            >
              <Text style={styles.footerButtonText}>QUANTIZE</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.footerButton,
                isPlaying ? styles.stopButton : styles.playButton,
              ]}
              onPress={togglePlayback}
            >
              <Text style={styles.footerButtonText}>
                {isPlaying ? '■ STOP' : '▶ PLAY'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.footerButton, styles.deleteButton]}
              onPress={deleteSequence}
            >
              <Text style={styles.footerButtonText}>DELETE</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  midiVisualiser: {
    height: 50,
  },
  sequenceInfo: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  sequenceInfoText: {
    color: '#ffffff',
    fontSize: 14,
    fontFamily: 'monospace',
  },
  footer: {
    bottom: 0,
    left: 0,
    right: 0,
    height: 50,
    paddingHorizontal: 16,
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  footerButtons: {
    alignItems: 'center',
    gap: 12,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  footerButtonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  footerButton: {
    paddingHorizontal: 20,
    paddingVertical: 3,
    borderRadius: 20,
    minWidth: 90,
    alignItems: 'center',
  },
  footerButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  addButton: {
    backgroundColor: '#4caf50',
  },
  clearButton: {
    backgroundColor: '#757575',
  },
  playButton: {
    backgroundColor: '#4caf50',
  },
  stopButton: {
    backgroundColor: '#f44336',
  },
  deleteButton: {
    backgroundColor: '#d32f2f',
  },
});
