import React, { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Easing,
  Modal,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { GameState, PlayerState } from '../engine';
import {
  PLAYER_COLORS,
  PieceTheme,
  colors,
  radius,
  shadow,
} from '../theme/theme';
import { Button } from './ui';
import { Pawn } from './Pawn';
import { CountryChip } from './CountryChip';

const CONFETTI_COUNT = 28;

const Confetti = ({ width, height }: { width: number; height: number }) => {
  const pieces = useMemo(
    () =>
      Array.from({ length: CONFETTI_COUNT }, (_, index) => ({
        key: index,
        x: Math.random() * width,
        size: 7 + Math.random() * 9,
        delay: Math.random() * 900,
        duration: 2200 + Math.random() * 1600,
        color: [
          PLAYER_COLORS[0].base,
          PLAYER_COLORS[1].base,
          PLAYER_COLORS[2].base,
          PLAYER_COLORS[3].base,
          colors.accent,
        ][index % 5],
        spin: Math.random() > 0.5 ? 1 : -1,
      })),
    [width],
  );

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map(piece => (
        <Piece key={piece.key} piece={piece} height={height} />
      ))}
    </View>
  );
};

const Piece = ({
  piece,
  height,
}: {
  piece: {
    x: number;
    size: number;
    delay: number;
    duration: number;
    color: string;
    spin: number;
  };
  height: number;
}) => {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(t, {
        toValue: 1,
        duration: piece.duration,
        delay: piece.delay,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [piece.delay, piece.duration, t]);

  const translateY = t.interpolate({
    inputRange: [0, 1],
    outputRange: [-40, height + 40],
  });
  const rotate = t.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', `${piece.spin * 900}deg`],
  });
  const translateX = t.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, piece.spin * 26, 0],
  });
  const opacity = t.interpolate({
    inputRange: [0, 0.1, 0.85, 1],
    outputRange: [0, 1, 1, 0],
  });

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: piece.x,
        width: piece.size,
        height: piece.size * 0.6,
        borderRadius: 2,
        backgroundColor: piece.color,
        opacity,
        transform: [{ translateY }, { translateX }, { rotate }],
      }}
    />
  );
};

const ordinal = (rank: number): string =>
  ['1st', '2nd', '3rd', '4th'][rank - 1] ?? `${rank}th`;

export const WinnerOverlay = ({
  visible,
  state,
  pieceTheme = 'disc',
  onRematch,
  onHome,
}: {
  visible: boolean;
  state: GameState;
  pieceTheme?: PieceTheme;
  onRematch: () => void;
  onHome: () => void;
}) => {
  const { width, height } = useWindowDimensions();
  const enter = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      enter.setValue(0);
      Animated.spring(enter, {
        toValue: 1,
        friction: 6,
        tension: 70,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, enter]);

  const ranked: PlayerState[] = [...state.players].sort(
    (a, b) => (a.rank ?? 99) - (b.rank ?? 99),
  );
  const winner = ranked[0];
  const scale = enter.interpolate({
    inputRange: [0, 1],
    outputRange: [0.8, 1],
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <View style={styles.root}>
        <Confetti width={width} height={height} />
        <Animated.View
          style={[styles.card, { opacity: enter, transform: [{ scale }] }]}
        >
          <Text style={styles.kicker}>Game over</Text>
          <View style={styles.winnerRow}>
            <Pawn
              color={winner.color}
              height={64}
              theme={pieceTheme}
              mood="happy"
            />
            <View style={styles.winnerText}>
              <Text style={styles.winnerName}>{winner.name} wins</Text>
              <Text style={styles.winnerColor}>
                {PLAYER_COLORS[winner.color].label} · all four home
              </Text>
            </View>
          </View>

          <View style={styles.table}>
            {ranked.map(player => (
              <View key={player.color} style={styles.tableRow}>
                <Text style={styles.rank}>{ordinal(player.rank ?? 4)}</Text>
                <View
                  style={[
                    styles.dot,
                    { backgroundColor: PLAYER_COLORS[player.color].base },
                  ]}
                />
                <Text style={styles.playerName}>{player.name}</Text>
                {player.country ? (
                  <CountryChip country={player.country} />
                ) : (
                  <Text style={styles.playerMeta}>
                    {player.type === 'cpu' ? 'CPU' : 'Player'}
                  </Text>
                )}
              </View>
            ))}
          </View>

          <Button label="Play again" onPress={onRematch} />
          <Button
            label="Back to menu"
            onPress={onHome}
            variant="secondary"
            compact
            style={styles.homeButton}
          />
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'rgba(20,3,5,0.86)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surfaceSolid,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 22,
    ...shadow.card,
  },
  kicker: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2.4,
    textTransform: 'uppercase',
  },
  winnerRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  winnerText: { marginLeft: 14, flex: 1 },
  winnerName: { color: colors.text, fontSize: 24, fontWeight: '900' },
  winnerColor: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  table: {
    marginTop: 18,
    marginBottom: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: radius.md,
    padding: 6,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 10,
  },
  rank: {
    width: 40,
    color: colors.accent,
    fontWeight: '900',
    fontSize: 13,
  },
  dot: { width: 12, height: 12, borderRadius: 6, marginRight: 10 },
  playerName: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '700' },
  playerMeta: { color: colors.textFaint, fontSize: 11, fontWeight: '700' },
  homeButton: { marginTop: 10 },
});
