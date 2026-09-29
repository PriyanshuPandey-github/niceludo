/**
 * Spider mask eyes, and the expressions they pull.
 *
 * The eyes have no pupils, so - like a real mask's lenses - they emote with
 * their shutters: black lids close over the white lens from above (tilting
 * for angry or worried brows) and from below (curved, for a happy squint),
 * and the whole eye can widen, narrow or glance. A `Mood` picks the base
 * pose; idle pieces also blink and pull random faces on their own.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  ClipPath,
  Defs,
  G,
  LinearGradient,
  Path,
  Stop,
} from 'react-native-svg';

// ------------------------------------------------------------------ poses
export interface EyePose {
  /** upper lid: 0 open .. 1 shut */
  top: number;
  /** upper lid tilt in degrees; + drops the inner corner (angry), - raises it */
  tilt: number;
  /** lower lid: 0 open .. 1 shut, curved upward (happy squint) */
  bottom: number;
  /** horizontal glance, -1 (left) .. 1 (right) */
  look: number;
  /** vertical glance, -1 (up) .. 1 (down) */
  lift: number;
  /** overall size of the eye */
  scale: number;
}

const pose = (p: Partial<EyePose>): EyePose => ({
  top: 0,
  tilt: 0,
  bottom: 0,
  look: 0,
  lift: 0,
  scale: 1,
  ...p,
});

export const POSES = {
  open: pose({}),
  blink: pose({ top: 1 }),
  wide: pose({ scale: 1.08 }),
  determined: pose({ top: 0.32, tilt: 16, bottom: 0.12, scale: 0.98 }),
  worried: pose({ top: 0.24, tilt: -18, lift: -0.3, scale: 1.02 }),
  happy: pose({ bottom: 0.35, scale: 1.02 }),
  dazed: pose({ top: 0.46, tilt: -14, bottom: 0.1, lift: 0.4, scale: 0.9 }),
  sleepy: pose({ top: 0.6, tilt: -4 }),
  glanceLeft: pose({ top: 0.14, bottom: 0.1, look: -1 }),
  glanceRight: pose({ top: 0.14, bottom: 0.1, look: 1 }),
  lookUp: pose({ bottom: 0.12, lift: -1 }),
  squint: pose({ top: 0.34, tilt: 14, bottom: 0.3, look: 0.9 }),
  surprised: pose({ scale: 1.14 }),
};
export type PoseName = keyof typeof POSES;

/** What is happening to the piece; picks its resting expression. */
export type Mood = 'idle' | 'ready' | 'danger' | 'moving' | 'happy' | 'hurt';

const MOOD_POSE: Record<Mood, PoseName> = {
  idle: 'open',
  ready: 'wide',
  danger: 'worried',
  moving: 'determined',
  happy: 'happy',
  hurt: 'dazed',
};
const BLINKS: Record<Mood, boolean> = {
  idle: true,
  ready: true,
  danger: true,
  moving: false,
  happy: false,
  hurt: false,
};
const IDLE_FACES: PoseName[] = [
  'glanceLeft',
  'glanceRight',
  'lookUp',
  'sleepy',
  'squint',
  'surprised',
  'happy',
];

const between = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

// -------------------------------------------------------------- behaviour
/** Eases numerically between poses whenever `target` changes. */
const useTween = (target: EyePose, ms: number, enabled: boolean): EyePose => {
  const [current, setCurrent] = useState(target);
  const currentRef = useRef(target);
  useEffect(() => {
    if (!enabled) {
      currentRef.current = target;
      setCurrent(target);
      return;
    }
    const from = currentRef.current;
    const start = Date.now();
    let frame = 0;
    const step = () => {
      const f = Math.min(1, (Date.now() - start) / ms);
      const e = f < 0.5 ? 2 * f * f : 1 - (-2 * f + 2) ** 2 / 2;
      const next = {} as EyePose;
      (Object.keys(target) as Array<keyof EyePose>).forEach(key => {
        next[key] = from[key] + (target[key] - from[key]) * e;
      });
      currentRef.current = next;
      setCurrent(next);
      if (f < 1) {
        frame = requestAnimationFrame(step);
      }
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, ms, enabled]);
  return current;
};

/**
 * The live eye pose for a mood: the mood's resting face, plus blinks and -
 * when idle - the odd random expression, each piece on its own timers.
 */
export const useEyes = (mood: Mood, animated: boolean): EyePose => {
  const [blinking, setBlinking] = useState(false);
  const [action, setAction] = useState<PoseName | null>(null);

  useEffect(() => {
    setAction(null);
    setBlinking(false);
    if (!animated) {
      return;
    }
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    const later = (ms: number, fn: () => void) => {
      timers.push(setTimeout(fn, ms));
    };
    if (BLINKS[mood]) {
      const blink = () => {
        setBlinking(true);
        later(130, () => setBlinking(false));
        later(between(2000, 5500), blink);
      };
      later(between(400, 4000), blink);
    }
    if (mood === 'idle') {
      const face = () => {
        setAction(IDLE_FACES[Math.floor(Math.random() * IDLE_FACES.length)]);
        later(between(700, 1600), () => setAction(null));
        later(between(3500, 8000), face);
      };
      later(between(1500, 7000), face);
    }
    return () => timers.forEach(clearTimeout);
  }, [mood, animated]);

  const name: PoseName = blinking ? 'blink' : action ?? MOOD_POSE[mood];
  return useTween(POSES[name], blinking ? 65 : 170, animated);
};

// -------------------------------------------------------------- geometry
// Traced from the reference artwork in its own pixel space (left eye,
// roughly 260x440): a black frame with a sharp upward spike and a thick top
// edge, and a white lens whose inner corner points at the nose.
type Seg = [number, number, number, number, number, number];
const EYE_FRAME: { start: [number, number]; segs: Seg[] } = {
  start: [190, 30],
  segs: [
    [220, 95, 320, 170, 355, 262], // spike tip down to the inner corner
    [345, 360, 300, 450, 215, 470], // inner corner round to the bottom
    [140, 470, 100, 380, 95, 280], // bottom up the outer edge
    [95, 180, 150, 110, 190, 30], // outer edge sweeping up into the spike
  ],
};
const EYE_LENS: { start: [number, number]; segs: Seg[] } = {
  start: [157, 122],
  segs: [
    [230, 135, 310, 200, 346, 272],
    [330, 350, 280, 410, 212, 410],
    [150, 410, 128, 330, 130, 250],
    [131, 190, 140, 140, 157, 122],
  ],
};
/** Reference pixels -> piece units: the pair nearly fills the face. */
const EYE_SCALE = 0.12;
const EYE_ORIGIN = { refX: 95, refY: 30, x: 15, y: 20 };
const ref = (rx: number, ry: number) => ({
  x: EYE_ORIGIN.x + (rx - EYE_ORIGIN.refX) * EYE_SCALE,
  y: EYE_ORIGIN.y + (ry - EYE_ORIGIN.refY) * EYE_SCALE,
});
// Left-eye lens bounds and the eye's centre, in piece units.
const LENS = {
  left: ref(128, 0).x,
  right: ref(348, 0).x,
  top: ref(0, 122).y,
  bottom: ref(0, 410).y,
};
const EYE_C = { x: 31, y: 47 };
const LOOK = 3.5;
const LIFT = 2.5;

type Pt = { x: number; y: number };
const fmt = (p: Pt) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`;

/**
 * Everything is computed straight into piece space (scaled, glanced, and
 * mirrored for the right eye) so no clip ever sits under a transform.
 */
const eyeShapes = (p: EyePose, mirror: boolean) => {
  const place = ({ x, y }: Pt): Pt => {
    const sx = EYE_C.x + (x - EYE_C.x) * p.scale;
    const sy = EYE_C.y + (y - EYE_C.y) * p.scale;
    return {
      x: (mirror ? 100 - sx : sx) + p.look * LOOK,
      y: sy + p.lift * LIFT,
    };
  };
  const trace = (shape: { start: [number, number]; segs: Seg[] }) =>
    `M${fmt(place(ref(...shape.start)))} ` +
    shape.segs
      .map(
        ([ax, ay, bx, by, cx, cy]) =>
          `C${[ref(ax, ay), ref(bx, by), ref(cx, cy)]
            .map(q => fmt(place(q)))
            .join(' ')}`,
      )
      .join(' ') +
    ' Z';

  const h = LENS.bottom - LENS.top;
  const l = LENS.left - 6;
  const r = LENS.right + 6;
  // upper lid: everything above a (tilted) line
  const slope = Math.tan((p.tilt * Math.PI) / 180);
  const lidY = (x: number) =>
    LENS.top + p.top * h * 1.04 + (x - EYE_C.x) * slope;
  const upper = [
    { x: l, y: LENS.top - 14 },
    { x: r, y: LENS.top - 14 },
    { x: r, y: lidY(r) },
    { x: l, y: lidY(l) },
  ].map(place);
  // lower lid: everything below an upward arc
  const y0 = LENS.bottom - p.bottom * h * 1.04;
  const bump = p.bottom * h * 0.55;
  const lower = [
    { x: l, y: LENS.bottom + 10 },
    { x: l, y: y0 },
    { x: EYE_C.x, y: y0 - 2 * bump },
    { x: r, y: y0 },
    { x: r, y: LENS.bottom + 10 },
  ].map(place);

  return {
    frame: trace(EYE_FRAME),
    lens: trace(EYE_LENS),
    upperLid: `M${upper.map(fmt).join(' L')} Z`,
    lowerLid: `M${fmt(lower[0])} L${fmt(lower[1])} Q${fmt(lower[2])} ${fmt(
      lower[3],
    )} L${fmt(lower[4])} Z`,
  };
};

const INK = '#0E0E14';

/** Both mask eyes in a given pose, drawn on the 100-unit piece grid. */
export const MaskEyes = ({ id, pose: p }: { id: string; pose: EyePose }) => {
  const eyes = [false, true].map(mirror => eyeShapes(p, mirror));
  return (
    <>
      <Defs>
        <LinearGradient id={`${id}-lens`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor="#FFFFFF" />
          <Stop offset="100%" stopColor="#D9DEEC" />
        </LinearGradient>
        {eyes.map((eye, i) => (
          <ClipPath key={i} id={`${id}-eye${i}`}>
            <Path d={eye.frame} />
          </ClipPath>
        ))}
      </Defs>
      {eyes.map((eye, i) => (
        <G key={i}>
          <Path d={eye.frame} fill={INK} />
          <Path d={eye.lens} fill={`url(#${id}-lens)`} />
          {/* lids match the frame, so clipping to it leaves no seam */}
          <G clipPath={`url(#${id}-eye${i})`}>
            <Path d={eye.upperLid} fill={INK} />
            <Path d={eye.lowerLid} fill={INK} />
          </G>
        </G>
      ))}
    </>
  );
};
