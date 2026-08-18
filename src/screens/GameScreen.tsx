import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  Vibration,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  GameState,
  IN_BASE,
  Move,
  Point,
  applyMove,
  chooseMove,
  dicePoint,
  isTokenInDanger,
  roll,
  tokenPoint,
  tokensHome,
} from '../engine';
import { Career, Settings } from '../state/storage';
import { PLAYER_COLORS, colors, radius, shadow } from '../theme/theme';
import { Backdrop } from '../components/Backdrop';
import { Board, boardPixel, boardUnit } from '../components/Board';
import { DiceTray } from '../components/DiceTray';
import { PAWN_ANCHOR_Y, PAWN_RATIO, Pawn } from '../components/Pawn';
import { WinnerOverlay } from '../components/WinnerOverlay';
import { Sheet } from '../components/Sheet';
import { Button, Divider } from '../components/ui';
import { FairnessSheet, RulesSheet, SettingsSheet } from '../components/sheets';
import { layoutPawns, pawnKey } from '../components/pawnLayout';

const wait = (ms: number) =>
  new Promise<void>(resolve => setTimeout(resolve, ms));

const run = (animation: Animated.CompositeAnimation) =>
  new Promise<void>(resolve => animation.start(() => resolve()));

export interface GameScreenProps {
  initial: GameState;
  settings: Settings;
  career: Career;
  onPersist: (state: GameState) => void;
  onRollTallied: (face: number) => void;
  onGameOver: (state: GameState) => void;
  onExit: () => void;
  onRematch: () => void;
  onSettingsChange: (settings: Settings) => void;
}

export const GameScreen = ({
  initial,
  settings,
  career,
  onPersist,
  onRollTallied,
  onGameOver,
  onExit,
  onRematch,
  onSettingsChange,
}: GameScreenProps) => {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const [state, setState] = useState<GameState>(initial);
  const [busy, setBusy] = useState(false);
  const [moves, setMoves] = useState<Move[]>([]);
  const [displayFace, setDisplayFace] = useState<number>(initial.die ?? 6);
  const [rolling, setRolling] = useState(false);
  /** last value each seat rolled, so idle trays keep showing it */
  const [lastFaces, setLastFaces] = useState<number[]>(() =>
    initial.players.map(() => 6),
  );
  const [message, setMessage] = useState<string | null>(null);
  const [sheet, setSheet] = useState<
    'none' | 'menu' | 'settings' | 'rules' | 'fair'
  >('none');

  const stateRef = useRef(state);
  stateRef.current = state;
  const busyRef = useRef(false);
  const flickerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mounted = useRef(true);

  const speed = settings.fastAnimations ? 0.62 : 1;
  const stepMs = Math.round(120 * speed);
  const rollMs = Math.round(760 * speed);
  const thinkMs = Math.round(620 * speed);

  // Reserve room for the header pill and the player strip (which wraps onto a
  // second row in a 4 player game), then keep the board square.
  const boardSize = Math.max(
    220,
    Math.min(width - 20, height - insets.top - insets.bottom - 244),
  );
  const unit = boardUnit(boardSize);
  const pawnHeight = unit * 1.34;
  const pawnWidth = pawnHeight * PAWN_RATIO;
  const traySize = unit * 2.25;

  /** Board point -> top-left offset of a pawn view. */
  const toOffset = useCallback(
    (point: Point) => {
      const pixel = boardPixel(boardSize, point);
      return {
        x: pixel.x - pawnWidth / 2,
        y: pixel.y - pawnHeight * PAWN_ANCHOR_Y,
      };
    },
    [boardSize, pawnHeight, pawnWidth],
  );

  // One animated value per pawn, created once and reused for the whole game.
  const anims = useRef<
    Record<
      string,
      { xy: Animated.ValueXY; lift: Animated.Value; scale: Animated.Value }
    >
  >({});
  const ensureAnim = useCallback((key: string) => {
    if (!anims.current[key]) {
      anims.current[key] = {
        xy: new Animated.ValueXY({ x: 0, y: 0 }),
        lift: new Animated.Value(0),
        scale: new Animated.Value(1),
      };
    }
    return anims.current[key];
  }, []);

  const syncPositions = useCallback(
    (next: GameState, animate: boolean) => {
      const placements = layoutPawns(next);
      Object.entries(placements).forEach(([key, placement]) => {
        const anim = ensureAnim(key);
        const offset = toOffset(placement.point);
        if (animate) {
          Animated.parallel([
            Animated.spring(anim.xy, {
              toValue: offset,
              friction: 8,
              tension: 90,
              useNativeDriver: true,
            }),
            Animated.spring(anim.scale, {
              toValue: placement.scale,
              friction: 7,
              tension: 120,
              useNativeDriver: true,
            }),
          ]).start();
        } else {
          anim.xy.setValue(offset);
          anim.scale.setValue(placement.scale);
        }
      });
    },
    [ensureAnim, toOffset],
  );

  // Snap everything into place on mount and whenever the board is resized.
  useEffect(() => {
    syncPositions(stateRef.current, false);
  }, [syncPositions, boardSize]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (flickerRef.current) {
        clearInterval(flickerRef.current);
      }
    };
  }, []);

  const buzz = useCallback(
    (ms: number) => {
      if (settings.vibrate) {
        Vibration.vibrate(ms);
      }
    },
    [settings.vibrate],
  );

  const flash = useCallback(async (text: string, ms: number) => {
    setMessage(text);
    await wait(ms);
    if (mounted.current) {
      setMessage(null);
    }
  }, []);

  /** Walk a pawn cell by cell, with a small hop on every step. */
  const walk = useCallback(
    async (key: string, points: Point[]) => {
      const anim = ensureAnim(key);
      for (const point of points) {
        const offset = toOffset(point);
        await run(
          Animated.parallel([
            Animated.timing(anim.xy, {
              toValue: offset,
              duration: stepMs,
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.sequence([
              Animated.timing(anim.lift, {
                toValue: 1,
                duration: stepMs / 2,
                easing: Easing.out(Easing.quad),
                useNativeDriver: true,
              }),
              Animated.timing(anim.lift, {
                toValue: 0,
                duration: stepMs / 2,
                easing: Easing.in(Easing.quad),
                useNativeDriver: true,
              }),
            ]),
          ]),
        );
      }
    },
    [ensureAnim, stepMs, toOffset],
  );

  const performMove = useCallback(
    async (base: GameState, move: Move) => {
      const player = base.players[base.turn];
      const color = player.color;
      setMoves([]);

      const points: Point[] = [];
      if (move.from === IN_BASE) {
        points.push(tokenPoint(color, 0, move.token));
      } else {
        for (let step = move.from + 1; step <= move.to; step++) {
          points.push(tokenPoint(color, step, move.token));
        }
      }
      await walk(pawnKey(base.turn, move.token), points);

      const applied = applyMove(base, move);
      stateRef.current = applied.state;
      setState(applied.state);
      syncPositions(applied.state, true);

      if (move.captures.length > 0) {
        buzz(45);
        const names = move.captures
          .map(([victim]) => PLAYER_COLORS[base.players[victim].color].label)
          .join(', ');
        await flash(`${player.name} knocked out ${names}!`, 900 * speed);
      } else if (move.finishes) {
        buzz(30);
        await flash(`${player.name} brought a pawn home!`, 800 * speed);
      }

      const ranked = applied.events.find(event => event.type === 'rank');
      if (ranked && ranked.type === 'rank') {
        await flash(
          `${applied.state.players[ranked.player].name} finished ${
            ['1st', '2nd', '3rd', '4th'][ranked.rank - 1]
          }!`,
          1100 * speed,
        );
      }
      const extra = applied.events.find(event => event.type === 'extraTurn');
      if (extra && applied.state.phase !== 'over') {
        await flash('Extra roll!', 620 * speed);
      }
    },
    [buzz, flash, speed, syncPositions, walk],
  );

  const doRoll = useCallback(async () => {
    const current = stateRef.current;
    if (busyRef.current || current.phase !== 'roll') {
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setRolling(true);
    buzz(12);

    const result = roll(current);
    const rolled = result.events.find(event => event.type === 'roll');
    const face = rolled && rolled.type === 'roll' ? rolled.die : 6;

    flickerRef.current = setInterval(() => {
      setDisplayFace(1 + Math.floor(Math.random() * 6));
    }, 68);
    await wait(rollMs);
    if (flickerRef.current) {
      clearInterval(flickerRef.current);
      flickerRef.current = null;
    }
    if (!mounted.current) {
      return;
    }
    setDisplayFace(face);
    setRolling(false);
    setLastFaces(previous =>
      previous.map((value, index) => (index === current.turn ? face : value)),
    );
    onRollTallied(face);

    stateRef.current = result.state;
    setState(result.state);

    if (result.moves.length === 0) {
      const forfeit = result.events.find(event => event.type === 'forfeit');
      const reason =
        forfeit && forfeit.type === 'forfeit' && forfeit.reason === 'threeSixes'
          ? 'Three sixes - turn passes on'
          : `No legal move with a ${face}`;
      await flash(reason, 950 * speed);
      busyRef.current = false;
      if (mounted.current) {
        setBusy(false);
      }
      return;
    }

    const player = result.state.players[result.state.turn];
    const auto =
      player.type === 'cpu' ||
      (settings.autoMoveSingle && result.moves.length === 1);

    if (auto) {
      let move = result.moves[0];
      let nextState = result.state;
      if (player.type === 'cpu') {
        await wait(thinkMs);
        const choice = chooseMove(
          result.state,
          result.moves,
          face,
          result.state.rng,
        );
        move = choice.move;
        nextState = { ...result.state, rng: choice.rng };
        stateRef.current = nextState;
      }
      await performMove(nextState, move);
      busyRef.current = false;
      if (mounted.current) {
        setBusy(false);
      }
      return;
    }

    setMoves(result.moves);
    busyRef.current = false;
    setBusy(false);
  }, [
    buzz,
    flash,
    onRollTallied,
    performMove,
    rollMs,
    settings.autoMoveSingle,
    speed,
    thinkMs,
  ]);

  // Drive the CPU, and report the final state once the game is decided.
  useEffect(() => {
    if (state.phase === 'over') {
      onGameOver(state);
      return;
    }
    if (busy || state.phase !== 'roll') {
      return;
    }
    const player = state.players[state.turn];
    if (player.type !== 'cpu') {
      return;
    }
    const timer = setTimeout(() => {
      doRoll();
    }, thinkMs);
    return () => clearTimeout(timer);
  }, [state, busy, doRoll, onGameOver, thinkMs]);

  // Autosave whenever the board settles between turns.
  useEffect(() => {
    if (!busy && state.phase !== 'over') {
      onPersist(state);
    }
  }, [state, busy, onPersist]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (sheet !== 'none') {
          setSheet('none');
        } else {
          setSheet('menu');
        }
        return true;
      },
    );
    return () => subscription.remove();
  }, [sheet]);

  const player = state.players[state.turn];
  const humanTurn = player.type === 'human';
  const canRoll = !busy && state.phase === 'roll' && humanTurn;
  const movableTokens = useMemo(
    () => new Set(moves.map(move => move.token)),
    [moves],
  );

  const onPawnPress = useCallback(
    (playerIndex: number, token: number) => {
      if (busyRef.current || playerIndex !== stateRef.current.turn) {
        return;
      }
      const move = moves.find(candidate => candidate.token === token);
      if (!move) {
        return;
      }
      busyRef.current = true;
      setBusy(true);
      buzz(10);
      performMove(stateRef.current, move).then(() => {
        busyRef.current = false;
        if (mounted.current) {
          setBusy(false);
        }
      });
    },
    [buzz, moves, performMove],
  );

  const banner = message
    ? message
    : state.phase === 'over'
    ? 'Game over'
    : busy
    ? `${player.name} is playing...`
    : humanTurn
    ? state.phase === 'select'
      ? `You rolled ${state.die} - pick a pawn`
      : 'Tap your dice to roll'
    : `${player.name}'s turn`;

  const destinations = moves.map(move => {
    const point = tokenPoint(player.color, move.to, move.token);
    return { key: `${move.token}-${move.to}`, point };
  });

  return (
    <Backdrop>
      <View style={[styles.root, { paddingTop: insets.top + 6 }]}>
        <View style={styles.header}>
          <Pressable
            onPress={() => setSheet('menu')}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Game menu"
            style={styles.iconButton}
          >
            <View style={styles.burgerLine} />
            <View style={styles.burgerLine} />
            <View style={styles.burgerLine} />
          </Pressable>

          <View
            style={[
              styles.turnPill,
              { borderColor: `${PLAYER_COLORS[player.color].base}AA` },
            ]}
          >
            <View
              style={[
                styles.turnDot,
                { backgroundColor: PLAYER_COLORS[player.color].base },
              ]}
            />
            <Text style={styles.turnText} numberOfLines={1}>
              {banner}
            </Text>
          </View>

          <Pressable
            onPress={() => setSheet('fair')}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Dice fairness"
            style={styles.iconButton}
          >
            <Text style={styles.iconGlyph}>⚄</Text>
          </Pressable>
        </View>

        <View
          style={[styles.boardWrap, { width: boardSize, height: boardSize }]}
        >
          <Board size={boardSize} seated={state.players.map(p => p.color)} />

          {destinations.map(target => {
            const pixel = boardPixel(boardSize, target.point);
            return (
              <View
                key={target.key}
                pointerEvents="none"
                style={[
                  styles.destination,
                  {
                    left: pixel.x - unit * 0.42,
                    top: pixel.y - unit * 0.42,
                    width: unit * 0.84,
                    height: unit * 0.84,
                    borderRadius: unit * 0.42,
                    borderColor: PLAYER_COLORS[player.color].base,
                  },
                ]}
              />
            );
          })}

          {state.players.map((seat, playerIndex) =>
            seat.tokens.map((steps, token) => {
              const key = pawnKey(playerIndex, token);
              const anim = ensureAnim(key);
              const isCurrent = playerIndex === state.turn;
              const movable =
                isCurrent && humanTurn && movableTokens.has(token) && !busy;
              const danger =
                settings.showHints &&
                seat.type === 'human' &&
                isTokenInDanger(state, playerIndex, steps);
              const lift = anim.lift.interpolate({
                inputRange: [0, 1],
                outputRange: [0, -unit * 0.42],
              });
              return (
                <Animated.View
                  key={key}
                  style={[
                    styles.pawn,
                    {
                      width: pawnWidth,
                      height: pawnHeight,
                      zIndex: isCurrent ? 20 : 10,
                      transform: [
                        { translateX: anim.xy.x },
                        { translateY: Animated.add(anim.xy.y, lift) },
                        { scale: anim.scale },
                      ],
                    },
                  ]}
                >
                  <Pressable
                    onPress={() => onPawnPress(playerIndex, token)}
                    disabled={!movable}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel={`${seat.name} pawn ${token + 1}`}
                  >
                    <Pawn
                      color={seat.color}
                      height={pawnHeight}
                      highlighted={movable && settings.showHints}
                      threatened={danger}
                    />
                  </Pressable>
                </Animated.View>
              );
            }),
          )}

          {state.players.map((seat, playerIndex) => {
            const point = dicePoint(seat.color);
            const pixel = boardPixel(boardSize, point);
            const active = playerIndex === state.turn && state.phase !== 'over';
            return (
              <View
                key={`tray-${seat.color}`}
                style={[
                  styles.tray,
                  {
                    left: pixel.x - traySize / 2,
                    top: pixel.y - traySize / 2,
                    zIndex: active ? 30 : 5,
                  },
                ]}
              >
                <DiceTray
                  color={seat.color}
                  size={traySize}
                  face={active ? displayFace : lastFaces[playerIndex] ?? 6}
                  active={active}
                  rolling={active && rolling}
                  interactive={active && canRoll}
                  onPress={doRoll}
                />
              </View>
            );
          })}
        </View>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 10 }]}>
          {state.players.map((seat, index) => {
            const active = index === state.turn && state.phase !== 'over';
            return (
              <View
                key={seat.color}
                style={[
                  styles.playerChip,
                  active && {
                    borderColor: PLAYER_COLORS[seat.color].base,
                    backgroundColor: `${PLAYER_COLORS[seat.color].base}22`,
                  },
                ]}
              >
                <View
                  style={[
                    styles.chipDot,
                    { backgroundColor: PLAYER_COLORS[seat.color].base },
                  ]}
                />
                <Text style={styles.chipName} numberOfLines={1}>
                  {seat.name}
                </Text>
                <Text style={styles.chipMeta}>
                  {seat.rank ? `#${seat.rank}` : `${tokensHome(seat)}/4`}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      <Sheet
        visible={sheet === 'menu'}
        title="Paused"
        onClose={() => setSheet('none')}
      >
        <Button label="Resume game" onPress={() => setSheet('none')} />
        <View style={styles.menuGap} />
        <Button
          label="Settings"
          variant="secondary"
          compact
          onPress={() => setSheet('settings')}
        />
        <View style={styles.menuGap} />
        <Button
          label="How to play"
          variant="secondary"
          compact
          onPress={() => setSheet('rules')}
        />
        <View style={styles.menuGap} />
        <Button
          label="Fair dice"
          variant="secondary"
          compact
          onPress={() => setSheet('fair')}
        />
        <Divider />
        <Button
          label="Save and quit to menu"
          variant="ghost"
          compact
          onPress={() => {
            onPersist(stateRef.current);
            setSheet('none');
            onExit();
          }}
        />
      </Sheet>

      <SettingsSheet
        visible={sheet === 'settings'}
        settings={settings}
        onChange={onSettingsChange}
        onClose={() => setSheet('menu')}
      />
      <RulesSheet
        visible={sheet === 'rules'}
        onClose={() => setSheet('menu')}
      />
      <FairnessSheet
        visible={sheet === 'fair'}
        career={career}
        stats={state.stats}
        playerNames={state.players.map(seat => seat.name)}
        onClose={() => setSheet('none')}
      />

      <WinnerOverlay
        visible={state.phase === 'over'}
        state={state}
        onRematch={onRematch}
        onHome={onExit}
      />
    </Backdrop>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  burgerLine: {
    width: 16,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.text,
    marginVertical: 2,
  },
  iconGlyph: { color: colors.text, fontSize: 20 },
  turnPill: {
    flex: 1,
    marginHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
  },
  turnDot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  turnText: { color: colors.text, fontSize: 13.5, fontWeight: '700', flex: 1 },
  boardWrap: { position: 'relative', ...shadow.card },
  pawn: { position: 'absolute', left: 0, top: 0 },
  tray: { position: 'absolute' },
  destination: {
    position: 'absolute',
    borderWidth: 2.5,
    opacity: 0.85,
    zIndex: 15,
  },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingTop: 14,
  },
  playerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    margin: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: 88,
  },
  chipDot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  chipName: { color: colors.text, fontSize: 12.5, fontWeight: '700', flex: 1 },
  chipMeta: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    marginLeft: 6,
  },
  menuGap: { height: 10 },
});
