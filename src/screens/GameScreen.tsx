import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AccessibilityInfo,
  Animated,
  BackHandler,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ALL_COLORS,
  CORNER_OF,
  ColorId,
  Corner,
  GameState,
  IN_BASE,
  Move,
  Point,
  applyMove,
  chooseMove,
  isTokenInDanger,
  legalMoves,
  roll,
  tokenPoint,
} from '../engine';
import { Career, Settings } from '../state/storage';
import { PLAYER_COLORS, colors, shadow } from '../theme/theme';
import { Backdrop } from '../components/Backdrop';
import { BOARD_PAD, Board, boardPixel, boardUnit } from '../components/Board';
import { DiceTray } from '../components/DiceTray';
import { PIECE_GEOMETRY, Pawn } from '../components/Pawn';
import { WinnerOverlay } from '../components/WinnerOverlay';
import { Sheet } from '../components/Sheet';
import { Button, Divider } from '../components/ui';
import { FairnessSheet, RulesSheet, SettingsSheet } from '../components/sheets';
import { layoutPawns, pawnKey } from '../components/pawnLayout';
import { Mood } from '../components/eyes';
import { sfx } from '../audio/sfx';
import { haptics } from '../audio/haptics';
import { flagOf } from '../state/online';
import {
  Swing,
  SwingFx,
  SwingPawn,
  WebFx,
  createSwing,
  createYank,
} from '../components/webSwing';
import { Burst, BurstKind, HeroBurst, runBurst } from '../components/heroFx';

const wait = (ms: number) =>
  new Promise<void>(resolve => setTimeout(resolve, ms));

/** Let React commit newly bound animated styles before driving them. */
const nextFrame = () =>
  new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

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
  /**
   * Animation lab: no taps, no CPU turns, nothing saved or tallied. The lab
   * drives the board through the handle it gets in `demo.api`.
   */
  demo?: { api: React.MutableRefObject<GameDemo | null> };
}

/** Scripted control of a demo board, for the animation lab. */
export interface GameDemo {
  /** jump straight to a board, with every piece snapped into place */
  reset: (state: GameState) => void;
  /** play the roll animation for the current seat, landing on `face` */
  roll: (face: number) => Promise<void>;
  /** move a token of the current seat by `die`; false if that isn't legal */
  move: (token: number, die: number) => Promise<boolean>;
  /** force every piece's eyes into one mood (null hands back control) */
  setMood: (mood: Mood | null) => void;
  /** the board as it stands */
  current: () => GameState;
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
  demo,
}: GameScreenProps) => {
  const isDemo = !!demo;
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
  /** Spider: pieces bound to a swing or yank, and the webs on screen */
  const [swinging, setSwinging] = useState<Record<string, SwingPawn>>({});
  const [webFxs, setWebFxs] = useState<SwingFx[]>([]);
  /** Spider: capture and home-run bursts, and pieces in a web cocoon */
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [webbed, setWebbed] = useState<Record<string, boolean>>({});
  const burstId = useRef(0);
  /** Spider: short-lived expressions (moving, happy, hurt) per pawn key */
  const [moods, setMoods] = useState<Record<string, Mood>>({});
  /** Animation lab: one mood for every piece, overriding the rest */
  const [forcedMood, setForcedMood] = useState<Mood | null>(null);
  const moodTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [sheet, setSheet] = useState<
    'none' | 'menu' | 'settings' | 'rules' | 'fair' | 'leave'
  >('none');

  const stateRef = useRef(state);
  stateRef.current = state;
  const busyRef = useRef(false);
  /** resolves the roll in progress once its tray has finished tumbling */
  const tumbleDone = useRef<(() => void) | null>(null);
  const mounted = useRef(true);

  const speed = settings.fastAnimations ? 0.62 : 1;
  const stepMs = Math.round(120 * speed);
  const rollMs = Math.round(760 * speed);
  const thinkMs = Math.round(620 * speed);
  // "Online" opponents take a human-looking, uneven time over each turn.
  const online = state.mode === 'online';
  const thinkFor = useCallback(
    () =>
      online ? Math.round(thinkMs * (0.9 + Math.random() * 1.6)) : thinkMs,
    [online, thinkMs],
  );

  // Full-width board with dice in rows above and below
  const boardSize = Math.max(220, width - 8);
  const unit = boardUnit(boardSize);
  const traySize = Math.max(76, Math.min(boardSize * 0.22, 90));
  const pieceTheme = settings.pieceTheme;
  const geometry = PIECE_GEOMETRY[pieceTheme];
  const pawnHeight = unit * geometry.cells;
  const pawnWidth = pawnHeight * geometry.ratio;
  const pawnAnchorY = geometry.anchorY;

  /** Board point -> top-left offset of a pawn view. */
  const toOffset = useCallback(
    (point: Point) => {
      const pixel = boardPixel(boardSize, point);
      return {
        x: pixel.x - pawnWidth / 2,
        y: pixel.y - pawnHeight * pawnAnchorY,
      };
    },
    [boardSize, pawnHeight, pawnWidth, pawnAnchorY],
  );

  // One animated value per pawn, created once and reused for the whole game.
  const anims = useRef<
    Record<
      string,
      {
        xy: Animated.ValueXY;
        lift: Animated.Value;
        scale: Animated.Value;
        /** stomps, squashes and victory pulses, multiplied into scale */
        pop: Animated.Value;
        /** victory twirl, in degrees */
        spin: Animated.Value;
      }
    >
  >({});
  const ensureAnim = useCallback((key: string) => {
    if (!anims.current[key]) {
      anims.current[key] = {
        xy: new Animated.ValueXY({ x: 0, y: 0 }),
        lift: new Animated.Value(0),
        scale: new Animated.Value(1),
        pop: new Animated.Value(1),
        spin: new Animated.Value(0),
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
      tumbleDone.current?.();
    };
  }, []);

  /** Set a pawn's expression; with `ms` it lapses back on its own. */
  const setMood = useCallback((key: string, mood: Mood | null, ms?: number) => {
    clearTimeout(moodTimers.current[key]);
    const clear = () =>
      setMoods(current => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    if (mood === null) {
      clear();
      return;
    }
    setMoods(current => ({ ...current, [key]: mood }));
    if (ms) {
      moodTimers.current[key] = setTimeout(clear, ms);
    }
  }, []);
  useEffect(() => {
    const timers = moodTimers.current;
    return () => Object.values(timers).forEach(clearTimeout);
  }, []);

  /** Captures, home runs and finishes: announced, then a beat to take it in. */
  const flash = useCallback(async (text: string, ms: number) => {
    AccessibilityInfo.announceForAccessibility(text);
    await wait(ms);
  }, []);

  /** Walk a pawn cell by cell, with a small hop on every step. */
  const walk = useCallback(
    async (key: string, points: Point[]) => {
      const anim = ensureAnim(key);
      for (const point of points) {
        const offset = toOffset(point);
        sfx.step();
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

  const bindSwing = useCallback((key: string, swing: Swing) => {
    setSwinging(current => ({ ...current, [key]: swing.pawn }));
    setWebFxs(current => [...current, swing.fx]);
  }, []);
  const unbindSwing = useCallback((key: string) => {
    setSwinging(current => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }, []);
  const dropWebFx = useCallback((fx: SwingFx) => {
    if (mounted.current) {
      setWebFxs(current => current.filter(item => item !== fx));
    }
  }, []);

  /** Play a Spider burst at a board point; resolves when it has finished. */
  const burst = useCallback(
    (kind: BurstKind, point: Point, color: ColorId) => {
      const pixel = boardPixel(boardSize, point);
      const item: Burst = {
        id: ++burstId.current,
        kind,
        x: pixel.x,
        y: pixel.y,
        unit,
        palette: PLAYER_COLORS[color],
        progress: new Animated.Value(0),
      };
      setBursts(current => [...current, item]);
      return new Promise<void>(resolve =>
        runBurst(item, speed).start(() => {
          if (mounted.current) {
            setBursts(current => current.filter(b => b !== item));
          }
          resolve();
        }),
      );
    },
    [boardSize, speed, unit],
  );

  /**
   * Spider capture: the attacker stomps, a web splat bursts, the victims
   * are cocooned and then yanked home by a thread from their own yard.
   */
  const webCapture = useCallback(
    async (
      attacker: string,
      at: Point,
      color: ColorId,
      victims: Array<{ key: string; from: Point; to: Point; color: ColorId }>,
    ) => {
      const stomp = ensureAnim(attacker).pop;
      Animated.sequence([
        Animated.timing(stomp, {
          toValue: 1.3,
          duration: Math.round(110 * speed),
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(stomp, {
          toValue: 0.84,
          duration: Math.round(90 * speed),
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.spring(stomp, {
          toValue: 1,
          friction: 4,
          tension: 160,
          useNativeDriver: true,
        }),
      ]).start();
      burst('impact', at, color);
      sfx.stomp();
      sfx.splat(40);
      await wait(200 * speed);

      // cocooned: each victim flinches as the web wraps it
      setWebbed(current => {
        const next = { ...current };
        victims.forEach(v => (next[v.key] = true));
        return next;
      });
      victims.forEach(v =>
        Animated.sequence([
          Animated.timing(ensureAnim(v.key).pop, {
            toValue: 0.78,
            duration: Math.round(70 * speed),
            useNativeDriver: true,
          }),
          Animated.spring(ensureAnim(v.key).pop, {
            toValue: 1,
            friction: 3,
            tension: 200,
            useNativeDriver: true,
          }),
        ]).start(),
      );
      sfx.wrap();
      await wait(260 * speed);

      const pawnOffset = { x: pawnWidth / 2, y: pawnHeight * pawnAnchorY };
      const yanks = victims.map(v => ({
        ...v,
        yank: createYank({
          from: boardPixel(boardSize, v.from),
          to: boardPixel(boardSize, v.to),
          unit,
          pawnOffset,
          baseScale: ensureAnim(v.key).scale,
          palette: PLAYER_COLORS[v.color],
        }),
      }));
      yanks.forEach(v => bindSwing(v.key, v.yank));
      await nextFrame();
      const time = yanks[0].yank.durations(speed);
      sfx.thwip();
      sfx.whoosh(time.travel, time.shoot + time.tug);
      sfx.land(time.shoot + time.tug + time.travel);
      await Promise.all(yanks.map(v => run(v.yank.shootAndPull(speed))));
      setWebbed(current => {
        const next = { ...current };
        victims.forEach(v => delete next[v.key]);
        return next;
      });
      await Promise.all(yanks.map(v => run(v.yank.release(speed))));
      yanks.forEach(v => {
        ensureAnim(v.key).xy.setValue(toOffset(v.to));
        unbindSwing(v.key);
        dropWebFx(v.yank.fx);
      });
    },
    [
      bindSwing,
      boardSize,
      burst,
      dropWebFx,
      ensureAnim,
      pawnAnchorY,
      pawnHeight,
      pawnWidth,
      speed,
      toOffset,
      unbindSwing,
      unit,
    ],
  );

  /** Spider home run: a web blooms from the centre and the piece twirls. */
  const webHome = useCallback(
    async (key: string, color: ColorId) => {
      const anim = ensureAnim(key);
      anim.spin.setValue(0);
      const party = burst('home', { x: 7.5, y: 7.5 }, color);
      await run(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(anim.lift, {
              toValue: 2.4,
              duration: Math.round(230 * speed),
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(anim.lift, {
              toValue: 0,
              duration: Math.round(420 * speed),
              easing: Easing.bounce,
              useNativeDriver: true,
            }),
          ]),
          Animated.timing(anim.spin, {
            toValue: 360,
            duration: Math.round(560 * speed),
            easing: Easing.inOut(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.sequence([
            Animated.timing(anim.pop, {
              toValue: 1.5,
              duration: Math.round(230 * speed),
              easing: Easing.out(Easing.back(2)),
              useNativeDriver: true,
            }),
            Animated.spring(anim.pop, {
              toValue: 1,
              friction: 4,
              tension: 120,
              useNativeDriver: true,
            }),
          ]),
        ]),
      );
      anim.spin.setValue(0);
      await party;
    },
    [burst, ensureAnim, speed],
  );

  /** Spider: two palms web the destination and reel the piece in. */
  const webSwing = useCallback(
    async (key: string, color: ColorId, start: Point, target: Point) => {
      const anim = ensureAnim(key);
      const swing = createSwing({
        from: boardPixel(boardSize, start),
        to: boardPixel(boardSize, target),
        centre: boardPixel(boardSize, { x: 7.5, y: 7.5 }),
        unit,
        pawnOffset: { x: pawnWidth / 2, y: pawnHeight * pawnAnchorY },
        baseScale: anim.scale,
        palette: PLAYER_COLORS[color],
      });
      bindSwing(key, swing);
      await nextFrame();
      const time = swing.durations(speed);
      sfx.thwip();
      sfx.zip(time.travel, time.shoot + time.tug);
      sfx.land(time.shoot + time.tug + time.travel);
      await run(swing.shootAndPull(speed));
      // Hand the piece back to its own animated position before unbinding.
      anim.xy.setValue(toOffset(target));
      unbindSwing(key);
      swing.release(speed).start(() => dropWebFx(swing.fx));
    },
    [
      bindSwing,
      boardSize,
      dropWebFx,
      ensureAnim,
      pawnAnchorY,
      pawnHeight,
      pawnWidth,
      speed,
      toOffset,
      unbindSwing,
      unit,
    ],
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
      const key = pawnKey(base.turn, move.token);
      setMood(key, 'moving');
      if (move.leavesBase) {
        sfx.pop();
      }
      if (pieceTheme === 'spider') {
        await webSwing(
          key,
          color,
          layoutPawns(base)[key].point,
          points[points.length - 1],
        );
      } else {
        await walk(key, points);
      }

      const applied = applyMove(base, move);
      stateRef.current = applied.state;
      setState(applied.state);

      move.captures.forEach(([victim, token]) =>
        setMood(pawnKey(victim, token), 'hurt', 3000 * speed),
      );
      if (move.captures.length > 0 || move.finishes) {
        setMood(key, 'happy', 2000 * speed);
      } else {
        setMood(key, null);
      }

      const hero = pieceTheme === 'spider';
      if (hero && move.captures.length > 0) {
        const before = layoutPawns(base);
        const after = layoutPawns(applied.state);
        await webCapture(
          key,
          points[points.length - 1],
          color,
          move.captures.map(([victim, token]) => {
            const victimKey = pawnKey(victim, token);
            return {
              key: victimKey,
              from: before[victimKey].point,
              to: after[victimKey].point,
              color: base.players[victim].color,
            };
          }),
        );
      }
      if (!hero && move.captures.length > 0) {
        sfx.stomp();
        sfx.bonk(90);
      }
      if (move.finishes) {
        sfx.home();
      }
      syncPositions(applied.state, true);
      const celebration =
        hero && move.finishes ? webHome(key, color) : Promise.resolve();

      if (move.captures.length > 0) {
        const names = move.captures
          .map(([victim]) => PLAYER_COLORS[base.players[victim].color].label)
          .join(', ');
        await flash(`${player.name} knocked out ${names}!`, 900 * speed);
      } else if (move.finishes) {
        await flash(`${player.name} brought a pawn home!`, 800 * speed);
      }
      await celebration;

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
    [
      flash,
      pieceTheme,
      setMood,
      speed,
      syncPositions,
      walk,
      webCapture,
      webHome,
      webSwing,
    ],
  );

  /**
   * The roll animation alone: the die tumbles through random faces and
   * lands on `face`. Returns false if the screen unmounted meanwhile.
   */
  const playRoll = useCallback(
    async (face: number, turn: number) => {
      // The tray plays the tumble - spin, rattle and face flips on one clock,
      // started once it has rendered - and reports back when it has landed.
      // Waiting on that (not a timer started here) keeps the result from
      // arriving before the die has visibly stopped.
      setDisplayFace(face);
      setRolling(true);
      await new Promise<void>(resolve => {
        const fallback = setTimeout(resolve, rollMs + 1500);
        tumbleDone.current = () => {
          clearTimeout(fallback);
          resolve();
        };
      });
      tumbleDone.current = null;
      if (!mounted.current) {
        return false;
      }
      setDisplayFace(face);
      setRolling(false);
      setLastFaces(previous =>
        previous.map((value, index) => (index === turn ? face : value)),
      );
      return true;
    },
    [rollMs],
  );

  const doRoll = useCallback(async () => {
    const current = stateRef.current;
    if (busyRef.current || current.phase !== 'roll') {
      return;
    }
    busyRef.current = true;
    setBusy(true);

    const result = roll(current);
    const rolled = result.events.find(event => event.type === 'roll');
    const face = rolled && rolled.type === 'roll' ? rolled.die : 6;

    if (!(await playRoll(face, current.turn))) {
      return;
    }
    onRollTallied(face);

    stateRef.current = result.state;
    setState(result.state);

    if (result.moves.length === 0) {
      const forfeit = result.events.find(event => event.type === 'forfeit');
      const reason =
        forfeit && forfeit.type === 'forfeit' && forfeit.reason === 'threeSixes'
          ? 'Three sixes - turn passes on'
          : `No legal move with a ${face}`;
      sfx.nope();
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
        await wait(thinkFor());
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
    flash,
    onRollTallied,
    performMove,
    playRoll,
    settings.autoMoveSingle,
    speed,
    thinkFor,
  ]);

  // Animation lab: hand the lab a scripted remote for this board.
  useEffect(() => {
    if (!demo) {
      return;
    }
    const busyWhile = async <T,>(work: () => Promise<T>) => {
      busyRef.current = true;
      setBusy(true);
      try {
        return await work();
      } finally {
        busyRef.current = false;
        if (mounted.current) {
          setBusy(false);
        }
      }
    };
    demo.api.current = {
      reset: next => {
        stateRef.current = next;
        setState(next);
        setMoves([]);
        setMoods({});
        setWebbed({});
        syncPositions(next, false);
      },
      roll: face =>
        busyWhile(() => playRoll(face, stateRef.current.turn)).then(() => {}),
      move: (token, die) =>
        busyWhile(async () => {
          const base: GameState = {
            ...stateRef.current,
            die,
            phase: 'select',
          };
          const move = legalMoves(base, die).find(m => m.token === token);
          if (!move) {
            return false;
          }
          stateRef.current = base;
          await performMove(base, move);
          return true;
        }),
      setMood: setForcedMood,
      current: () => stateRef.current,
    };
    return () => {
      demo.api.current = null;
    };
  }, [demo, performMove, playRoll, syncPositions]);

  // Drive the CPU, and report the final state once the game is decided.
  useEffect(() => {
    if (state.phase === 'over') {
      if (!isDemo) {
        onGameOver(state);
      }
      return;
    }
    if (isDemo || busy || state.phase !== 'roll') {
      return;
    }
    const player = state.players[state.turn];
    if (player.type !== 'cpu') {
      return;
    }
    const timer = setTimeout(() => {
      doRoll();
    }, thinkFor());
    return () => clearTimeout(timer);
  }, [state, busy, doRoll, isDemo, onGameOver, thinkFor]);

  // Fanfare when the game is decided (the lab's demo wins too).
  useEffect(() => {
    if (state.phase === 'over') {
      sfx.win();
    }
  }, [state.phase]);

  // Autosave whenever the board settles between turns.
  useEffect(() => {
    if (!isDemo && !busy && state.phase !== 'over') {
      onPersist(state);
    }
  }, [state, busy, isDemo, onPersist]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (isDemo) {
          onExit();
        } else if (sheet !== 'none') {
          setSheet('none');
        } else {
          setSheet('menu');
        }
        return true;
      },
    );
    return () => subscription.remove();
  }, [isDemo, onExit, sheet]);

  const player = state.players[state.turn];
  const humanTurn = player.type === 'human';
  const canRoll = !isDemo && !busy && state.phase === 'roll' && humanTurn;
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
      haptics.select();
      performMove(stateRef.current, move).then(() => {
        busyRef.current = false;
        if (mounted.current) {
          setBusy(false);
        }
      });
    },
    [moves, performMove],
  );

  const destinations = moves.map(move => {
    const point = tokenPoint(player.color, move.to, move.token);
    return { key: `${move.token}-${move.to}`, point };
  });

  /** The colour whose yard is in `corner` - its tray sits beside it. */
  const trayAt = (corner: Corner): ColorId =>
    ALL_COLORS.find(color => CORNER_OF[color] === corner) ?? ColorId.Red;

  const renderTray = (color: ColorId) => {
    const playerIndex = state.players.findIndex(p => p.color === color);
    if (playerIndex === -1) {
      return <View style={{ width: traySize, height: traySize }} />;
    }
    const seat = state.players[playerIndex];
    const active = playerIndex === state.turn && state.phase !== 'over';
    return (
      <View style={{ zIndex: active ? 30 : 5 }}>
        <DiceTray
          color={seat.color}
          size={traySize}
          face={active ? displayFace : lastFaces[playerIndex] ?? 6}
          active={active}
          rolling={active && rolling}
          interactive={active && canRoll}
          playerName={
            seat.country ? `${flagOf(seat.country)} ${seat.name}` : seat.name
          }
          onPress={doRoll}
          rollMs={rollMs}
          onTumbleEnd={() => tumbleDone.current?.()}
        />
      </View>
    );
  };

  return (
    <Backdrop>
      <View
        style={[
          styles.root,
          { paddingTop: insets.top + 6, paddingBottom: insets.bottom + 10 },
        ]}
      >
        {/* Top UI Chrome */}
        <View style={styles.topChrome}>
          <View style={styles.header}>
            <Pressable
              onPress={() => setSheet('menu')}
              disabled={isDemo}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Game menu"
              // the lab draws its own close button in this spot
              style={[styles.iconButton, isDemo && styles.hidden]}
            >
              <View style={styles.burgerLine} />
              <View style={styles.burgerLine} />
              <View style={styles.burgerLine} />
            </Pressable>
          </View>
        </View>

        {/* ── Game Area ── */}
        <View style={styles.gameArea}>
          <View style={[styles.diceRow, { width: boardSize }]}>
            {renderTray(trayAt(Corner.TopLeft))}
            {renderTray(trayAt(Corner.TopRight))}
          </View>

          <View
            style={[
              styles.boardWrap,
              {
                width: boardSize,
                height: boardSize,
                elevation: 4,
              },
            ]}
          >
            <Board
              size={boardSize}
              seated={state.players.map(p => p.color)}
              theme={pieceTheme}
            />

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

            {webFxs.map((fx, i) => (
              <WebFx key={`web-${i}`} fx={fx} />
            ))}
            {bursts.map(item => (
              <HeroBurst key={item.id} burst={item} />
            ))}

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
                const bound = swinging[key];
                return (
                  <Animated.View
                    key={key}
                    style={[
                      styles.pawn,
                      {
                        width: pawnWidth,
                        height: pawnHeight,
                        // pieces in flight (swings, yanks) ride above the rest
                        zIndex: bound ? 40 : isCurrent ? 20 : 10,
                        transform: bound
                          ? [
                              { translateX: bound.translateX },
                              { translateY: bound.translateY },
                              { rotate: bound.rotate },
                              { scale: bound.scale },
                            ]
                          : [
                              { translateX: anim.xy.x },
                              { translateY: Animated.add(anim.xy.y, lift) },
                              {
                                rotate: anim.spin.interpolate({
                                  inputRange: [0, 360],
                                  outputRange: ['0deg', '360deg'],
                                }),
                              },
                              {
                                scale: Animated.multiply(anim.scale, anim.pop),
                              },
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
                        theme={pieceTheme}
                        webbed={!!webbed[key]}
                        mood={
                          forcedMood ??
                          moods[key] ??
                          (danger ? 'danger' : movable ? 'ready' : 'idle')
                        }
                        highlighted={movable && settings.showHints}
                        threatened={danger}
                      />
                    </Pressable>
                  </Animated.View>
                );
              }),
            )}
          </View>

          <View style={[styles.diceRow, { width: boardSize }]}>
            {renderTray(trayAt(Corner.BottomLeft))}
            {renderTray(trayAt(Corner.BottomRight))}
          </View>
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
          label="Dice odds"
          variant="secondary"
          compact
          onPress={() => setSheet('fair')}
        />
        <Divider />
        {online ? (
          // online matches are never saved, so leaving is final
          <Button
            label="Leave match"
            variant="ghost"
            compact
            onPress={() => setSheet('leave')}
          />
        ) : (
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
        )}
      </Sheet>

      <Sheet
        visible={sheet === 'leave'}
        title="Leave this match?"
        onClose={() => setSheet('menu')}
      >
        <Text style={styles.leaveText}>
          You will forfeit the match and it can't be resumed. The other players
          will keep playing without you.
        </Text>
        <Button label="Keep playing" onPress={() => setSheet('none')} />
        <View style={styles.menuGap} />
        <Button
          label="Leave match"
          variant="ghost"
          compact
          onPress={() => {
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
        pieceTheme={pieceTheme}
        onRematch={onRematch}
        onHome={onExit}
      />
    </Backdrop>
  );
};

const styles = StyleSheet.create({
  leaveText: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 18,
  },
  root: { flex: 1, backgroundColor: colors.background },
  topChrome: { width: '100%', paddingHorizontal: 12 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  gameArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  diceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginVertical: 12,
  },
  hidden: { opacity: 0 },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  burgerLine: {
    width: 18,
    height: 2,
    backgroundColor: colors.text,
    marginVertical: 2.5,
    borderRadius: 1,
  },
  boardWrap: { position: 'relative', ...shadow.card },
  pawn: { position: 'absolute', left: 0, top: 0 },
  destination: {
    position: 'absolute',
    borderWidth: 2.5,
    opacity: 0.85,
    zIndex: 15,
  },
  menuGap: { height: 10 },
});
