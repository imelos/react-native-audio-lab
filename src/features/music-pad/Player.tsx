import React, { useRef, useState, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  Pressable,
  LayoutAnimation,
  useWindowDimensions,
} from 'react-native';
import NativeAudioModule from '../../specs/NativeAudioModule';
import { MidiVisualizer } from './midi-visualiser/MidiVisualiser';
import MidiEditor from './midi-editor/MidiEditor';
import Grid, { GridHandle } from './grid/Grid';
import { createLoopSequence, quantizeEvents } from './utils/loopUtils.ts';
import { useSequencer } from './hooks/useSequencer.ts';
import GlobalSequencer from './hooks/GlobalSequencer';
import {
  useNoteRepeat,
  NoteRepeatMode,
  getIntervalMs,
} from './hooks/useNoteRepeat';
import { shouldDeferRecordingArmOnTouch } from './engine/sequencer/recordingArm';
import NoteRepeatSelector from './NoteRepeatSelector';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface PlayerProps {
  channel: number;
  color: string;
  gridNotes: number[];
  rows: number;
  cols: number;
  gridSize: string;
  useScale: boolean;
  scaleNotes: Set<number>;
}

export default function Player({
  channel,
  color,
  gridNotes,
  rows,
  cols,
  gridSize,
  useScale,
  scaleNotes,
}: PlayerProps) {
  const MAX_RECORD_ARM_GUARD_MS = 200;
  const insets = useSafeAreaInsets();
  const gridRef = useRef<GridHandle>(null);
  const { width: windowWidth } = useWindowDimensions();

  // ── MIDI editor state ────────────────────────────────────────────────
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorHeight, setEditorHeight] = useState(0);

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
    liveAutomationEvents,
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
  const ensureRecordingArmed = useCallback((source: 'touch' | 'trigger') => {
    const seq = sequencerRef.current;
    if (seq.isChannelRecording(channel)) return;

    const hasSequence = !!seq.getSequence(channel);
    if (source === 'touch' && noteRepeatMode !== 'off') {
      const duration = seq.getMasterDuration();
      const loopPos = seq.getCurrentMusicalMs(channel);
      const bpm = seq.getGlobalBPM() ?? 120;
      const intervalMs = getIntervalMs(noteRepeatMode, bpm);
      if (
        shouldDeferRecordingArmOnTouch({
          source,
          repeatEnabled: true,
          hasSequence,
          isPlaying: seq.transportState === 'playing',
          loopDurationMs: duration,
          loopPositionMs: loopPos,
          intervalMs,
          maxGuardMs: MAX_RECORD_ARM_GUARD_MS,
        })
      ) {
        // Near loop end, defer recording-arm to the first repeat trigger.
        // This prevents creating a tail pickup that feels like loop extension.
        return;
      }
    }

    if (!hasSequence) {
      startRecording();
    } else if (seq.transportState === 'playing') {
      // Overdub: only arm recording while transport is running.
      startRecording();
    }
  }, [channel, noteRepeatMode, startRecording]);

  const rawNoteOn = useCallback(
    (note: number, velocity: number, duration?: number, boundaryWallClock?: number) => {
      ensureRecordingArmed('trigger');
      NativeAudioModule.noteOn(channel, note, velocity);
      pushNoteOn(note, velocity, duration, boundaryWallClock);

      // Live visual feedback (not from sequencer, since we're recording live)
      gridRef.current?.setPadActive(note, true);
    },
    [channel, ensureRecordingArmed, pushNoteOn],
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
  const { handleNoteOn, handleNoteOff, getActiveBpm, flushRepeat } =
    useNoteRepeat({
      mode: noteRepeatMode,
      onNoteOn: rawNoteOn,
      onNoteOff: rawNoteOff,
    });

  const handlePadNoteOn = useCallback(
    (note: number, velocity: number) => {
      // Arm recording on physical touch so the first repeat hit isn't
      // quantized before the recording offset.
      ensureRecordingArmed('touch');
      handleNoteOn(note, velocity);
    },
    [ensureRecordingArmed, handleNoteOn],
  );

  const handleAdd = useCallback(() => {
    // Flush pending noteOffs before committing — prevents a cut last note
    // when ADD is pressed before the final RAF tick fires.
    flushRepeat();
    commitRecording(createLoopSequence, getActiveBpm() ?? undefined);
  }, [commitRecording, getActiveBpm, flushRepeat]);

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
        showLiveOverlay={isRecording && !!sequence}
        loopDuration={
          isRecording && !sequence && isPlaying && masterDuration > 0
            ? masterDuration
            : undefined
        }
        automation={sequence?.automation}
        liveAutomation={liveAutomationEvents}
        color={color}
      />
    ),
    [
      isRecording,
      isPlaying,
      sequence,
      currentMusicalMs,
      playheadX,
      windowWidth,
      visualNotes,
      masterDuration,
      color,
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

  const handleOpenEditor = useCallback(() => {
    if (!sequence) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setEditorOpen(true);
  }, [sequence]);

  const handleCloseEditor = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setEditorOpen(false);
  }, []);

  // Close editor when sequence is deleted
  const handleDeleteSequence = useCallback(() => {
    setEditorOpen(false);
    deleteSequence();
  }, [deleteSequence]);

  return (
    <>
      {/* MidiVisualizer strip — tap to open/close editor */}
      <Pressable
        onPress={editorOpen ? handleCloseEditor : handleOpenEditor}
      >
        {MemoizedVisualizer}
      </Pressable>

      {editorOpen && sequence ? (
        /* ── MIDI Editor mode ────────────────────────────────────────── */
        <View
          style={styles.gridContainer}
          onLayout={(e) => setEditorHeight(e.nativeEvent.layout.height)}
        >
          <MidiEditor
            sequence={sequence}
            channel={channel}
            color={color}
            width={windowWidth}
            height={editorHeight}
            currentMusicalMs={currentMusicalMs}
            onClose={handleCloseEditor}
          />
        </View>
      ) : (
        /* ── Normal pad mode ─────────────────────────────────────────── */
        <>
          <View style={styles.gridContainer}>
            <Grid
              ref={gridRef}
              color={color}
              gridNotes={gridNotes}
              rows={rows}
              cols={cols}
              gridSize={gridSize}
              useScale={useScale}
              scaleNotes={scaleNotes}
              onNoteOn={handlePadNoteOn}
              onNoteOff={handleNoteOff}
            />
            <View style={[styles.sequenceInfo, { backgroundColor: color }]}>
              {sequenceInfo && (
                <Text style={styles.sequenceInfoText}>
                  BPM: {sequenceInfo.bpm} | Bars: {sequenceInfo.bars} | Duration:{' '}
                  {sequenceInfo.duration}s | Confidence: {sequenceInfo.confidence}%
                </Text>
              )}
            </View>
            <TouchableOpacity
              style={[
                styles.repeatToggleButton,
                noteRepeatMode !== 'off' && {
                  backgroundColor: color,
                },
              ]}
              onPress={() => setShowRepeatSelector(prev => !prev)}
            >
              <Text style={styles.repeatToggleText}>
                {noteRepeatMode === 'off' ? 'RPT' : noteRepeatMode}
              </Text>
            </TouchableOpacity>
            <NoteRepeatSelector
              color={color}
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
                  onPress={handleDeleteSequence}
                >
                  <Text style={styles.footerButtonText}>DELETE</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </>
      )}
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
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
    backgroundColor: '#2a2a2a',
    borderTopWidth: 1,
    borderColor: '#444',
    alignItems: 'center',
  },
  repeatToggleActive: {},
  repeatToggleText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  sequenceInfo: {
    paddingHorizontal: 16,
    justifyContent: 'center',
    height: 20,
  },
  sequenceInfoText: {
    color: '#ffffff',
    fontSize: 12,
    fontFamily: 'monospace',
    textShadowColor: 'rgba(0, 0, 0, 0.9)',
    textShadowOffset: { width: -1, height: 1 },
    textShadowRadius: 10,
    lineHeight: 20,
    textAlign: 'center',
    textAlignVertical: 'center'
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
