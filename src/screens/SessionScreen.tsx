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
  const [sequences, setSequences] = useState<Map<number, LoopSequence>>(
    new Map(),
  );
  const [playbackByChannel, setPlaybackByChannel] = useState<
    Map<number, ChannelPlaybackSnapshot>
  >(new Map());
  const sequencer = useMemo(() => GlobalSequencer.getInstance(), []);
  const longPressTriggeredChannelsRef = useRef<Set<number>>(new Set());

  const navigateToChannelSynth = useCallback(
    (channel: Channel) => {
      navigation.navigate('synth', {
        channelId: channel.id,
        color: channel.color,
      });
    },
    [navigation],
  );

  const launchClip = useCallback(
    (channelId: number) => {
      sequencer.launchChannelClip(channelId);
    },
    [sequencer],
  );

  const handleClipPress = useCallback(
    (channelId: number) => {
      if (longPressTriggeredChannelsRef.current.has(channelId)) {
        longPressTriggeredChannelsRef.current.delete(channelId);
        return;
      }
      launchClip(channelId);
    },
    [launchClip],
  );

  const handleClipLongPress = useCallback(
    (channel: Channel) => {
      longPressTriggeredChannelsRef.current.add(channel.id);
      navigateToChannelSynth(channel);
    },
    [navigateToChannelSynth],
  );

  const stopChannel = useCallback(
    (channelId: number) => {
      sequencer.stopChannelClips(channelId);
    },
    [sequencer],
  );

  const startNewClipRecording = useCallback(
    (channel: Channel) => {
      if (sequencer.getSequence(channel.id)) {
        sequencer.setSequence(channel.id, null);
        if (!sequencer.hasAnySequence()) {
          sequencer.stop();
        }
      }
      navigateToChannelSynth(channel);
    },
    [navigateToChannelSynth, sequencer],
  );

  // Subscribe to sequence changes from GlobalSequencer.
  useEffect(() => {
    // Seed initial state.
    const initial = new Map<number, LoopSequence>();
    sequencer.getActiveChannels().forEach(ch => {
      const seq = sequencer.getSequence(ch);
      if (seq) initial.set(ch, seq);
    });
    if (initial.size > 0) setSequences(initial);

    return sequencer.onChannelSequence((ch, seq) => {
      setSequences(prev => {
        const next = new Map(prev);
        if (seq) {
          next.set(ch, seq);
        } else {
          next.delete(ch);
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
                  const seq = sequences.get(ch.id);
                  const playback =
                    playbackByChannel.get(ch.id) ?? EMPTY_PLAYBACK_SNAPSHOT;
                  const isChannelPlaying = playback.isPlayingNow;
                  const showStopButton = isChannelPlaying;

                  // Row 0: existing clip (launch/restart), otherwise add/stop controls.
                  if (rowIndex === 0 && seq) {
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
                          isChannelPlaying && styles.clipPlaying,
                          playback.isQueuedToLaunch && styles.clipQueued,
                          {
                            backgroundColor: ch.color + '33',
                            borderColor: ch.color,
                          },
                        ]}
                        onPress={() => handleClipPress(ch.id)}
                        onLongPress={() => handleClipLongPress(ch)}
                        delayLongPress={1000}
                      >
                        <MidiVisualizer
                          width={CELL_WIDTH - 2}
                          height={CELL_HEIGHT - 2}
                          sequence={seq}
                          color={ch.color}
                        />
                        {isChannelPlaying && (
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
                        <Text style={styles.stopText}>⏹</Text>
                      </TouchableOpacity>
                    );
                  }

                  return (
                    <TouchableOpacity
                      key={`${ch.id}-${rowIndex}`}
                      style={styles.clipCell}
                      onPress={() => startNewClipRecording(ch)}
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
    fontSize: 24,
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
