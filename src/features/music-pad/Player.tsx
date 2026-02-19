import React, { useRef, useState, useCallback, useMemo } from 'react';
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
import GlobalSequencer from './hooks/GlobalSequencer';
import { useNoteRepeat, NoteRepeatMode } from './hooks/useNoteRepeat';
import NoteRepeatSelector from './NoteRepeatSelector';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
  const insets = useSafeAreaInsets();
  const gridRef = useRef<GridHandle>(null);
  const windowWidth = Dimensions.get('window').width;

  // ── Note repeat state ──────────────────────────────────────────────────
  const [noteRepeatMode, setNoteRepeatMode] = useState<NoteRepeatMode>('off');
  const [showRepeatSelector, setShowRepeatSelector] = useState(false);

  // ── Hook into the global sequencer ───────────────────────────────────────

  const {
    // transportState,
    sequence,
    isRecording,
    isPlaying,
    playheadX,
    currentMusicalMs,
    visualNotes,
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

  const sequencerRef = useRef(GlobalSequencer.getInstance());

  const rawNoteOn = useCallback(
    (note: number, velocity: number, duration?: number) => {
      // Auto-start recording on first touch if nothing exists yet.
      // Use the sequencer's imperative state (always current) instead of
      // React state which may be stale in closures — otherwise the repeat
      // clock's rapid re-triggers call startRecording() repeatedly, resetting
      // the recording buffer and losing events.
      const seq = sequencerRef.current;
      if (!seq.isChannelRecording(channel) && !seq.getSequence(channel)) {
        startRecording();
      }

      NativeAudioModule.noteOn(channel, note, velocity);
      pushNoteOn(note, velocity, duration);

      // Live visual feedback (not from sequencer, since we're recording live)
      gridRef.current?.setPadActive(note, true);
    },
    [channel, startRecording, pushNoteOn],
  );

  const rawNoteOff = useCallback(
    (note: number) => {
      NativeAudioModule.noteOff(channel, note);
      pushNoteOff(note);
      gridRef.current?.setPadActive(note, false);
    },
    [channel, pushNoteOff],
  );

  // Wrap with note repeat — when mode !== 'off', holding a pad re-triggers
  // the note at the selected grid division (Ableton Note–style).
  const { handleNoteOn, handleNoteOff } = useNoteRepeat({
    mode: noteRepeatMode,
    onNoteOn: rawNoteOn,
    onNoteOff: rawNoteOff,
  });

  const handleAdd = useCallback(() => {
    commitRecording(createLoopSequence);
  }, [commitRecording]);

  const handleQuantize = useCallback(() => {
    quantize(quantizeEvents);
  }, [quantize]);

  const MemoizedVisualizer = useMemo(
    () => (
      <MidiVisualizer
        height={30}
        width={windowWidth}
        notes={visualNotes}
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
      visualNotes,
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

  const showRecordingButtons = isRecording;
  const showTransportButtons = !!sequence && !isRecording;

  return (
    <>
      {MemoizedVisualizer}
      <View style={styles.gridContainer}>
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
        <View style={styles.sequenceInfo}>
          {sequenceInfo && (
            <Text style={styles.sequenceInfoText}>
              BPM: {sequenceInfo.bpm} | Bars: {sequenceInfo.bars} | Duration:{' '}
              {sequenceInfo.duration}s | Confidence: {sequenceInfo.confidence}%
            </Text>
          )}
        </View>
        <NoteRepeatSelector
          mode={noteRepeatMode}
          visible={showRepeatSelector}
          onSelect={setNoteRepeatMode}
          onClose={() => setShowRepeatSelector(false)}
        />
      </View>

      <View
        style={[styles.footer, { marginBottom: insets.bottom }]}
        pointerEvents="box-none"
      >
        {/* Note repeat toggle */}
        <TouchableOpacity
          style={[
            styles.repeatToggleButton,
            noteRepeatMode !== 'off' && styles.repeatToggleActive,
          ]}
          onPress={() => setShowRepeatSelector(prev => !prev)}
        >
          <Text style={styles.repeatToggleText}>
            {noteRepeatMode === 'off' ? 'RPT' : noteRepeatMode}
          </Text>
        </TouchableOpacity>

        {showRecordingButtons && (
          <View style={styles.footerButtons} pointerEvents="auto">
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
  gridContainer: {
    flex: 1,
    position: 'relative',
  },
  repeatToggleButton: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: '#2a2a2a',
    borderWidth: 1,
    borderColor: '#444',
    minWidth: 52,
    alignItems: 'center',
    position: 'absolute',
    left: 16,
  },
  repeatToggleActive: {
    backgroundColor: '#6200ee',
    borderColor: '#6200ee',
  },
  repeatToggleText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  sequenceInfo: {
    paddingHorizontal: 16,
    justifyContent: 'center',
    backgroundColor: 'rgba(44, 60, 167, 0.7)',
    height: 20,
  },
  sequenceInfoText: {
    color: '#ffffff',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  footer: {
    bottom: 0,
    left: 0,
    right: 0,
    height: 40,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  footerButtons: {
    alignItems: 'center',
    gap: 12,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  footerButton: {
    paddingHorizontal: 20,
    paddingVertical: 5,
    borderRadius: 4,
    minWidth: 90,
    alignItems: 'center',
  },
  footerButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 700,
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
