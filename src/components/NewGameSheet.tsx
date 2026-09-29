/**
 * The "Start game" sheet: pick a mode, set the game up, go.
 *
 * - vs CPU: you against 1-3 CPUs at the skill chosen here (also in Settings).
 * - Pass & Play: 2-4 people taking turns on this device.
 * - Online: you against 1-3 opponents who "join" a match one by one, each
 *   with a player handle and a country flag. They are CPU seats played on
 *   hard - nothing leaves the device.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  ALL_COLORS,
  ColorId,
  Difficulty,
  GameMode,
  SeatConfig,
} from '../engine';
import { OnlineIdentity, pickOpponents } from '../state/online';
import { PLAYER_COLORS, colors, radius } from '../theme/theme';
import { Sheet } from './Sheet';
import { GradientFill, Pill, SectionTitle, Segmented } from './ui';
import { CountryChip } from './CountryChip';
import {
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconRobot,
  IconDice,
  IconWifi,
  IconWifiOff,
  IconUsers,
} from './Icons';

const MODES: Array<{
  id: GameMode;
  title: string;
  subtitle: string;
  Icon: typeof IconRobot;
  /** still being worked on - tagged BETA in the picker */
  beta?: boolean;
}> = [
  {
    id: 'cpu',
    title: 'vs CPU',
    subtitle: 'Play against the computer',
    Icon: IconRobot,
  },
  {
    id: 'local',
    title: 'Pass & Play',
    subtitle: 'Take turns on this phone',
    Icon: IconUsers,
  },
  {
    id: 'online',
    title: 'Online',
    subtitle: 'Quick matches against new opponents',
    Icon: IconWifi,
    beta: true,
  },
];

const TITLES: Record<GameMode, string> = {
  cpu: 'vs CPU',
  local: 'Pass & Play',
  online: 'Online · Beta',
};

const COUNTS = [
  { value: 2, label: '2 Players', sub: '1 vs 1' },
  { value: 3, label: '3 Players', sub: 'Free for all' },
  { value: 4, label: '4 Players', sub: 'Everyone' },
];

/** Default names for the seats of a vs CPU or Pass & Play game. */
const seatName = (mode: GameMode, index: number) => {
  if (mode === 'local') {
    return `Player ${index + 1}`;
  }
  if (index === 0) {
    return 'You';
  }
  return index === 1 ? 'CPU' : `CPU ${index}`;
};

/** How long each opponent takes to "join", and the pause once all have. */
const joinDelay = (first: boolean) =>
  (first ? 900 : 500) + Math.random() * 1000;
const MATCHED_MS = 800;

export interface NewGameSheetProps {
  visible: boolean;
  onClose: () => void;
  /** colour of each seat, seat 0 being you (or player 1) */
  seats: ColorId[];
  onSeatsChange: (seats: ColorId[]) => void;
  difficulty: Difficulty;
  onDifficultyChange: (difficulty: Difficulty) => void;
  onStart: (seats: SeatConfig[], mode: GameMode) => void;
  /** device connectivity - Online mode needs it */
  online?: boolean;
}

export const NewGameSheet = ({
  visible,
  onClose,
  seats,
  onSeatsChange,
  difficulty,
  onDifficultyChange,
  onStart,
  online = true,
}: NewGameSheetProps) => {
  const [mode, setMode] = useState<GameMode | null>(null);
  /** online matchmaking: an identity per opponent seat, null while searching */
  const [lobby, setLobby] = useState<Array<OnlineIdentity | null> | null>(null);
  const [matched, setMatched] = useState(false);
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  useEffect(() => clearTimers, []);

  // Every visit starts at the mode picker.
  useEffect(() => {
    if (visible) {
      setMode(null);
    }
  }, [visible]);

  const close = () => {
    clearTimers();
    setLobby(null);
    setMatched(false);
    onClose();
  };

  const setCount = (count: number) => {
    if (count === seats.length) {
      return;
    }
    if (count < seats.length) {
      onSeatsChange(seats.slice(0, count));
      return;
    }
    const next = seats.slice();
    for (const color of ALL_COLORS) {
      if (next.length < count && !next.includes(color)) {
        next.push(color);
      }
    }
    onSeatsChange(next);
  };

  /** Picking a colour another seat holds simply swaps the two. */
  const setColor = (index: number, color: ColorId) => {
    const holder = seats.indexOf(color);
    onSeatsChange(
      seats.map((seat, i) => {
        if (i === index) {
          return color;
        }
        return i === holder ? seats[index] : seat;
      }),
    );
  };

  const begin = (chosen: GameMode, identities?: OnlineIdentity[]) => {
    const configs: SeatConfig[] = seats.map((color, index) => {
      if (chosen === 'local') {
        return { color, type: 'human', name: seatName(chosen, index) };
      }
      if (index === 0) {
        return { color, type: 'human', name: 'You' };
      }
      const identity = identities?.[index - 1];
      return identity
        ? { color, type: 'cpu', name: identity.name, country: identity.country }
        : { color, type: 'cpu', name: seatName(chosen, index) };
    });
    close();
    onStart(configs, chosen);
  };

  /** Opponents turn up one at a time, then the match starts. */
  const findMatch = () => {
    clearTimers();
    const identities = pickOpponents(seats.length - 1);
    setMatched(false);
    setLobby(identities.map(() => null));
    let at = 0;
    identities.forEach((identity, i) => {
      at += joinDelay(i === 0);
      timers.current.push(
        setTimeout(
          () =>
            setLobby(current =>
              current
                ? current.map((slot, j) => (j === i ? identity : slot))
                : current,
            ),
          at,
        ),
      );
    });
    timers.current.push(setTimeout(() => setMatched(true), at + 150));
    timers.current.push(
      setTimeout(() => begin('online', identities), at + 150 + MATCHED_MS),
    );
  };

  const cancelMatch = () => {
    clearTimers();
    setLobby(null);
    setMatched(false);
  };

  // Losing the connection mid-search calls the search off (a match that
  // has already been found goes ahead).
  const cancelRef = useRef(cancelMatch);
  cancelRef.current = cancelMatch;
  useEffect(() => {
    if (!online && lobby && !matched) {
      cancelRef.current();
    }
  }, [online, lobby, matched]);
  const offlineOnline = mode === 'online' && !online;

  const title = lobby
    ? matched
      ? 'Match found!'
      : 'Finding players...'
    : mode
    ? TITLES[mode]
    : 'New game';

  return (
    <Sheet visible={visible} title={title} onClose={close}>
      {lobby ? (
        <Lobby
          you={seats[0]}
          opponents={lobby}
          colors={seats.slice(1)}
          matched={matched}
          onCancel={cancelMatch}
        />
      ) : mode === null ? (
        <View>
          {MODES.map(({ id, title: label, subtitle, Icon, beta }) => {
            const unavailable = id === 'online' && !online;
            return (
              <Pressable
                key={id}
                onPress={() => setMode(id)}
                disabled={unavailable}
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityState={{ disabled: unavailable }}
                accessibilityHint={
                  unavailable ? 'Unavailable while offline' : undefined
                }
                style={[styles.modeTile, unavailable && styles.unavailable]}
              >
                <View style={styles.modeIcon}>
                  {unavailable ? (
                    <IconWifiOff color={colors.textMuted} size={26} />
                  ) : (
                    <Icon color={colors.text} size={26} />
                  )}
                </View>
                <View style={styles.modeText}>
                  <View style={styles.modeTitleRow}>
                    <Text style={styles.modeTitle}>{label}</Text>
                    {unavailable ? (
                      <View style={styles.beta}>
                        <Pill label="OFFLINE" tone="danger" />
                      </View>
                    ) : beta ? (
                      <View style={styles.beta}>
                        <Pill label="BETA" tone="accent" />
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.modeSubtitle}>
                    {unavailable
                      ? 'Unavailable offline - connect to play'
                      : subtitle}
                  </Text>
                </View>
                {unavailable ? null : (
                  <IconChevronRight color={colors.textMuted} size={22} />
                )}
              </Pressable>
            );
          })}
        </View>
      ) : (
        <View>
          <Pressable
            onPress={() => setMode(null)}
            accessibilityRole="button"
            accessibilityLabel="Back to modes"
            hitSlop={8}
            style={styles.back}
          >
            <IconChevronLeft color={colors.textMuted} size={18} />
            <Text style={styles.backText}>Modes</Text>
          </Pressable>

          <SectionTitle style={styles.section}>Players</SectionTitle>
          <View style={styles.countTabs}>
            {COUNTS.map(option => {
              const selected = seats.length === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => setCount(option.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={[styles.countTab, selected && styles.countTabSelected]}
                >
                  <IconUsers
                    color={selected ? colors.text : colors.textMuted}
                    size={18}
                  />
                  <Text
                    style={[
                      styles.countLabel,
                      selected && styles.countLabelSelected,
                    ]}
                  >
                    {option.label}
                  </Text>
                  <Text style={styles.countSub}>{option.sub}</Text>
                </Pressable>
              );
            })}
          </View>

          {mode === 'local' ? (
            seats.map((color, index) => (
              <SeatColors
                key={index}
                label={seatName(mode, index)}
                seat={index}
                seats={seats}
                onPick={setColor}
              />
            ))
          ) : (
            <>
              <SeatColors
                label="Your colour"
                seat={0}
                seats={seats}
                onPick={setColor}
              />
              {mode === 'cpu' ? (
                <>
                  <SectionTitle style={styles.section}>CPU skill</SectionTitle>
                  <Segmented<Difficulty>
                    options={[
                      { value: 'easy', label: 'Easy' },
                      { value: 'normal', label: 'Normal' },
                      { value: 'hard', label: 'Hard' },
                    ]}
                    value={difficulty}
                    onChange={onDifficultyChange}
                  />
                </>
              ) : null}
            </>
          )}

          <Pressable
            onPress={() => (mode === 'online' ? findMatch() : begin(mode))}
            disabled={offlineOnline}
            accessibilityRole="button"
            accessibilityState={{ disabled: offlineOnline }}
            style={[styles.play, offlineOnline && styles.unavailable]}
          >
            <View style={StyleSheet.absoluteFill}>
              <GradientFill
                from={colors.primary}
                to={colors.primaryDeep}
                angle="horizontal"
              />
            </View>
            {offlineOnline ? (
              <IconWifiOff color={colors.onPrimary} size={28} />
            ) : mode === 'online' ? (
              <IconWifi color={colors.onPrimary} size={28} />
            ) : (
              <IconDice color={colors.onPrimary} size={30} />
            )}
            <Text style={styles.playText}>
              {offlineOnline
                ? "You're offline"
                : mode === 'online'
                ? 'Find match'
                : 'Play'}
            </Text>
            <IconChevronRight color={colors.onPrimary} size={24} />
          </Pressable>
        </View>
      )}
    </Sheet>
  );
};

/** A seat's colour picker. */
const SeatColors = ({
  label,
  seat,
  seats,
  onPick,
}: {
  label: string;
  seat: number;
  seats: ColorId[];
  onPick: (seat: number, color: ColorId) => void;
}) => {
  const palette = PLAYER_COLORS[seats[seat]];
  return (
    <View style={[styles.seatCard, { borderColor: `${palette.base}66` }]}>
      <View style={styles.seatTop}>
        <View style={[styles.seatDot, { backgroundColor: palette.base }]} />
        <Text style={styles.seatName}>{label}</Text>
        <Text style={[styles.seatColor, { color: palette.base }]}>
          {palette.label}
        </Text>
      </View>
      <View style={styles.swatchRow}>
        {ALL_COLORS.map(color => {
          const holder = seats.indexOf(color);
          return (
            <Pressable
              key={color}
              onPress={() => onPick(seat, color)}
              accessibilityRole="button"
              accessibilityLabel={`${PLAYER_COLORS[color].label} for ${label}`}
              style={[
                styles.swatch,
                {
                  backgroundColor: PLAYER_COLORS[color].base,
                  opacity: holder >= 0 && holder !== seat ? 0.3 : 1,
                },
              ]}
            >
              {color === seats[seat] ? (
                <IconCheck color="#fff" size={20} />
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};

/** The matchmaking list: you, then each opponent as they join. */
const Lobby = ({
  you,
  opponents,
  colors: seatColors,
  matched,
  onCancel,
}: {
  you: ColorId;
  opponents: Array<OnlineIdentity | null>;
  colors: ColorId[];
  matched: boolean;
  onCancel: () => void;
}) => (
  <View>
    <LobbyRow color={you} name="You" status="Ready" />
    {opponents.map((identity, i) =>
      identity ? (
        <LobbyRow
          key={i}
          color={seatColors[i]}
          name={identity.name}
          country={identity.country}
          status="Joined"
        />
      ) : (
        <View key={i} style={[styles.lobbyRow, styles.lobbyWaiting]}>
          <ActivityIndicator color={colors.textMuted} size="small" />
          <Text style={styles.lobbySearching}>Searching...</Text>
        </View>
      ),
    )}
    {matched ? (
      <Text style={styles.lobbyNote}>Starting the game...</Text>
    ) : (
      <Pressable
        onPress={onCancel}
        accessibilityRole="button"
        style={styles.cancel}
      >
        <Text style={styles.cancelText}>Cancel</Text>
      </Pressable>
    )}
  </View>
);

const LobbyRow = ({
  color,
  name,
  country,
  status,
}: {
  color: ColorId;
  name: string;
  country?: string;
  status: string;
}) => (
  <View
    style={[styles.lobbyRow, { borderColor: `${PLAYER_COLORS[color].base}66` }]}
  >
    <View
      style={[styles.seatDot, { backgroundColor: PLAYER_COLORS[color].base }]}
    />
    <Text style={styles.lobbyName} numberOfLines={1}>
      {name}
    </Text>
    {country ? <CountryChip country={country} /> : null}
    <View style={styles.lobbyStatus}>
      <IconCheck color={colors.accent} size={14} />
      <Text style={styles.lobbyStatusText}>{status}</Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  modeTile: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    marginBottom: 12,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modeIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceStrong,
    marginRight: 14,
  },
  modeText: { flex: 1 },
  modeTitleRow: { flexDirection: 'row', alignItems: 'center' },
  modeTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
  beta: { marginLeft: 8 },
  unavailable: { opacity: 0.5 },
  modeSubtitle: { color: colors.textMuted, fontSize: 12.5, marginTop: 3 },
  back: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start' },
  backText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 2,
  },
  section: { marginTop: 16, marginBottom: 8 },
  countTabs: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: radius.lg,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 14,
  },
  countTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: radius.md,
  },
  countTabSelected: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  countLabel: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '800',
    marginTop: 6,
  },
  countLabelSelected: { color: colors.text },
  countSub: { color: colors.textFaint, fontSize: 10, marginTop: 2 },
  seatCard: {
    borderRadius: radius.lg,
    borderWidth: 1.5,
    padding: 14,
    marginBottom: 12,
  },
  seatTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  seatDot: { width: 14, height: 14, borderRadius: 7, marginRight: 10 },
  seatName: { color: colors.text, fontSize: 16, fontWeight: '800', flex: 1 },
  seatColor: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  swatchRow: { flexDirection: 'row', justifyContent: 'space-between' },
  swatch: {
    flex: 1,
    height: 38,
    marginHorizontal: 4,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  play: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 28,
    overflow: 'hidden',
    paddingHorizontal: 24,
    paddingVertical: 14,
    marginTop: 18,
  },
  playText: {
    color: colors.onPrimary,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  lobbyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 10,
  },
  lobbyWaiting: { borderStyle: 'dashed', justifyContent: 'center' },
  lobbyName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
    flexShrink: 1,
    marginRight: 8,
  },
  lobbyStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 'auto',
  },
  lobbyStatusText: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 4,
  },
  lobbySearching: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 10,
  },
  lobbyNote: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
  },
  cancel: {
    alignSelf: 'center',
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 8,
  },
  cancelText: { color: colors.text, fontSize: 14, fontWeight: '700' },
});
