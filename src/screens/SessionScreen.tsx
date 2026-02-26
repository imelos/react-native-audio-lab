import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Props } from '../navigation/Navigation';
import GlobalSequencer, {
  ChannelPlaybackSnapshot,
} from '../features/music-pad/hooks/GlobalSequencer';
import { MidiVisualizer } from '../features/music-pad/midi-visualiser/MidiVisualiser';
import { LoopSequence } from '../features/music-pad/utils/loopUtils';

interface Channel {
  id: number;
  name: string;
  color: string;
}

const CHANNEL_COLORS = [
  '#6200ee',
  '#03dac6',
  '#cf6679',
  '#bb86fc',
  '#018786',
  '#f4511e',
  '#ffb300',
  '#43a047',
];

const CELL_WIDTH = 110;
const CELL_HEIGHT = 70;
const ROW_COUNT = 4;
const PLAYBACK_POLL_MS = 50;

const EMPTY_PLAYBACK_SNAPSHOT: ChannelPlaybackSnapshot = {
  hasSequence: false,
  isLaunched: false,
  isPlayingNow: false,
  isQueuedToLaunch: false,
  isQueuedToStop: false,
  loopTimeMs: 0,
  loopDurationMs: 0,
  progress: 0,
};

const createDefaultChannels = (): Channel[] => [
  { id: 1, name: 'Synth 1', color: CHANNEL_COLORS[0] },
  { id: 2, name: 'Synth 2', color: CHANNEL_COLORS[1] },
  { id: 3, name: 'Synth 3', color: CHANNEL_COLORS[2] },
];

const slotKey = (channelId: number, slotIndex: number): string =>
  `${channelId}:${slotIndex}`;

const toProgressPercent = (value: number): number =>
  Math.round(Math.max(0, Math.min(1, value)) * 100);

const hasPlaybackSnapshotChanged = (
  prev: ChannelPlaybackSnapshot | undefined,
  next: ChannelPlaybackSnapshot,
): boolean => {
  if (!prev) return true;
  return (
    prev.hasSequence !== next.hasSequence ||
    prev.isLaunched !== next.isLaunched ||
    prev.isPlayingNow !== next.isPlayingNow ||
    prev.isQueuedToLaunch !== next.isQueuedToLaunch ||
    prev.isQueuedToStop !== next.isQueuedToStop ||
    toProgressPercent(prev.progress) !== toProgressPercent(next.progress)
  );
};

const SessionScreen: React.FC<Props<'session'>> = ({ navigation }) => {
  const [channels, setChannels] = useState<Channel[]>(createDefaultChannels);
  const [nextChannelId, setNextChannelId] = useState(4);
  const [slotSequences, setSlotSequences] = useState<Map<string, LoopSequence>>(
    new Map(),
  );
  const slotSequencesRef = useRef<Map<string, LoopSequence>>(new Map());
  const [activeSlotByChannel, setActiveSlotByChannel] = useState<
    Map<number, number>
  >(new Map());
  const activeSlotByChannelRef = useRef<Map<number, number>>(new Map());
  const [playbackByChannel, setPlaybackByChannel] = useState<
    Map<number, ChannelPlaybackSnapshot>
  >(new Map());
  const sequencer = useMemo(() => GlobalSequencer.getInstance(), []);
  const longPressTriggeredChannelsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    slotSequencesRef.current = slotSequences;
  }, [slotSequences]);

  const setActiveSlot = useCallback((channelId: number, slotIndex: number) => {
    const nextRef = new Map(activeSlotByChannelRef.current);
    nextRef.set(channelId, slotIndex);
    activeSlotByChannelRef.current = nextRef;

    setActiveSlotByChannel(prev => {
      const current = prev.get(channelId);
      if (current === slotIndex) return prev;
      const next = new Map(prev);
      next.set(channelId, slotIndex);
      return next;
    });
  }, []);

  const getActiveSlot = useCallback(
    (channelId: number): number => activeSlotByChannel.get(channelId) ?? 0,
    [activeSlotByChannel],
  );

  const navigateToChannelSynth = useCallback(
    (channel: Channel) => {
      navigation.navigate('synth', {
        channelId: channel.id,
        color: channel.color,
      });
    },
    [navigation],
  );

  const handleClipPress = useCallback(
    (channel: Channel, slotIndex: number) => {
      if (longPressTriggeredChannelsRef.current.has(channel.id)) {
        longPressTriggeredChannelsRef.current.delete(channel.id);
        return;
      }
      const targetSequence = slotSequencesRef.current.get(
        slotKey(channel.id, slotIndex),
      );
      if (!targetSequence) return;

      setActiveSlot(channel.id, slotIndex);
      sequencer.launchChannelSequence(channel.id, targetSequence);
    },
    [sequencer, setActiveSlot],
  );

  const handleClipLongPress = useCallback(
    (channel: Channel, slotIndex: number) => {
      longPressTriggeredChannelsRef.current.add(channel.id);
      setActiveSlot(channel.id, slotIndex);
      const targetSequence = slotSequencesRef.current.get(
        slotKey(channel.id, slotIndex),
      );
      if (
        targetSequence &&
        sequencer.getSequence(channel.id) !== targetSequence
      ) {
        sequencer.setSequence(channel.id, targetSequence);
      }
      navigateToChannelSynth(channel);
    },
    [navigateToChannelSynth, sequencer, setActiveSlot],
  );

  const stopChannel = useCallback(
    (channelId: number) => {
      sequencer.stopChannelClips(channelId);
    },
    [sequencer],
  );

  const startNewClipRecording = useCallback(
    (channel: Channel, slotIndex: number) => {
      setActiveSlot(channel.id, slotIndex);
      if (sequencer.getSequence(channel.id) != null) {
        sequencer.setSequence(channel.id, null);
      }
      if (!sequencer.hasAnySequence()) {
        sequencer.stop();
      }
      navigateToChannelSynth(channel);
    },
    [navigateToChannelSynth, sequencer, setActiveSlot],
  );

  // Subscribe to sequence changes from GlobalSequencer.
  useEffect(() => {
    // Seed initial state.
    const initialSlots = new Map<string, LoopSequence>();
    const initialActive = new Map<number, number>();
    sequencer.getActiveChannels().forEach(ch => {
      const seq = sequencer.getSequence(ch);
      if (seq) {
        initialSlots.set(slotKey(ch, 0), seq);
      }
      initialActive.set(ch, 0);
    });
    if (initialSlots.size > 0) {
      slotSequencesRef.current = initialSlots;
      setSlotSequences(initialSlots);
    }
    if (initialActive.size > 0) {
      activeSlotByChannelRef.current = initialActive;
      setActiveSlotByChannel(initialActive);
    }

    return sequencer.onChannelSequence((ch, seq) => {
      const targetSlot = activeSlotByChannelRef.current.get(ch) ?? 0;
      setSlotSequences(prev => {
        const next = new Map(prev);
        const key = slotKey(ch, targetSlot);
        if (seq) {
          next.set(key, seq);
        } else {
          next.delete(key);
        }
        return next;
      });
    });
  }, [sequencer]);

  // Poll channel playback state to drive Session clip launch/stop UI + playheads.
  useEffect(() => {
    const updatePlayback = () => {
      setPlaybackByChannel(prev => {
        let changed = false;
        const next = new Map<number, ChannelPlaybackSnapshot>();

        channels.forEach(ch => {
          const snapshot = sequencer.getChannelPlaybackSnapshot(ch.id);
          next.set(ch.id, snapshot);
          if (hasPlaybackSnapshotChanged(prev.get(ch.id), snapshot)) {
            changed = true;
          }
        });

        if (prev.size !== next.size) changed = true;
        return changed ? next : prev;
      });
    };

    updatePlayback();
    const interval = setInterval(updatePlayback, PLAYBACK_POLL_MS);
    return () => clearInterval(interval);
  }, [channels, sequencer]);

  const addChannel = () => {
    const id = nextChannelId;
    setNextChannelId(id + 1);
    setActiveSlot(id, 0);
    setChannels(prev => [
      ...prev,
      {
        id,
        name: `Synth ${id}`,
        color: CHANNEL_COLORS[(id - 1) % CHANNEL_COLORS.length],
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Session</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.gridScrollContent}
      >
        <View style={styles.grid}>
          {/* Channel headers */}
          <View style={styles.headerRow}>
            {channels.map(ch => (
              <View
                key={ch.id}
                style={[styles.channelHeader, { borderBottomColor: ch.color }]}
              >
                <Text style={styles.channelName} numberOfLines={1}>
                  {ch.name}
                </Text>
                <Text style={styles.channelId}>Ch {ch.id}</Text>
              </View>
            ))}
            {/* Add channel button in header */}
            <TouchableOpacity
              style={styles.addChannelButton}
              onPress={addChannel}
            >
              <Text style={styles.addChannelText}>+</Text>
            </TouchableOpacity>
          </View>

          {/* Clip grid rows */}
          <ScrollView showsVerticalScrollIndicator={false}>
            {Array.from({ length: ROW_COUNT }).map((_, rowIndex) => (
              <View key={rowIndex} style={styles.clipRow}>
                {channels.map(ch => {
                  const slotSequence = slotSequences.get(
                    slotKey(ch.id, rowIndex),
                  );
                  const playback =
                    playbackByChannel.get(ch.id) ?? EMPTY_PLAYBACK_SNAPSHOT;
                  const isChannelPlaying = playback.isPlayingNow;
                  const showStopButton = isChannelPlaying;
                  const isActiveSlot = getActiveSlot(ch.id) === rowIndex;

                  if (slotSequence) {
                    const playheadLeft = Math.max(
                      0,
                      Math.min(
                        CELL_WIDTH - 4,
                        playback.progress * (CELL_WIDTH - 2) - 1,
                      ),
                    );

                    return (
                      <TouchableOpacity
                        key={`${ch.id}-${rowIndex}`}
                        style={[
                          styles.clipCell,
                          styles.clipFilled,
                          isChannelPlaying &&
                            isActiveSlot &&
                            styles.clipPlaying,
                          playback.isQueuedToLaunch && styles.clipQueued,
                          {
                            backgroundColor: ch.color + '33',
                            borderColor: ch.color,
                          },
                        ]}
                        onPress={() => handleClipPress(ch, rowIndex)}
                        onLongPress={() => handleClipLongPress(ch, rowIndex)}
                        delayLongPress={1000}
                      >
                        <MidiVisualizer
                          width={CELL_WIDTH - 2}
                          height={CELL_HEIGHT - 2}
                          sequence={slotSequence}
                          color={ch.color}
                        />
                        {isChannelPlaying && isActiveSlot && (
                          <View
                            pointerEvents="none"
                            style={[styles.playhead, { left: playheadLeft }]}
                          />
                        )}
                      </TouchableOpacity>
                    );
                  }

                  if (showStopButton) {
                    return (
                      <TouchableOpacity
                        key={`${ch.id}-${rowIndex}`}
                        style={[
                          styles.clipCell,
                          styles.stopCell,
                          { borderColor: ch.color + '99' },
                        ]}
                        onPress={() => stopChannel(ch.id)}
                      >
                        <Text style={[styles.stopText, { color: ch.color }]}>
                          ■
                        </Text>
                      </TouchableOpacity>
                    );
                  }

                  return (
                    <TouchableOpacity
                      key={`${ch.id}-${rowIndex}`}
                      style={styles.clipCell}
                      onPress={() => startNewClipRecording(ch, rowIndex)}
                    >
                      <View
                        style={[
                          styles.addClipInner,
                          { borderColor: ch.color + '66' },
                        ]}
                      >
                        <Text style={[styles.addClipText, { color: ch.color }]}>
                          +
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
                {/* Spacer for add-channel column */}
                <View style={styles.addChannelSpacer} />
              </View>
            ))}
          </ScrollView>
        </View>
      </ScrollView>
    </View>
  );
};

export default SessionScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  header: {
    paddingTop: 60,
    paddingBottom: 16,
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 32,
    color: '#ffffff',
    fontWeight: 'bold',
  },
  gridScrollContent: {
    paddingHorizontal: 12,
  },
  grid: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  channelHeader: {
    width: CELL_WIDTH,
    marginHorizontal: 3,
    paddingVertical: 10,
    paddingHorizontal: 8,
    backgroundColor: '#1e1e1e',
    borderRadius: 8,
    borderBottomWidth: 3,
    alignItems: 'center',
  },
  channelName: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  channelId: {
    color: '#888',
    fontSize: 11,
    marginTop: 2,
  },
  addChannelButton: {
    width: 44,
    marginHorizontal: 3,
    backgroundColor: '#1e1e1e',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addChannelText: {
    color: '#888',
    fontSize: 24,
    fontWeight: '300',
  },
  clipRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  clipCell: {
    width: CELL_WIDTH,
    height: CELL_HEIGHT,
    marginHorizontal: 3,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  clipFilled: {
    borderWidth: 1,
    overflow: 'hidden',
  },
  clipPlaying: {
    borderWidth: 2,
    shadowColor: '#ffffff',
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  clipQueued: {
    opacity: 0.85,
  },
  playhead: {
    position: 'absolute',
    top: 2,
    bottom: 2,
    width: 2,
    backgroundColor: '#ffffff',
    opacity: 0.9,
  },
  stopCell: {
    backgroundColor: '#211618',
    borderWidth: 1,
  },
  stopText: {
    color: '#ff6b6b',
    fontSize: 22,
    fontWeight: '600',
  },
  addClipInner: {
    width: '100%',
    height: '100%',
    borderRadius: 6,
    borderWidth: 1,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#171717',
  },
  addClipText: {
    fontSize: 28,
    fontWeight: '300',
  },
  addChannelSpacer: {
    width: 44,
    marginHorizontal: 3,
  },
});
