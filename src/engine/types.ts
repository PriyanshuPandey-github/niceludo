/**
 * Core domain types for the NiceLudo engine.
 *
 * The engine is 100% pure: every function takes a state and returns a new
 * state. No timers, no I/O, no React. That keeps the rules testable (see
 * `__tests__/`) and makes save/resume a matter of JSON round-tripping.
 */

/** Board seats, ordered clockwise starting from the top-left quadrant. */
export enum ColorId {
  Red = 0,
  Green = 1,
  Yellow = 2,
  Blue = 3,
}

export const ALL_COLORS: ColorId[] = [
  ColorId.Red,
  ColorId.Green,
  ColorId.Yellow,
  ColorId.Blue,
];

export type SeatType = 'human' | 'cpu';

/** Difficulty only changes how well the CPU *chooses* a move - never the dice. */
export type Difficulty = 'easy' | 'normal' | 'hard';

export interface SeatConfig {
  color: ColorId;
  type: SeatType;
  name: string;
}

/**
 * A token's position is a single number ("steps"):
 *   -1        -> parked in the player's base yard
 *    0 .. 50  -> on the shared 52-cell ring, `0` being that player's start cell
 *   51 .. 55  -> the five cells of the player's private home column
 *   56        -> home (finished)
 */
export const IN_BASE = -1;
export const HOME_ENTRY = 51;
export const FINISHED = 56;

export interface PlayerState {
  color: ColorId;
  type: SeatType;
  name: string;
  /** steps value for each of the four tokens */
  tokens: number[];
  /** finishing position (1 = winner); null while still playing */
  rank: number | null;
}

export interface RngState {
  a: number;
  b: number;
  c: number;
  d: number;
  /** how many 32-bit words have been drawn - handy for audits */
  draws: number;
}

/** Per-player tally of every face ever rolled. Used by the fairness panel. */
export interface DiceStats {
  /** faces[playerIndex][face-1] */
  faces: number[][];
}

export type GamePhase = 'roll' | 'select' | 'over';

export interface GameState {
  version: number;
  players: PlayerState[];
  /** index into `players` whose turn it is */
  turn: number;
  /** last rolled value, or null when the die has not been rolled yet */
  die: number | null;
  /** consecutive sixes rolled by the current player */
  sixStreak: number;
  phase: GamePhase;
  rng: RngState;
  stats: DiceStats;
  difficulty: Difficulty;
  turnCount: number;
  startedAt: number;
  updatedAt: number;
}

export interface Move {
  /** index of the token inside `player.tokens` */
  token: number;
  from: number;
  to: number;
  /** tokens captured by this move, as [playerIndex, tokenIndex] pairs */
  captures: Array<[number, number]>;
  /** true when the move parks the token in the centre */
  finishes: boolean;
  /** true when the token leaves the base yard */
  leavesBase: boolean;
}

export type GameEvent =
  | { type: 'roll'; player: number; die: number }
  | { type: 'move'; player: number; token: number; from: number; to: number }
  | { type: 'capture'; player: number; token: number; by: number }
  | { type: 'finish'; player: number; token: number }
  | { type: 'rank'; player: number; rank: number }
  | { type: 'extraTurn'; player: number; reason: 'six' | 'capture' | 'finish' }
  | { type: 'forfeit'; player: number; reason: 'threeSixes' | 'noMoves' }
  | { type: 'turn'; player: number }
  | { type: 'gameOver' };
