import React, { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ALL_COLORS,
  ColorId,
  GameState,
  SeatConfig,
  SeatType,
  tokensHome,
} from '../engine';
import { Career, Settings } from '../state/storage';
import { PLAYER_COLORS, colors, radius, shadow } from '../theme/theme';
import { Backdrop } from '../components/Backdrop';
import { Board } from '../components/Board';
import { Logo } from '../components/Logo';
import { Button, Card, SectionTitle, Segmented } from '../components/ui';
import { FairnessSheet, RulesSheet, SettingsSheet } from '../components/sheets';

interface SeatDraft {
  color: ColorId;
  type: SeatType;
}

/** The landing screen opens on a ready-to-play 1 human + 1 CPU game. */
const DEFAULT_SEATS: SeatDraft[] = [
  { color: ColorId.Red, type: 'human' },
  { color: ColorId.Yellow, type: 'cpu' },
];

const seatNames = (seats: SeatDraft[]): string[] => {
  let humans = 0;
  let cpus = 0;
  return seats.map(seat => {
    if (seat.type === 'human') {
      humans += 1;
      return humans === 1 ? 'You' : `Player ${humans}`;
    }
    cpus += 1;
    return cpus === 1 ? 'CPU' : `CPU ${cpus}`;
  });
};

export interface HomeScreenProps {
  saved: GameState | null;
  settings: Settings;
  career: Career;
  onSettingsChange: (settings: Settings) => void;
  onStart: (seats: SeatConfig[]) => void;
  onResume: () => void;
  onDiscardSave: () => void;
}

export const HomeScreen = ({
  saved,
  settings,
  career,
  onSettingsChange,
  onStart,
  onResume,
  onDiscardSave,
}: HomeScreenProps) => {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [seats, setSeats] = useState<SeatDraft[]>(DEFAULT_SEATS);
  const [sheet, setSheet] = useState<'none' | 'rules' | 'settings' | 'fair'>(
    'none',
  );

  const names = useMemo(() => seatNames(seats), [seats]);
  const seated = seats.map(seat => seat.color);
  const previewSize = Math.min(width * 0.52, 220);

  const setCount = (count: number) => {
    setSeats(current => {
      if (count === current.length) {
        return current;
      }
      if (count < current.length) {
        return current.slice(0, count);
      }
      const used = new Set(current.map(seat => seat.color));
      const next = current.slice();
      for (const color of ALL_COLORS) {
        if (next.length >= count) {
          break;
        }
        if (!used.has(color)) {
          next.push({ color, type: 'cpu' });
          used.add(color);
        }
      }
      return next;
    });
  };

  const setType = (index: number, type: SeatType) =>
    setSeats(current =>
      current.map((seat, i) => (i === index ? { ...seat, type } : seat)),
    );

  /** Picking a colour another seat holds simply swaps the two. */
  const setColor = (index: number, color: ColorId) =>
    setSeats(current => {
      const holder = current.findIndex(seat => seat.color === color);
      return current.map((seat, i) => {
        if (i === index) {
          return { ...seat, color };
        }
        if (i === holder) {
          return { ...seat, color: current[index].color };
        }
        return seat;
      });
    });

  const start = () =>
    onStart(
      seats.map((seat, index) => ({
        color: seat.color,
        type: seat.type,
        name: names[index],
      })),
    );

  return (
    <Backdrop>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 28 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Logo size={54} />
          <View style={styles.headerText}>
            <Text style={styles.title}>NICE LUDO</Text>
            <Text style={styles.subtitle}>Fair dice · offline · no ads</Text>
          </View>
        </View>

        <View style={styles.preview}>
          <Board size={previewSize} seated={seated} />
        </View>

        {saved ? (
          <Card style={styles.resumeCard}>
            <View style={styles.resumeRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.resumeTitle}>Continue last game</Text>
                <Text style={styles.resumeMeta}>
                  {`${saved.players.length} players · turn ${saved.turnCount} · ` +
                    saved.players
                      .map(
                        p =>
                          `${PLAYER_COLORS[p.color].label} ${tokensHome(p)}/4`,
                      )
                      .join('  ')}
                </Text>
              </View>
              <Pressable
                onPress={onDiscardSave}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Discard saved game"
                style={styles.discard}
              >
                <Text style={styles.discardText}>✕</Text>
              </Pressable>
            </View>
            <Button
              label="Resume"
              onPress={onResume}
              variant="secondary"
              compact
              style={styles.resumeButton}
            />
          </Card>
        ) : null}

        <SectionTitle style={styles.sectionSpacing}>Players</SectionTitle>
        <Segmented<number>
          options={[
            { value: 2, label: '2 Players' },
            { value: 3, label: '3 Players' },
            { value: 4, label: '4 Players' },
          ]}
          value={seats.length}
          onChange={setCount}
        />

        <View style={styles.seatList}>
          {seats.map((seat, index) => {
            const palette = PLAYER_COLORS[seat.color];
            return (
              <View
                key={index}
                style={[styles.seatCard, { borderColor: `${palette.base}66` }]}
              >
                <View style={styles.seatTop}>
                  <View
                    style={[styles.seatDot, { backgroundColor: palette.base }]}
                  />
                  <Text style={styles.seatName}>{names[index]}</Text>
                  <Text style={styles.seatColor}>{palette.label}</Text>
                </View>

                <View style={styles.seatControls}>
                  <Segmented<SeatType>
                    options={[
                      { value: 'human', label: 'Pass & play' },
                      { value: 'cpu', label: 'CPU' },
                    ]}
                    value={seat.type}
                    onChange={type => setType(index, type)}
                    style={styles.seatSegmented}
                  />
                  <View style={styles.swatchRow}>
                    {ALL_COLORS.map(color => {
                      const selected = seat.color === color;
                      const takenBy = seats.findIndex(s => s.color === color);
                      return (
                        <Pressable
                          key={color}
                          onPress={() => setColor(index, color)}
                          accessibilityRole="button"
                          accessibilityLabel={`${PLAYER_COLORS[color].label} for ${names[index]}`}
                          style={[
                            styles.swatch,
                            {
                              backgroundColor: PLAYER_COLORS[color].base,
                              borderColor: selected
                                ? '#FFFFFF'
                                : 'rgba(255,255,255,0.18)',
                              opacity:
                                takenBy >= 0 && takenBy !== index ? 0.45 : 1,
                            },
                            selected && styles.swatchSelected,
                          ]}
                        />
                      );
                    })}
                  </View>
                </View>
              </View>
            );
          })}
        </View>

        <Button label="Start game" onPress={start} style={styles.play} />

        <View style={styles.footer}>
          {[
            { key: 'rules', label: 'How to play' },
            { key: 'fair', label: 'Fair dice' },
            { key: 'settings', label: 'Settings' },
          ].map(item => (
            <Pressable
              key={item.key}
              onPress={() => setSheet(item.key as typeof sheet)}
              accessibilityRole="button"
              style={styles.footerButton}
            >
              <Text style={styles.footerLabel}>{item.label}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.version}>
          {career.gamesFinished > 0
            ? `${career.wins} wins in ${career.gamesFinished} finished games`
            : 'Everything runs on this device. No account, no network.'}
        </Text>
      </ScrollView>

      <RulesSheet
        visible={sheet === 'rules'}
        onClose={() => setSheet('none')}
      />
      <SettingsSheet
        visible={sheet === 'settings'}
        settings={settings}
        onChange={onSettingsChange}
        onClose={() => setSheet('none')}
      />
      <FairnessSheet
        visible={sheet === 'fair'}
        career={career}
        onClose={() => setSheet('none')}
      />
    </Backdrop>
  );
};

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 20 },
  header: { flexDirection: 'row', alignItems: 'center' },
  headerText: { marginLeft: 14 },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 3,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 12,
    letterSpacing: 1,
    marginTop: 2,
  },
  preview: { alignItems: 'center', marginTop: 18, marginBottom: 6 },
  resumeCard: { marginTop: 14 },
  resumeRow: { flexDirection: 'row', alignItems: 'flex-start' },
  resumeTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  resumeMeta: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 4,
    lineHeight: 17,
  },
  resumeButton: { marginTop: 12 },
  discard: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceStrong,
  },
  discardText: { color: colors.textMuted, fontWeight: '800' },
  sectionSpacing: { marginTop: 22 },
  seatList: { marginTop: 14 },
  seatCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
    ...shadow.soft,
  },
  seatTop: { flexDirection: 'row', alignItems: 'center' },
  seatDot: { width: 14, height: 14, borderRadius: 7, marginRight: 10 },
  seatName: { color: colors.text, fontSize: 16, fontWeight: '800', flex: 1 },
  seatColor: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  seatControls: { marginTop: 12 },
  seatSegmented: { marginBottom: 12 },
  swatchRow: { flexDirection: 'row', justifyContent: 'space-between' },
  swatch: {
    flex: 1,
    height: 34,
    marginHorizontal: 4,
    borderRadius: radius.sm,
    borderWidth: 2,
  },
  swatchSelected: { borderWidth: 3, transform: [{ scale: 1.06 }] },
  play: { marginTop: 8 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 18,
  },
  footerButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    marginHorizontal: 4,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  footerLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  version: {
    color: colors.textFaint,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 18,
  },
});
