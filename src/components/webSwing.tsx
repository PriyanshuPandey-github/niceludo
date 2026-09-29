/**
 * The Spider move. Two gloved palms appear beside the piece and each shoots
 * a thread at the landing cell, where the two meet in one anchor web. The
 * hands tug, and the piece is reeled in along a gentle curve, the hands
 * travelling with it and turning to keep aiming at the anchor.
 *
 * Everything is driven by one Animated.Value, `progress`, with the curves
 * sampled up front so it all runs on the native driver:
 *
 *   0   -> 1    palms appear, threads shoot to the anchor
 *   1   -> 1.2  the tug: hands yank back
 *   1.2 -> 2    the pull: the piece travels to the anchor
 *   2   -> 3    release: the anchor web fades (after landing)
 */
import React from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from 'react-native-svg';
import { PieceColors } from '../theme/theme';
import { webPath } from './web';
import { useSvgId } from './svgId';

type Pixel = { x: number; y: number };

const SHOT = 1;
const TUG = 1.2;
const LAND = 2;
const END = 3;
/** Samples along the pull - enough that linear interpolation reads as a curve. */
const SAMPLES = 20;
/** Unscaled width of a thread view; it is stretched with scaleX. */
const LINE_BASE = 100;
const SPLAT_PATH = webPath(50, 50, 40, {
  spokes: 8,
  rings: 3,
  spokeReach: 1.15,
});

type Interp<T extends number | string = number> =
  Animated.AnimatedInterpolation<T>;

export interface ThreadFx {
  translateX: Interp;
  translateY: Interp;
  rotate: Interp<string>;
  scaleX: Interp;
}

export interface HandFx {
  translateX: Interp;
  translateY: Interp;
  rotate: Interp<string>;
  /** -1 mirrors the glove so both thumbs point outward */
  mirror: 1 | -1;
}

export interface SwingFx {
  progress: Animated.Value;
  palette: PieceColors;
  thickness: number;
  handSize: number;
  threads: ThreadFx[];
  hands: HandFx[];
  handOpacity: Interp;
  handScale: Interp;
  threadOpacity: Interp;
  splat: {
    left: number;
    top: number;
    size: number;
    opacity: Interp;
    scale: Interp;
  };
}

export interface SwingPawn {
  translateX: Interp;
  translateY: Interp;
  rotate: Interp<string>;
  scale: Animated.AnimatedMultiplication;
}

export interface Swing {
  pawn: SwingPawn;
  fx: SwingFx;
  /** how long each phase lasts at `speed`, in ms (sounds are timed to it) */
  durations: (speed: number) => { shoot: number; tug: number; travel: number };
  /** shoot, tug and pull; resolves when the piece has landed */
  shootAndPull: (speed: number) => Animated.CompositeAnimation;
  /** fade the anchor web after landing */
  release: (speed: number) => Animated.CompositeAnimation;
}

const angleOf = (from: Pixel, to: Pixel) =>
  (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;

/** Keep a sampled angle within 180deg of the previous one. */
const unwrap = (angle: number, previous: number) => {
  let a = angle;
  while (a - previous > 180) {
    a -= 360;
  }
  while (a - previous < -180) {
    a += 360;
  }
  return a;
};

export const createSwing = ({
  from,
  to,
  centre,
  unit,
  pawnOffset,
  baseScale,
  palette,
}: {
  /** where the piece's footprint is now, in board pixels */
  from: Pixel;
  /** where it lands - the anchor */
  to: Pixel;
  /** board centre, so the curve bows outward rather than across the middle */
  centre: Pixel;
  unit: number;
  /** footprint position inside the piece's own box */
  pawnOffset: Pixel;
  /** the piece's existing (stacking) scale, multiplied in */
  baseScale: Animated.Value;
  /** glove colour */
  palette: PieceColors;
}): Swing => {
  const progress = new Animated.Value(0);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy) || 1;
  const dir = { x: dx / dist, y: dy / dist };

  // A gentle bow, away from the board centre.
  let px = -dir.y;
  let py = dir.x;
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  if (px * (midX - centre.x) + py * (midY - centre.y) < 0) {
    px = -px;
    py = -py;
  }
  const bow = Math.min(dist * 0.2, unit * 1.2);
  const ctrl = { x: midX + px * bow, y: midY + py * bow };
  const tilt = (dir.x * py - dir.y * px > 0 ? -1 : 1) * 10;
  const arc = (s: number): Pixel => ({
    x: (1 - s) ** 2 * from.x + 2 * s * (1 - s) * ctrl.x + s * s * to.x,
    y: (1 - s) ** 2 * from.y + 2 * s * (1 - s) * ctrl.y + s * s * to.y,
  });

  const spread = unit * 0.7;
  const reach = unit * 0.22;
  const tugBack = unit * 0.2;
  const handSize = unit * 0.98;

  // --- sample every channel over progress 0..END
  const input: number[] = [0, 0.2, SHOT, TUG];
  for (let k = 1; k <= SAMPLES; k++) {
    input.push(TUG + ((LAND - TUG) * k) / SAMPLES);
  }
  input.push(END);

  const pieceAt = (u: number): Pixel =>
    u <= TUG ? from : u >= LAND ? to : arc((u - TUG) / (LAND - TUG));
  const tugAt = (u: number) => {
    if (u <= SHOT || u >= LAND) {
      return 0;
    }
    if (u <= TUG) {
      return tugBack * ((u - SHOT) / (TUG - SHOT));
    }
    return tugBack * (1 - (u - TUG) / (LAND - TUG)) ** 2;
  };

  const pieces = input.map(pieceAt);
  const sides = [-1, 1] as const;
  const handPos = sides.map(() => [] as Pixel[]);
  const handAngle = sides.map(() => [] as number[]);
  const threadAngle = sides.map(() => [] as number[]);
  const threadMid = sides.map(() => [] as Pixel[]);
  const threadLen = sides.map(() => [] as number[]);
  const last = sides.map(() => angleOf(from, to));

  // Hands keep a steady heading along the move, turning at most HAND_TURN
  // toward the anchor, so they never spin round it as the piece arrives.
  const heading = angleOf(from, to);
  const HAND_TURN = 30;
  input.forEach((u, i) => {
    const piece = pieces[i];
    const remaining = Math.hypot(to.x - piece.x, to.y - piece.y);
    const forward = Math.min(reach, remaining * 0.5) - tugAt(u);
    sides.forEach((side, h) => {
      const hand = {
        x: piece.x - dir.y * side * spread + dir.x * forward,
        y: piece.y + dir.x * side * spread + dir.y * forward,
      };
      handPos[h].push(hand);
      last[h] = unwrap(angleOf(hand, to), last[h]);
      threadAngle[h].push(last[h]);
      const turn = Math.max(-HAND_TURN, Math.min(HAND_TURN, last[h] - heading));
      handAngle[h].push(heading + turn);
      // The thread grows from the palm to the anchor during the shot.
      const grown = u <= 0.2 ? 0 : u >= SHOT ? 1 : (u - 0.2) / (SHOT - 0.2);
      const tip = {
        x: hand.x + (to.x - hand.x) * grown,
        y: hand.y + (to.y - hand.y) * grown,
      };
      threadMid[h].push({ x: (hand.x + tip.x) / 2, y: (hand.y + tip.y) / 2 });
      threadLen[h].push(Math.hypot(tip.x - hand.x, tip.y - hand.y));
    });
  });

  const over = (outputRange: number[]) =>
    progress.interpolate<number>({ inputRange: input, outputRange });
  const overAngle = (outputRange: string[]) =>
    progress.interpolate<string>({ inputRange: input, outputRange });
  const deg = (a: number) => `${a.toFixed(2)}deg`;
  const thickness = Math.max(1.4, unit * 0.06);

  const pawn: SwingPawn = {
    translateX: over(pieces.map(p => p.x - pawnOffset.x)),
    translateY: over(pieces.map(p => p.y - pawnOffset.y)),
    rotate: progress.interpolate<string>({
      inputRange: [0, TUG, 1.6, LAND, END],
      outputRange: ['0deg', '0deg', `${tilt}deg`, '0deg', '0deg'],
    }),
    scale: Animated.multiply(
      baseScale,
      progress.interpolate<number>({
        inputRange: [0, TUG, 1.6, LAND, END],
        outputRange: [1, 1, 1.12, 1, 1],
      }),
    ),
  };

  const splatSize = unit * 0.95;
  const fx: SwingFx = {
    progress,
    palette,
    thickness,
    handSize,
    threads: sides.map((_, h) => ({
      translateX: over(threadMid[h].map(p => p.x - LINE_BASE / 2)),
      translateY: over(threadMid[h].map(p => p.y - thickness / 2)),
      rotate: overAngle(threadAngle[h].map(deg)),
      scaleX: over(threadLen[h].map(len => Math.max(len, 0.01) / LINE_BASE)),
    })),
    hands: sides.map((side, h) => ({
      translateX: over(handPos[h].map(p => p.x - handSize / 2)),
      translateY: over(handPos[h].map(p => p.y - handSize / 2)),
      // the glove is drawn fingers-up, i.e. already pointing at -90deg
      rotate: overAngle(handAngle[h].map(a => deg(a + 90))),
      mirror: side === -1 ? 1 : -1,
    })),
    // hands and threads let go over the last stretch of the pull
    handOpacity: progress.interpolate<number>({
      inputRange: [0, 0.2, 1.7, 1.95],
      outputRange: [0, 1, 1, 0],
      extrapolate: 'clamp',
    }),
    // pop in, squeeze on the tug, relax on the pull
    handScale: progress.interpolate<number>({
      inputRange: [0, 0.2, 0.3, SHOT, TUG, 1.4],
      outputRange: [0.3, 1.1, 1, 1, 0.9, 1],
      extrapolate: 'clamp',
    }),
    threadOpacity: progress.interpolate<number>({
      inputRange: [0, 0.2, 1.8, LAND],
      outputRange: [0, 1, 1, 0],
      extrapolate: 'clamp',
    }),
    splat: {
      left: to.x - splatSize / 2,
      top: to.y - splatSize / 2,
      size: splatSize,
      opacity: progress.interpolate<number>({
        inputRange: [0, 0.92, SHOT, 2.2, END],
        outputRange: [0, 0, 1, 1, 0],
      }),
      scale: progress.interpolate<number>({
        inputRange: [0, 0.92, 1.1, 1.3, END],
        outputRange: [0.2, 0.2, 1.18, 1, 1],
      }),
    },
  };

  const cells = dist / unit;
  const durations = (speed: number) => ({
    shoot: Math.round(Math.min(280, 160 + cells * 14) * speed),
    tug: Math.round(110 * speed),
    travel: Math.round(Math.min(580, 280 + cells * 45) * speed),
  });
  return {
    pawn,
    fx,
    durations,
    shootAndPull: speed =>
      Animated.sequence([
        Animated.timing(progress, {
          toValue: SHOT,
          duration: durations(speed).shoot,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(progress, {
          toValue: TUG,
          duration: durations(speed).tug,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(progress, {
          toValue: LAND,
          duration: durations(speed).travel,
          easing: Easing.bezier(0.45, 0, 0.2, 1),
          useNativeDriver: true,
        }),
      ]),
    release: speed =>
      Animated.timing(progress, {
        toValue: END,
        duration: Math.round(240 * speed),
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
  };
};

/**
 * Spider capture: a thread shoots from the victim's own yard slot, latches
 * on, and yanks it home along a high arc - spinning, looming larger at the
 * top as if thrown at the camera - then it lands with a bounce and squash.
 *
 *   0    -> 1     thread shoots from the yard anchor to the victim
 *   1    -> 1.15  the snag: the victim jerks toward home
 *   1.15 -> 2     the flight
 *   2    -> 3     landing bounce, thread and anchor fade
 */
export const createYank = ({
  from,
  to,
  unit,
  pawnOffset,
  baseScale,
  palette,
}: {
  /** where the victim is now, in board pixels */
  from: Pixel;
  /** its yard slot - also where the thread is anchored */
  to: Pixel;
  unit: number;
  pawnOffset: Pixel;
  baseScale: Animated.Value;
  palette: PieceColors;
}): Swing => {
  const progress = new Animated.Value(0);
  const dist = Math.hypot(to.x - from.x, to.y - from.y) || 1;
  // The apex always clears the higher end by `rise`, so even a downhill
  // throw visibly goes up first.
  const rise = Math.min(unit * 2.2, unit * 1.2 + dist * 0.06);
  const height = (from.y + to.y) / 2 - Math.min(from.y, to.y) + rise;
  const SNAG = 1.15;
  const snag = {
    x: from.x + ((to.x - from.x) / dist) * unit * 0.18,
    y: from.y + ((to.y - from.y) / dist) * unit * 0.18,
  };

  // --- sample the victim's position over progress 0..END
  const input: number[] = [0, SHOT, SNAG];
  const at: Pixel[] = [from, from, snag];
  for (let k = 1; k <= SAMPLES; k++) {
    const s = k / SAMPLES;
    input.push(SNAG + ((LAND - SNAG) * k) / SAMPLES);
    at.push({
      x: snag.x + (to.x - snag.x) * s,
      y: snag.y + (to.y - snag.y) * s - height * 4 * s * (1 - s),
    });
  }
  // bounce on landing
  input.push(2.12, 2.26, END);
  at.push({ x: to.x, y: to.y - unit * 0.28 }, to, to);

  // the thread runs from the anchor (the yard slot) to the victim
  const threadMid: Pixel[] = [];
  const threadLen: number[] = [];
  const threadAngle: number[] = [];
  let last = angleOf(to, from);
  input.forEach((u, i) => {
    const piece = at[i];
    const grown = u >= SHOT ? 1 : u / SHOT;
    const tip = {
      x: to.x + (piece.x - to.x) * grown,
      y: to.y + (piece.y - to.y) * grown,
    };
    threadMid.push({ x: (to.x + tip.x) / 2, y: (to.y + tip.y) / 2 });
    const len = Math.hypot(tip.x - to.x, tip.y - to.y);
    threadLen.push(len);
    if (len > 0.5) {
      last = unwrap(angleOf(to, tip), last);
    }
    threadAngle.push(last);
  });

  const over = (outputRange: number[]) =>
    progress.interpolate<number>({ inputRange: input, outputRange });
  const overAngle = (outputRange: string[]) =>
    progress.interpolate<string>({ inputRange: input, outputRange });
  const deg = (a: number) => `${a.toFixed(2)}deg`;
  const thickness = Math.max(1.4, unit * 0.06);
  const splatSize = unit * 0.95;
  const zero = progress.interpolate<number>({
    inputRange: [0, 1],
    outputRange: [0, 0],
  });

  const pawn: SwingPawn = {
    translateX: over(at.map(p => p.x - pawnOffset.x)),
    translateY: over(at.map(p => p.y - pawnOffset.y)),
    rotate: progress.interpolate<string>({
      inputRange: [0, SNAG, LAND, END],
      outputRange: ['0deg', '0deg', '720deg', '720deg'],
    }),
    scale: Animated.multiply(
      baseScale,
      progress.interpolate<number>({
        inputRange: [0, SHOT, SNAG, 1.575, LAND, 2.12, 2.2, 2.3, END],
        outputRange: [1, 0.92, 0.85, 1.28, 1, 1, 0.8, 1, 1],
      }),
    ),
  };

  const fx: SwingFx = {
    progress,
    palette,
    thickness,
    handSize: 0,
    threads: [
      {
        translateX: over(threadMid.map(p => p.x - LINE_BASE / 2)),
        translateY: over(threadMid.map(p => p.y - thickness / 2)),
        rotate: overAngle(threadAngle.map(deg)),
        scaleX: over(threadLen.map(len => Math.max(len, 0.01) / LINE_BASE)),
      },
    ],
    hands: [],
    handOpacity: zero,
    handScale: zero,
    threadOpacity: progress.interpolate<number>({
      inputRange: [0, 0.05, 1.9, LAND],
      outputRange: [0, 1, 1, 0],
      extrapolate: 'clamp',
    }),
    splat: {
      left: to.x - splatSize / 2,
      top: to.y - splatSize / 2,
      size: splatSize,
      opacity: progress.interpolate<number>({
        inputRange: [0, 0.1, 2.3, END],
        outputRange: [0, 1, 1, 0],
      }),
      scale: progress.interpolate<number>({
        inputRange: [0, 0.1, 0.3, END],
        outputRange: [0.2, 1.18, 1, 1],
      }),
    },
  };

  const cells = dist / unit;
  const durations = (speed: number) => ({
    shoot: Math.round(Math.min(300, 150 + cells * 12) * speed),
    tug: Math.round(90 * speed),
    travel: Math.round(Math.min(820, 520 + cells * 25) * speed),
  });
  return {
    pawn,
    fx,
    durations,
    shootAndPull: speed =>
      Animated.sequence([
        Animated.timing(progress, {
          toValue: SHOT,
          duration: durations(speed).shoot,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(progress, {
          toValue: SNAG,
          duration: durations(speed).tug,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(progress, {
          toValue: LAND,
          duration: durations(speed).travel,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    release: speed =>
      Animated.timing(progress, {
        toValue: END,
        duration: Math.round(420 * speed),
        easing: Easing.linear,
        useNativeDriver: true,
      }),
  };
};

/**
 * A web-shooter glove, fingers up: index and pinky out, middle and ring
 * folded onto the palm, thumb out to the left.
 */
const Glove = ({ size, palette }: { size: number; palette: PieceColors }) => {
  const id = useSvgId('glove');
  const ink = '#111118';
  const fill = `url(#${id})`;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%" stopColor={palette.light} />
          <Stop offset="55%" stopColor={palette.base} />
          <Stop offset="100%" stopColor={palette.dark} />
        </LinearGradient>
      </Defs>
      {/* thumb */}
      <Rect
        x={-6}
        y={-20}
        width={12}
        height={30}
        rx={6}
        fill={fill}
        stroke={ink}
        strokeWidth={3}
        transform="translate(31 64) rotate(-55)"
      />
      {/* index and pinky, extended */}
      <Rect
        x={30}
        y={8}
        width={11}
        height={44}
        rx={5.5}
        fill={fill}
        stroke={ink}
        strokeWidth={3}
      />
      <Rect
        x={61}
        y={16}
        width={10}
        height={36}
        rx={5}
        fill={fill}
        stroke={ink}
        strokeWidth={3}
      />
      {/* palm */}
      <Rect
        x={29}
        y={40}
        width={43}
        height={40}
        rx={11}
        fill={fill}
        stroke={ink}
        strokeWidth={3}
      />
      {/* middle and ring, folded down onto the palm */}
      <Rect
        x={41}
        y={36}
        width={10}
        height={17}
        rx={5}
        fill={palette.dark}
        stroke={ink}
        strokeWidth={2.6}
      />
      <Rect
        x={51}
        y={36}
        width={10}
        height={17}
        rx={5}
        fill={palette.dark}
        stroke={ink}
        strokeWidth={2.6}
      />
      {/* web shooter on the wrist */}
      <Circle
        cx={50}
        cy={66}
        r={5.5}
        fill="#E8ECF7"
        stroke={ink}
        strokeWidth={2.4}
      />
      {/* cuff */}
      <Rect
        x={33}
        y={78}
        width={35}
        height={15}
        rx={5}
        fill={palette.dark}
        stroke={ink}
        strokeWidth={3}
      />
    </Svg>
  );
};

/** Threads, anchor web and palms. Sits above the board, below the mover. */
export const WebFx = ({ fx }: { fx: SwingFx }) => (
  <>
    {fx.threads.map((thread, i) => (
      <Animated.View
        key={`thread-${i}`}
        pointerEvents="none"
        style={[
          styles.thread,
          {
            height: fx.thickness,
            borderRadius: fx.thickness / 2,
            opacity: fx.threadOpacity,
            transform: [
              { translateX: thread.translateX },
              { translateY: thread.translateY },
              { rotate: thread.rotate },
              { scaleX: thread.scaleX },
            ],
          },
        ]}
      />
    ))}
    <Animated.View
      pointerEvents="none"
      style={[
        styles.splat,
        {
          left: fx.splat.left,
          top: fx.splat.top,
          width: fx.splat.size,
          height: fx.splat.size,
          opacity: fx.splat.opacity,
          transform: [{ scale: fx.splat.scale }],
        },
      ]}
    >
      <Svg width={fx.splat.size} height={fx.splat.size} viewBox="0 0 100 100">
        <Path
          d={SPLAT_PATH}
          fill="none"
          stroke="#F2F5FF"
          strokeWidth={4}
          strokeLinecap="round"
          opacity={0.92}
        />
      </Svg>
    </Animated.View>
    {fx.hands.map((hand, i) => (
      <Animated.View
        key={`hand-${i}`}
        pointerEvents="none"
        style={[
          styles.hand,
          {
            width: fx.handSize,
            height: fx.handSize,
            opacity: fx.handOpacity,
            transform: [
              { translateX: hand.translateX },
              { translateY: hand.translateY },
              { rotate: hand.rotate },
              { scaleX: hand.mirror },
              { scale: fx.handScale },
            ],
          },
        ]}
      >
        <Glove size={fx.handSize} palette={fx.palette} />
      </Animated.View>
    ))}
  </>
);

const styles = StyleSheet.create({
  thread: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: LINE_BASE,
    backgroundColor: 'rgba(242,245,255,0.95)',
    zIndex: 15,
  },
  // Below every pawn (10/20): it lingers after landing, when the turn - and
  // with it the mover's zIndex - may already have passed on.
  splat: { position: 'absolute', zIndex: 5 },
  hand: { position: 'absolute', left: 0, top: 0, zIndex: 19 },
});
