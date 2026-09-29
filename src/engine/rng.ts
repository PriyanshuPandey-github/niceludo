/* eslint-disable no-bitwise -- a PRNG is bit twiddling by definition */
/**
 * Provably-even dice.
 *
 * Design rules for this file - they are the whole point of the game:
 *
 *  1. One generator, one stream. Every player, human or CPU, draws from the
 *     same sequence in the same way. Nothing about the caller is an input.
 *  2. No board awareness. The generator never sees the game state, so it
 *     cannot "help" a player who is behind or throttle one who is ahead -
 *     the retention tricks other Ludo apps are accused of are structurally
 *     impossible here.
 *  3. Uniform mapping. `1 + (x % 6)` is *not* uniform over 2^32 values, so a
 *     die roll rejects the small biased tail before taking the remainder.
 *  4. Auditable. The generator state is serialised with the save file, and
 *     every roll is tallied per player so the in-game fairness panel can show
 *     the real distribution.
 *
 * The core is sfc32 (Chris Doty-Humphrey's "Small Fast Counting" PRNG):
 * 128 bits of state, passes PractRand well past any workload a board game
 * produces, and is trivial to serialise.
 */
import { DiceStats, RngState } from './types';

const U32 = 4294967296; // 2^32
/** Largest multiple of 6 that fits in a uint32 - the rejection threshold. */
const DIE_LIMIT = 4294967292;

const toUint32 = (n: number): number => n >>> 0;

/** Mix a 32-bit integer (Murmur3 finaliser) so weak seeds still spread out. */
const mix32 = (input: number): number => {
  let h = toUint32(input);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return toUint32(h ^ (h >>> 16));
};

/** Collect whatever entropy a phone-local, offline app can honestly get. */
const gatherEntropy = (): number[] => {
  const now = Date.now();
  const hi = Math.floor(now / U32);
  const clock = (globalThis as { performance?: { now?: () => number } })
    .performance;
  const perf =
    clock && typeof clock.now === 'function'
      ? Math.floor(clock.now() * 1000)
      : 0;
  return [
    toUint32(now),
    toUint32(hi ^ perf),
    toUint32(Math.random() * U32),
    toUint32(Math.random() * U32),
  ];
};

export const createRng = (seed?: number[]): RngState => {
  const words = seed && seed.length >= 4 ? seed : gatherEntropy();
  const state: RngState = {
    a: mix32(words[0]),
    b: mix32(words[1] ^ 0x9e3779b9),
    c: mix32(words[2] ^ 0x85ebca6b),
    d: mix32(words[3] ^ 0xc2b2ae35),
    draws: 0,
  };
  // Discard the first outputs so the seed itself is never observable.
  let warm = state;
  for (let i = 0; i < 20; i++) {
    warm = nextUint32(warm).state;
  }
  return { ...warm, draws: 0 };
};

/** One sfc32 step. Pure: returns the drawn word and the successor state. */
export const nextUint32 = (
  state: RngState,
): { value: number; state: RngState } => {
  let { a, b, c, d } = state;
  const t = toUint32(toUint32(a + b) + d);
  d = toUint32(d + 1);
  a = b ^ (b >>> 9);
  b = toUint32(c + (c << 3));
  c = (c << 21) | (c >>> 11);
  c = toUint32(c + t);
  return {
    value: t,
    state: { a, b, c: toUint32(c), d, draws: state.draws + 1 },
  };
};

/**
 * Uniform integer in `[0, bound)` using rejection sampling - every outcome
 * has exactly the same probability, with no modulo bias.
 */
export const nextInt = (
  state: RngState,
  bound: number,
): { value: number; state: RngState } => {
  const limit = U32 - (U32 % bound);
  let current = state;
  for (let guard = 0; guard < 64; guard++) {
    const draw = nextUint32(current);
    current = draw.state;
    if (draw.value < limit) {
      return { value: draw.value % bound, state: current };
    }
  }
  // Unreachable in practice (probability < 2^-64 per guard iteration).
  const fallback = nextUint32(current);
  return { value: fallback.value % bound, state: fallback.state };
};

/** A single fair die roll: 1..6, each with probability exactly 1/6. */
export const rollDie = (
  state: RngState,
): { value: number; state: RngState } => {
  let current = state;
  for (let guard = 0; guard < 64; guard++) {
    const draw = nextUint32(current);
    current = draw.state;
    if (draw.value < DIE_LIMIT) {
      return { value: 1 + (draw.value % 6), state: current };
    }
  }
  const fallback = nextUint32(current);
  return { value: 1 + (fallback.value % 6), state: fallback.state };
};

/** Fisher-Yates using the same stream (used to shuffle CPU tie-breaks). */
export const shuffle = <T>(
  items: T[],
  state: RngState,
): { value: T[]; state: RngState } => {
  const out = items.slice();
  let current = state;
  for (let i = out.length - 1; i > 0; i--) {
    const draw = nextInt(current, i + 1);
    current = draw.state;
    const j = draw.value;
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return { value: out, state: current };
};

export const emptyDiceStats = (playerCount: number): DiceStats => ({
  faces: Array.from({ length: playerCount }, () => [0, 0, 0, 0, 0, 0]),
});

export const recordRoll = (
  stats: DiceStats,
  player: number,
  die: number,
): DiceStats => ({
  faces: stats.faces.map((row, index) =>
    index === player
      ? row.map((count, face) => (face === die - 1 ? count + 1 : count))
      : row,
  ),
});

export const totalRolls = (stats: DiceStats, player: number): number =>
  stats.faces[player].reduce((sum, count) => sum + count, 0);

/**
 * Pearson chi-square statistic for one player's rolls against the uniform
 * expectation. Shown in the fairness panel; 5 degrees of freedom, so values
 * around 4 are typical and anything under ~11.07 is within the 95% band.
 */
export const chiSquare = (stats: DiceStats, player: number): number => {
  const counts = stats.faces[player];
  const n = counts.reduce((sum, count) => sum + count, 0);
  if (n === 0) {
    return 0;
  }
  const expected = n / 6;
  return counts.reduce(
    (sum, count) => sum + ((count - expected) * (count - expected)) / expected,
    0,
  );
};
