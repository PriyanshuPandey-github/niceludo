/**
 * The home screen's piece show: two Spider pieces act out short random skits
 * over the board preview - swinging in on a web to kick the other off stage,
 * webbing each other up, flipping into a mid-air clash, dropping in upside
 * down to spook a passer-by, a web tug-of-war, a swing chase.
 *
 * Each skit is a self-contained component that runs its own timeline and
 * calls `onDone`; `PieceShow` rolls a big die between them and the face it
 * lands on picks the next (never the same twice in a row), with fresh
 * colours. All motion is transform and opacity on the native thread.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path, Text as SvgText } from 'react-native-svg';
import { ALL_COLORS, ColorId } from '../engine/types';
import { Pawn } from './Pawn';
import { Dice } from './Dice';
import { rollEasing, rollImpacts } from './diceRoll';
import { sfx } from '../audio/sfx';
import { Mood } from './eyes';
import { webPath } from './web';
import { useReduceMotion } from './homeFx';

type Num = Animated.WithAnimatedValue<number>;

/** Stage geometry: width, height, the floor line and the piece size. */
export interface Stage {
  W: number;
  H: number;
  floor: number;
  S: number;
}

export interface SkitProps {
  stage: Stage;
  colors: [ColorId, ColorId];
  onDone: () => void;
}

const THREAD = 'rgba(255,240,240,0.85)';
/** Growing lines start here, not at 0 - a zero scale is a singular transform. */
const MIN_SCALE = 0.001;

// ---------------------------------------------------------------- helpers
const tween = (
  value: Animated.Value,
  toValue: number,
  duration: number,
  easing: (t: number) => number = Easing.inOut(Easing.quad),
) =>
  Animated.timing(value, { toValue, duration, easing, useNativeDriver: true });

const spring = (
  value: Animated.Value,
  toValue: number,
  friction = 5,
  tension = 60,
) =>
  Animated.spring(value, {
    toValue,
    friction,
    tension,
    useNativeDriver: true,
  });

const wait = (ms: number) => Animated.delay(ms);
const all = (...animations: Animated.CompositeAnimation[]) =>
  Animated.parallel(animations);
const seq = (...animations: Animated.CompositeAnimation[]) =>
  Animated.sequence(animations);
const out = Easing.out(Easing.quad);
const into = Easing.in(Easing.quad);

/** A jump: up by `height` and back down to `floor`. */
const hop = (y: Animated.Value, floor: number, height: number, ms = 150) =>
  seq(tween(y, floor - height, ms, out), tween(y, floor, ms, into));

const wobble = (rotation: Animated.Value, degrees: number[], ms = 90) =>
  seq(...degrees.map(d => tween(rotation, d, ms)));

type Step = Animated.CompositeAnimation | (() => void);

/** Plays animations and state changes in order; returns a canceller. */
const play = (steps: Step[], done: () => void) => {
  let index = 0;
  let live = true;
  let current: Animated.CompositeAnimation | null = null;
  const next = () => {
    while (live && index < steps.length) {
      const step = steps[index++];
      if (typeof step === 'function') {
        step();
        continue;
      }
      current = step;
      step.start(({ finished }) => finished && next());
      return;
    }
    if (live) {
      done();
    }
  };
  next();
  return () => {
    live = false;
    current?.stop();
  };
};

/** Runs a skit's timeline once, on mount. */
const useTimeline = (build: () => Step[], onDone: () => void) => {
  const done = useRef(onDone);
  done.current = onDone;
  const steps = useRef(build);
  useEffect(() => play(steps.current(), () => done.current()), []);
};

/** Animated values created once, with initial values. */
const useValues = (initial: number[]) =>
  useRef(initial.map(v => new Animated.Value(v))).current;

const degrees = (value: Animated.Value) =>
  value.interpolate({
    inputRange: [-3600, 3600],
    outputRange: ['-3600deg', '3600deg'],
  });

/**
 * A pendulum swing driven by `t` (0..1): the piece's head moves on a circle
 * of radius `rope` around (ax, ay) from angle `from` to `to` (degrees from
 * straight down, positive to the right). The arc is sampled, so it runs on
 * the native driver.
 */
const swingPath = (
  t: Animated.Value,
  ax: number,
  ay: number,
  rope: number,
  from: number,
  to: number,
  size: number,
) => {
  const input: number[] = [];
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i <= 16; i++) {
    const u = i / 16;
    const a = ((from + (to - from) * u) * Math.PI) / 180;
    input.push(u);
    xs.push(ax + rope * Math.sin(a));
    ys.push(ay + rope * Math.cos(a) + size);
  }
  return {
    x: t.interpolate({ inputRange: input, outputRange: xs }),
    y: t.interpolate({ inputRange: input, outputRange: ys }),
    line: t.interpolate({
      inputRange: [0, 1],
      outputRange: [`${90 - from}deg`, `${90 - to}deg`],
    }),
  };
};

// ----------------------------------------------------------------- actors
/** A piece whose (x, y) is the middle of its feet. */
const Actor = ({
  color,
  size,
  x,
  y,
  rotate,
  opacity,
  mood,
  webbed,
}: {
  color: ColorId;
  size: number;
  x: Num;
  y: Num;
  rotate?: Animated.Value;
  opacity?: Num;
  mood: Mood;
  webbed?: boolean;
}) => (
  <Animated.View
    style={[
      styles.abs,
      {
        left: -size / 2,
        top: -size,
        width: size,
        height: size,
        opacity: opacity ?? 1,
        transform: [
          { translateX: x },
          { translateY: y },
          { rotate: rotate ? degrees(rotate) : '0deg' },
        ],
      },
    ]}
  >
    <Pawn
      color={color}
      height={size}
      theme="spider"
      animated
      mood={mood}
      webbed={webbed}
    />
  </Animated.View>
);

/** A web line from a fixed point, `length` long, turned by `rotate`. */
const Thread = ({
  x,
  y,
  length,
  rotate,
  grow,
  opacity,
}: {
  x: number;
  y: number;
  length: number;
  rotate: Animated.WithAnimatedValue<string>;
  grow?: Num;
  opacity?: Num;
}) => (
  <Animated.View
    style={[
      styles.abs,
      styles.thread,
      {
        left: x,
        top: y - 0.75,
        width: length,
        opacity: opacity ?? 1,
        transform: [{ rotate }, { scaleX: grow ?? 1 }],
      },
    ]}
  />
);

const starPath = (() => {
  const points: string[] = [];
  for (let i = 0; i < 24; i++) {
    const r = i % 2 === 0 ? 48 : 30;
    const a = (i * Math.PI) / 12;
    points.push(`${50 + r * Math.cos(a)},${50 + r * Math.sin(a)}`);
  }
  return `M${points.join(' L')} Z`;
})();

/** A comic-book burst - POW!, BAM!, THWIP! - played by `p` going 0 -> 1. */
const Burst = ({
  x,
  y,
  word,
  p,
  size = 78,
}: {
  x: number;
  y: number;
  word: string;
  p: Animated.Value;
  size?: number;
}) => (
  <Animated.View
    style={[
      styles.abs,
      {
        left: x - size / 2,
        top: y - size / 2,
        width: size,
        height: size,
        opacity: p.interpolate({
          inputRange: [0, 0.08, 0.75, 1],
          outputRange: [0, 1, 1, 0],
        }),
        transform: [
          {
            scale: p.interpolate({
              inputRange: [0, 0.25, 1],
              outputRange: [0.2, 1.15, 1],
            }),
          },
          {
            rotate: p.interpolate({
              inputRange: [0, 1],
              outputRange: ['-14deg', '6deg'],
            }),
          },
        ],
      },
    ]}
  >
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path
        d={starPath}
        fill="#FFD23F"
        stroke="#2A0508"
        strokeWidth={3}
        strokeLinejoin="round"
      />
      <SvgText
        x={50}
        y={58}
        fontSize={word.length > 4 ? 19 : 23}
        fontWeight="900"
        textAnchor="middle"
        fill="#E3262F"
        stroke="#2A0508"
        strokeWidth={1}
      >
        {word}
      </SvgText>
    </Svg>
  </Animated.View>
);

/** A web splat blooming at (x, y). */
const Splat = ({
  x,
  y,
  p,
  size,
}: {
  x: number;
  y: number;
  p: Animated.Value;
  size: number;
}) => (
  <Animated.View
    style={[
      styles.abs,
      {
        left: x - size,
        top: y - size,
        width: size * 2,
        height: size * 2,
        opacity: p.interpolate({
          inputRange: [0, 0.1, 0.7, 1],
          outputRange: [0, 1, 0.8, 0],
        }),
        transform: [
          {
            scale: p.interpolate({
              inputRange: [0, 0.4, 1],
              outputRange: [0.2, 1, 1.15],
            }),
          },
        ],
      },
    ]}
  >
    <Svg width={size * 2} height={size * 2}>
      <Path
        d={webPath(size, size, size * 0.75, { spokes: 10, rings: 3 })}
        stroke="#FFFFFF"
        strokeWidth={1.6}
        fill="none"
      />
    </Svg>
  </Animated.View>
);

// ------------------------------------------------------------------ skits
/** A swings in on a web, kicks B clean off the stage and sticks the landing. */
export const SwingKick = ({ stage, colors, onDone }: SkitProps) => {
  const { W, H, floor, S } = stage;
  const [moodA, setMoodA] = useState<Mood>('moving');
  const [moodB, setMoodB] = useState<Mood>('idle');

  const ax = W * 0.36;
  const ay = -H * 0.45;
  const rope = floor - S - ay - 2;
  const xB = W * 0.74;
  const hit =
    (Math.asin(Math.min(1, (xB - S * 0.85 - ax) / rope)) * 180) / Math.PI;
  const lowFeet = ay + rope * Math.cos((hit * Math.PI) / 180) + S;

  const [t, rot, offX, offY, line, bx, fly, spin, pow, fade] = useValues([
    0,
    45,
    0,
    0,
    0,
    W + S * 2,
    0,
    0,
    0,
    1,
  ]);
  const swing = useRef(swingPath(t, ax, ay, rope, -75, hit, S)).current;

  useTimeline(
    () => [
      tween(bx, xB, 520, Easing.out(Easing.cubic)),
      () => setMoodB('danger'),
      all(
        tween(line, 1, 120),
        tween(t, 1, 780, Easing.in(Easing.quad)),
        tween(rot, -hit * 0.6, 780, Easing.in(Easing.quad)),
      ),
      () => setMoodB('hurt'),
      all(
        tween(pow, 1, 620, Easing.linear),
        tween(bx, W + S * 3, 760, out),
        tween(fly, 1, 760, Easing.linear),
        tween(spin, 720, 760, Easing.linear),
        tween(line, 0, 150),
        tween(offX, S * 0.9, 460, out),
        seq(tween(offY, -S, 210, out), tween(offY, floor - lowFeet, 250, into)),
        tween(rot, 360, 460, Easing.linear),
      ),
      () => setMoodA('happy'),
      hop(offY, floor - lowFeet, S * 0.3),
      hop(offY, floor - lowFeet, S * 0.3),
      wait(450),
      tween(fade, 0, 300),
    ],
    onDone,
  );

  return (
    <>
      <Thread x={ax} y={ay} length={rope} rotate={swing.line} opacity={line} />
      <Actor
        color={colors[1]}
        size={S}
        x={bx}
        y={fly.interpolate({
          inputRange: [0, 0.4, 1],
          outputRange: [floor, floor - H * 0.32, floor - H * 0.08],
        })}
        rotate={spin}
        mood={moodB}
      />
      <Actor
        color={colors[0]}
        size={S}
        x={Animated.add(swing.x, offX)}
        y={Animated.add(swing.y, offY)}
        rotate={rot}
        opacity={fade}
        mood={moodA}
      />
      <Burst x={xB} y={floor - S * 0.7} word="POW!" p={pow} />
    </>
  );
};

/** A webs B up; B struggles free and chases A off stage. */
export const WebZap = ({ stage, colors, onDone }: SkitProps) => {
  const { W, floor, S } = stage;
  const [moodA, setMoodA] = useState<Mood>('idle');
  const [moodB, setMoodB] = useState<Mood>('idle');
  const [webbed, setWebbed] = useState(false);
  const xA = W * 0.18;
  const xB = W * 0.8;
  const [ax, ay, bx, by, br, grow, line, thwip, splat] = useValues([
    xA,
    -S * 1.5,
    xB,
    -S * 1.5,
    0,
    MIN_SCALE,
    1,
    0,
    0,
  ]);
  const from = { x: xA + S * 0.45, y: floor - S * 0.55 };
  const to = { x: xB - S * 0.1, y: floor - S * 0.5 };

  useTimeline(
    () => [
      all(spring(ay, floor), seq(wait(220), spring(by, floor))),
      wait(250),
      () => {
        setMoodA('moving');
        setMoodB('ready');
      },
      all(tween(grow, 1, 170, out), tween(thwip, 1, 560, Easing.linear)),
      () => {
        setWebbed(true);
        setMoodB('hurt');
      },
      all(
        tween(splat, 1, 480, Easing.linear),
        wobble(br, [14, -14, 10, -8, 0]),
      ),
      () => setMoodA('happy'),
      all(tween(line, 0, 200), hop(ay, floor, S * 0.5, 160)),
      wait(380),
      () => {
        setWebbed(false);
        setMoodB('moving');
      },
      hop(by, floor, S * 0.9, 200),
      () => setMoodA('danger'),
      all(
        tween(ax, -S * 2, 720, into),
        seq(wait(120), tween(bx, -S * 2, 820, into)),
      ),
    ],
    onDone,
  );

  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const angle = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
  return (
    <>
      <Thread
        x={from.x}
        y={from.y}
        length={length}
        rotate={`${angle}deg`}
        grow={grow}
        opacity={line}
      />
      <Actor color={colors[0]} size={S} x={ax} y={ay} mood={moodA} />
      <Actor
        color={colors[1]}
        size={S}
        x={bx}
        y={by}
        rotate={br}
        mood={moodB}
        webbed={webbed}
      />
      <Splat x={to.x} y={to.y} p={splat} size={S * 0.8} />
      <Burst
        x={xA + S * 0.2}
        y={floor - S * 1.6}
        word="THWIP!"
        p={thwip}
        size={70}
      />
    </>
  );
};

/** Both leap with a flip and clash in mid-air, then shake it off. */
export const FlipClash = ({ stage, colors, onDone }: SkitProps) => {
  const { W, H, floor, S } = stage;
  const [mood, setMood] = useState<Mood>('moving');
  const mid = W * 0.5;
  const apex = floor - H * 0.42;
  const [ax, ay, ar, bx, by, br, bam, fade] = useValues([
    -S,
    floor,
    0,
    W + S,
    floor,
    0,
    0,
    1,
  ]);

  useTimeline(
    () => [
      all(
        tween(ax, W * 0.22, 460, Easing.out(Easing.cubic)),
        tween(bx, W * 0.78, 460, Easing.out(Easing.cubic)),
      ),
      wait(260),
      all(
        tween(ax, mid - S * 0.45, 420, out),
        tween(ay, apex, 420, out),
        tween(ar, 360, 420),
        tween(bx, mid + S * 0.45, 420, out),
        tween(by, apex, 420, out),
        tween(br, -360, 420),
      ),
      () => setMood('hurt'),
      all(
        tween(bam, 1, 600, Easing.linear),
        tween(ax, W * 0.28, 520, Easing.linear),
        tween(ay, floor, 520, into),
        tween(ar, 720, 520),
        tween(bx, W * 0.72, 520, Easing.linear),
        tween(by, floor, 520, into),
        tween(br, -720, 520),
      ),
      wait(520),
      () => setMood('happy'),
      all(hop(ay, floor, S * 0.4), seq(wait(90), hop(by, floor, S * 0.4))),
      all(hop(ay, floor, S * 0.4), seq(wait(90), hop(by, floor, S * 0.4))),
      wait(300),
      tween(fade, 0, 320),
    ],
    onDone,
  );

  return (
    <>
      <Actor
        color={colors[0]}
        size={S}
        x={ax}
        y={ay}
        rotate={ar}
        opacity={fade}
        mood={mood}
      />
      <Actor
        color={colors[1]}
        size={S}
        x={bx}
        y={by}
        rotate={br}
        opacity={fade}
        mood={mood}
      />
      <Burst x={mid} y={apex - S * 0.5} word="BAM!" p={bam} />
    </>
  );
};

/** A drops in upside down on a thread and spooks B off stage. */
export const UpsideDrop = ({ stage, colors, onDone }: SkitProps) => {
  const { W, floor, S } = stage;
  const [moodA, setMoodA] = useState<Mood>('idle');
  const [moodB, setMoodB] = useState<Mood>('idle');
  const hx = W * 0.42;
  const hangY = floor - S * 1.9;
  const [hy, hr, bx, by, boo] = useValues([-S * 4, 0, W + S * 2, floor, 0]);

  useTimeline(
    () => [
      tween(bx, W * 0.6, 640, Easing.out(Easing.cubic)),
      wait(220),
      spring(hy, hangY, 4, 40),
      () => setMoodA('happy'),
      wobble(hr, [18, -18, 12, 0], 110),
      () => setMoodB('danger'),
      all(tween(boo, 1, 580, Easing.linear), hop(by, floor, S * 1.1, 190)),
      all(
        tween(bx, W + S * 2, 540, into),
        seq(wait(160), tween(hy, -S * 4, 440, Easing.in(Easing.back(1.4)))),
      ),
    ],
    onDone,
  );

  return (
    <>
      {/* the hanging piece and its thread move together */}
      <Animated.View
        style={[
          styles.abs,
          { left: hx - S / 2, top: -S / 2, transform: [{ translateY: hy }] },
        ]}
      >
        <View
          style={[
            styles.abs,
            styles.thread,
            {
              left: S / 2 - 0.75,
              top: -900,
              width: 1.5,
              height: 900 + S * 0.1,
            },
          ]}
        />
        <Animated.View
          style={{
            width: S,
            height: S,
            transform: [{ rotate: '180deg' }, { rotate: degrees(hr) }],
          }}
        >
          <Pawn
            color={colors[0]}
            height={S}
            theme="spider"
            animated
            mood={moodA}
          />
        </Animated.View>
      </Animated.View>
      <Actor color={colors[1]} size={S} x={bx} y={by} mood={moodB} />
      <Burst x={hx - S * 0.9} y={hangY - S * 0.4} word="BOO!" p={boo} />
    </>
  );
};

/** A web tug-of-war that ends when the web snaps. */
export const TugOfWar = ({ stage, colors, onDone }: SkitProps) => {
  const { W, floor, S } = stage;
  const [mood, setMood] = useState<Mood>('moving');
  const [ax, ay, ar, bx, by, br, shift, grow, line, snap, fade] = useValues([
    -S,
    floor,
    0,
    W + S,
    floor,
    0,
    0,
    MIN_SCALE,
    1,
    0,
    1,
  ]);
  const rope = floor - S * 0.55;

  useTimeline(
    () => [
      all(
        tween(ax, W * 0.2, 460, Easing.out(Easing.cubic)),
        tween(bx, W * 0.8, 460, Easing.out(Easing.cubic)),
      ),
      all(tween(grow, 1, 200, out), tween(ar, -12, 200), tween(br, 12, 200)),
      tween(shift, -S * 0.6, 380),
      tween(shift, S * 0.5, 440),
      tween(shift, -S * 0.4, 380),
      tween(shift, S * 0.3, 360),
      () => setMood('hurt'),
      all(
        tween(line, 0, 80),
        tween(snap, 1, 600, Easing.linear),
        tween(ax, W * 0.2 - S * 1.2, 420, out),
        tween(ar, -372, 420),
        hop(ay, floor, S * 0.6, 210),
        tween(bx, W * 0.8 + S * 1.2, 420, out),
        tween(br, 372, 420),
        hop(by, floor, S * 0.6, 210),
      ),
      all(tween(ar, -360, 120), tween(br, 360, 120)),
      wait(420),
      () => setMood('happy'),
      wait(420),
      tween(fade, 0, 320),
    ],
    onDone,
  );

  const leftX = Animated.add(Animated.add(ax, shift), S * 0.4);
  const span = Animated.multiply(
    Animated.add(Animated.subtract(bx, ax), -S * 0.8),
    grow,
  );
  return (
    <>
      <Animated.View
        style={[
          styles.abs,
          styles.thread,
          {
            left: 0,
            top: rope - 0.75,
            width: 1,
            opacity: line,
            transform: [{ translateX: leftX }, { scaleX: span }],
          },
        ]}
      />
      <Actor
        color={colors[0]}
        size={S}
        x={Animated.add(ax, shift)}
        y={ay}
        rotate={ar}
        opacity={fade}
        mood={mood}
      />
      <Actor
        color={colors[1]}
        size={S}
        x={Animated.add(bx, shift)}
        y={by}
        rotate={br}
        opacity={fade}
        mood={mood}
      />
      <Burst x={W * 0.5} y={rope - S * 0.4} word="SNAP!" p={snap} size={72} />
    </>
  );
};

/** One piece swings across on a web, the other swings after it. */
export const SwingChase = ({ stage, colors, onDone }: SkitProps) => {
  const { W, H, floor, S } = stage;
  const ax = W * 0.5;
  const ay = -H * 0.6;
  const rope = floor - S - ay - H * 0.22;
  const [ta, tb] = useValues([0, 0]);
  const a = useRef(swingPath(ta, ax, ay, rope, -68, 68, S)).current;
  const b = useRef(swingPath(tb, ax, ay, rope, -68, 68, S)).current;
  const fadeOf = (t: Animated.Value) =>
    t.interpolate({
      inputRange: [0, 0.08, 0.92, 1],
      outputRange: [0, 1, 1, 0],
    });
  const tiltOf = (t: Animated.Value) =>
    t.interpolate({ inputRange: [0, 1], outputRange: ['40deg', '-40deg'] });

  useTimeline(
    () => [
      all(
        tween(ta, 1, 1400, Easing.inOut(Easing.sin)),
        seq(wait(300), tween(tb, 1, 1400, Easing.inOut(Easing.sin))),
      ),
    ],
    onDone,
  );

  const swinger = (
    t: Animated.Value,
    path: typeof a,
    color: ColorId,
    mood: Mood,
  ) => (
    <>
      <Thread
        x={ax}
        y={ay}
        length={rope}
        rotate={path.line}
        opacity={fadeOf(t)}
      />
      <Animated.View
        style={[
          styles.abs,
          {
            left: -S / 2,
            top: -S,
            width: S,
            height: S,
            opacity: fadeOf(t),
            transform: [
              { translateX: path.x },
              { translateY: path.y },
              { rotate: tiltOf(t) },
            ],
          },
        ]}
      >
        <Pawn color={color} height={S} theme="spider" animated mood={mood} />
      </Animated.View>
    </>
  );

  return (
    <>
      {swinger(tb, b, colors[1], 'moving')}
      {swinger(ta, a, colors[0], 'happy')}
    </>
  );
};

export const SKITS = [
  SwingKick,
  WebZap,
  FlipClash,
  UpsideDrop,
  TugOfWar,
  SwingChase,
];

const pickColors = (): [ColorId, ColorId] => {
  const first = ALL_COLORS[Math.floor(Math.random() * ALL_COLORS.length)];
  const rest = ALL_COLORS.filter(c => c !== first);
  return [first, rest[Math.floor(Math.random() * rest.length)]];
};

/** How long the hero die tumbles for. */
const DIE_ROLL_MS = 820;

interface Act {
  n: number;
  skit: number;
  colors: [ColorId, ColorId];
}

/**
 * The home screen's hero: a big die centre stage and the Spider pieces.
 * The die rolls, and the face it lands on picks the skit (six faces, six
 * skits); it hops up to a corner while the pieces act it out, then drops
 * back for the next roll. Tap the die to roll it yourself - with sound and
 * haptics; its own rolls between skits are silent.
 */
export const PieceShow = ({
  width,
  height,
}: {
  width: number;
  height: number;
}) => {
  const reduce = useReduceMotion();
  const [face, setFace] = useState(6);
  const [act, setAct] = useState<Act | null>(null);
  const spin = useRef(new Animated.Value(0)).current;
  /** 0: centre stage; 1: perched in the top corner out of the skit's way */
  const perch = useRef(new Animated.Value(0)).current;
  const idle = useRef(new Animated.Value(0)).current;
  const busy = useRef(false);
  const live = useRef(true);
  const last = useRef(-1);
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const nextRoll = useRef<ReturnType<typeof setTimeout> | null>(null);

  const later = (fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  };

  const roll = (loud: boolean) => {
    if (busy.current || !live.current) {
      return;
    }
    busy.current = true;
    if (nextRoll.current) {
      clearTimeout(nextRoll.current);
      nextRoll.current = null;
    }
    // never the same skit twice in a row
    let result = 1 + Math.floor(Math.random() * 6);
    if (result - 1 === last.current) {
      result = (result % 6) + 1;
    }
    last.current = result - 1;
    if (loud) {
      sfx.roll(DIE_ROLL_MS); // its haptics come with it
    }
    const impacts = rollImpacts(DIE_ROLL_MS);
    let shown = 0;
    impacts.forEach((at, i) =>
      later(() => {
        if (i === impacts.length - 1) {
          setFace(result);
          return;
        }
        let next = 1 + Math.floor(Math.random() * 6);
        if (next === shown) {
          next = (next % 6) + 1;
        }
        shown = next;
        setFace(next);
      }, at),
    );
    spin.setValue(0);
    Animated.timing(spin, {
      toValue: 1,
      duration: DIE_ROLL_MS,
      easing: rollEasing,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished || !live.current) {
        return;
      }
      setFace(result);
      // a beat to read the face, then the die clears the stage for its skit
      later(() => {
        Animated.spring(perch, {
          toValue: 1,
          friction: 6,
          tension: 60,
          useNativeDriver: true,
        }).start();
        setAct(prev => ({
          n: (prev?.n ?? 0) + 1,
          skit: result - 1,
          colors: pickColors(),
        }));
      }, 520);
    });
  };
  const rollRef = useRef(roll);
  rollRef.current = roll;

  const skitDone = () => {
    setAct(null);
    Animated.spring(perch, {
      toValue: 0,
      friction: 5,
      tension: 50,
      useNativeDriver: true,
    }).start();
    busy.current = false;
    nextRoll.current = setTimeout(
      () => rollRef.current(false),
      1400 + Math.random() * 900,
    );
  };

  useEffect(() => {
    live.current = true;
    if (reduce) {
      return;
    }
    const float = Animated.loop(
      Animated.sequence([
        Animated.timing(idle, {
          toValue: 1,
          duration: 1600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(idle, {
          toValue: 0,
          duration: 1600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    float.start();
    nextRoll.current = setTimeout(() => rollRef.current(false), 900);
    const pending = timers.current;
    return () => {
      live.current = false;
      float.stop();
      spin.stopAnimation();
      pending.forEach(clearTimeout);
      if (nextRoll.current) {
        clearTimeout(nextRoll.current);
      }
    };
  }, [idle, reduce, spin]);

  if (width <= 0) {
    return null;
  }
  const S = Math.round(Math.min(44, width * 0.12));
  const D = Math.round(Math.min(76, width * 0.22));
  const floor = height - 4;
  const centre = { x: width / 2 - D / 2, y: floor - D };
  const corner = { x: width - D * 0.95, y: -D * 0.1 };
  /** hops while it tumbles, landing on the floor */
  const bounce = spin.interpolate({
    inputRange: [0, 0.22, 0.48, 0.72, 0.88, 1],
    outputRange: [0, -D * 0.95, 0, -D * 0.32, 0, 0],
  });

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {/* the die's shadow, shrinking as it leaves the floor */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.abs,
          styles.dieShadow,
          {
            left: width / 2 - D * 0.42,
            top: floor - 7,
            width: D * 0.84,
            height: 12,
            borderRadius: 6,
            opacity: perch.interpolate({
              inputRange: [0, 0.4],
              outputRange: [0.5, 0],
              extrapolate: 'clamp',
            }),
            transform: [
              {
                scale: spin.interpolate({
                  inputRange: [0, 0.22, 0.48, 0.72, 0.88, 1],
                  outputRange: [1, 0.55, 1, 0.8, 1, 1],
                }),
              },
            ],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.abs,
          {
            left: 0,
            top: 0,
            width: D,
            height: D,
            transform: [
              {
                translateX: perch.interpolate({
                  inputRange: [0, 1],
                  outputRange: [centre.x, corner.x],
                }),
              },
              {
                translateY: Animated.add(
                  Animated.add(
                    perch.interpolate({
                      inputRange: [0, 1],
                      outputRange: [centre.y, corner.y],
                    }),
                    bounce,
                  ),
                  idle.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -3],
                  }),
                ),
              },
              {
                rotate: spin.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0deg', '1080deg'],
                }),
              },
              {
                scale: perch.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 0.55],
                }),
              },
            ],
          },
        ]}
      >
        <Pressable
          onPress={() => rollRef.current(true)}
          disabled={reduce}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Roll the die"
        >
          <Dice face={face} size={D} color={ColorId.Red} />
        </Pressable>
      </Animated.View>

      {act ? (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {React.createElement(SKITS[act.skit], {
            key: act.n,
            stage: { W: width, H: height, floor, S },
            colors: act.colors,
            onDone: skitDone,
          })}
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  abs: { position: 'absolute' },
  dieShadow: { backgroundColor: 'rgba(0,0,0,0.55)' },
  thread: {
    height: 1.5,
    backgroundColor: THREAD,
    transformOrigin: 'left center',
  },
});
