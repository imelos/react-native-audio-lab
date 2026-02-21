import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Props } from '../navigation/Navigation';
import GlobalSequencer from '../features/music-pad/hooks/GlobalSequencer';
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

const createDefaultChannels = (): Channel[] => [
  { id: 1, name: 'Synth 1', color: CHANNEL_COLORS[0] },
  { id: 2, name: 'Synth 2', color: CHANNEL_COLORS[1] },
  { id: 3, name: 'Synth 3', color: CHANNEL_COLORS[2] },
];

const SessionScreen: React.FC<Props<'session'>> = ({ navigation }) => {
  const [channels, setChannels] = useState<Channel[]>(createDefaultChannels);
  const [nextChannelId, setNextChannelId] = useState(4);
  const [sequences, setSequences] = useState<Map<number, LoopSequence>>(
    new Map(),
  );
  const sequencer = useMemo(() => GlobalSequencer.getInstance(), []);

  // Subscribe to sequence changes from GlobalSequencer
  useEffect(() => {
    // Seed initial state
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

  const ROW_COUNT = 4;

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

                  // Row 0: show recorded sequence preview or "+" to add
                  if (rowIndex === 0) {
                    if (seq) {
                      return (
                        <TouchableOpacity
                          key={`${ch.id}-${rowIndex}`}
                          style={[
                            styles.clipCell,
                            styles.clipFilled,
                            {
                              backgroundColor: ch.color + '33',
                              borderColor: ch.color,
                            },
                          ]}
                          onPress={() =>
                            navigation.navigate('synth', { channelId: ch.id, color: ch.color })
                          }
                        >
                          <MidiVisualizer
                            width={CELL_WIDTH - 2}
                            height={CELL_HEIGHT - 2}
                            sequence={seq}
                          />
                        </TouchableOpacity>
                      );
                    }

                    return (
                      <TouchableOpacity
                        key={`${ch.id}-${rowIndex}`}
                        style={styles.clipCell}
                        onPress={() =>
                          navigation.navigate('synth', { channelId: ch.id, color: ch.color })
                        }
                      >
                        <View
                          style={[
                            styles.addClipInner,
                            { borderColor: ch.color + '66' },
                          ]}
                        >
                          <Text
                            style={[styles.addClipText, { color: ch.color }]}
                          >
                            +
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  }

                  // Remaining rows: empty slots
                  return (
                    <View key={`${ch.id}-${rowIndex}`} style={styles.clipCell}>
                      <View style={styles.emptySlot} />
                    </View>
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

const CELL_WIDTH = 110;
const CELL_HEIGHT = 70;

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
  addClipInner: {
    width: '100%',
    height: '100%',
    borderRadius: 6,
    borderWidth: 1,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addClipText: {
    fontSize: 28,
    fontWeight: '300',
  },
  emptySlot: {
    width: '100%',
    height: '100%',
    borderRadius: 6,
    backgroundColor: '#1a1a1a',
  },
  addChannelSpacer: {
    width: 44,
    marginHorizontal: 3,
  },
});
