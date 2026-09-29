/**
 * Animation lab scenarios: short scripts that set up a demo board and play
 * one situation through the real game screen, so every animation can be
 * previewed exactly as it appears in a game.
 *
 * Boards are built with the real engine; rolls here only choose which face
 * the animation lands on - they never touch the dice stream, and demo games
 * are never saved or tallied.
 */
import {
  ALL_COLORS,
  ColorId,
  FINISHED,
  GameState,
  IN_BASE,
  START_INDEX,
  TRACK_LENGTH,
  createGame,
  ringIndex,
} from '../engine';
import type { GameDemo } from '../screens/GameScreen';
import type { Mood } from '../components/eyes';
import { PLAYER_COLORS } from '../theme/theme';

export interface Scenario {
  id: string;
  label: string;
  /** one line on what it shows */
  hint: string;
  /** only meaningful with Spider pieces (the eyes) */
  heroOnly?: boolean;
  run: (demo: GameDemo) => Promise<void>;
}

const pause = (ms: number) =>
  new Promise<void>(resolve => setTimeout(resolve, ms));

/** A fixed seed: boards are laid out by hand, never rolled. */
const SEED = [11, 22, 33, 44];

/** A demo table: every seat a human (so nothing plays by itself). */
export const labGame = (colors: ColorId[] = ALL_COLORS): GameState =>
  createGame(
    colors.map(color => ({
      color,
      type: 'human' as const,
      name: PLAYER_COLORS[color].label,
    })),
    'normal',
    SEED,
  );

const seatOf = (state: GameState, color: ColorId) =>
  state.players.findIndex(p => p.color === color);

/** Place a colour's tokens (steps per token; missing ones stay put). */
export const withTokens = (
  state: GameState,
  color: ColorId,
  tokens: number[],
): GameState => ({
  ...state,
  players: state.players.map(p =>
    p.color === color
      ? { ...p, tokens: p.tokens.map((steps, i) => tokens[i] ?? steps) }
      : p,
  ),
});

export const withTurn = (state: GameState, color: ColorId): GameState => ({
  ...state,
  turn: seatOf(state, color),
  phase: 'roll',
  die: null,
});

/** Steps for `victim` to stand on the cell `attacker` reaches at `steps`. */
export const stepsOnto = (
  attacker: ColorId,
  steps: number,
  victim: ColorId,
): number =>
  (ringIndex(attacker, steps) - START_INDEX[victim] + TRACK_LENGTH) %
  TRACK_LENGTH;

const randomFace = () => 1 + Math.floor(Math.random() * 6);

/** Roll `face` for the current seat, then move `token` by it. */
const rollAndMove = async (demo: GameDemo, token: number, face: number) => {
  await demo.roll(face);
  await pause(250);
  await demo.move(token, face);
};

/** A board with a few pieces out, used as the resting scene. */
export const idleBoard = (): GameState => {
  let state = labGame();
  state = withTokens(state, ColorId.Red, [5, IN_BASE, IN_BASE, IN_BASE]);
  state = withTokens(state, ColorId.Green, [12, 3, IN_BASE, IN_BASE]);
  state = withTokens(state, ColorId.Yellow, [20, IN_BASE, IN_BASE, IN_BASE]);
  state = withTokens(state, ColorId.Blue, [8, IN_BASE, IN_BASE, IN_BASE]);
  return withTurn(state, ColorId.Red);
};

const MOODS: Mood[] = ['idle', 'ready', 'danger', 'moving', 'happy', 'hurt'];

export const SCENARIOS: Scenario[] = [
  {
    id: 'roll',
    label: 'Dice roll',
    hint: 'The die tumbles and lands on a face',
    run: async demo => {
      demo.reset(withTurn(idleBoard(), ColorId.Red));
      await demo.roll(randomFace());
    },
  },
  {
    id: 'trays',
    label: 'Every tray',
    hint: 'Each corner rolls in turn',
    run: async demo => {
      for (const color of ALL_COLORS) {
        demo.reset(withTurn(idleBoard(), color));
        await demo.roll(randomFace());
        await pause(300);
      }
    },
  },
  {
    id: 'leave',
    label: 'Leave yard',
    hint: 'Roll a 6 and bring a piece out',
    run: async demo => {
      demo.reset(
        withTurn(withTokens(labGame(), ColorId.Red, [IN_BASE]), ColorId.Red),
      );
      await rollAndMove(demo, 0, 6);
    },
  },
  {
    id: 'move',
    label: 'Move',
    hint: 'A normal move along the track',
    run: async demo => {
      demo.reset(
        withTurn(withTokens(idleBoard(), ColorId.Red, [2]), ColorId.Red),
      );
      await rollAndMove(demo, 0, 5);
    },
  },
  {
    id: 'capture',
    label: 'Capture',
    hint: 'Land on a rival and send it home',
    run: async demo => {
      let state = withTokens(labGame(), ColorId.Red, [4]);
      state = withTokens(state, ColorId.Green, [
        IN_BASE,
        stepsOnto(ColorId.Red, 7, ColorId.Green),
      ]);
      demo.reset(withTurn(state, ColorId.Red));
      await rollAndMove(demo, 0, 3);
    },
  },
  {
    id: 'double',
    label: 'Double capture',
    hint: 'Two rivals on one cell, both sent home',
    run: async demo => {
      const onto = stepsOnto(ColorId.Red, 7, ColorId.Green);
      let state = withTokens(labGame(), ColorId.Red, [4]);
      state = withTokens(state, ColorId.Green, [IN_BASE, onto, onto]);
      demo.reset(withTurn(state, ColorId.Red));
      await rollAndMove(demo, 0, 3);
    },
  },
  {
    id: 'home',
    label: 'Reach home',
    hint: 'A piece finishes in the centre',
    run: async demo => {
      demo.reset(
        withTurn(
          withTokens(idleBoard(), ColorId.Red, [FINISHED - 4]),
          ColorId.Red,
        ),
      );
      await rollAndMove(demo, 0, 4);
    },
  },
  {
    id: 'win',
    label: 'Win',
    hint: 'The last piece home wins the game',
    run: async demo => {
      const state = withTokens(
        labGame([ColorId.Red, ColorId.Yellow]),
        ColorId.Red,
        [FINISHED, FINISHED, FINISHED, FINISHED - 3],
      );
      demo.reset(withTurn(state, ColorId.Red));
      await rollAndMove(demo, 3, 3);
    },
  },
  {
    id: 'eyes',
    label: 'Eye moods',
    hint: 'Idle, ready, danger, moving, happy, hurt',
    heroOnly: true,
    run: async demo => {
      demo.reset(idleBoard());
      for (const mood of MOODS) {
        demo.setMood(mood);
        await pause(1300);
      }
      demo.setMood(null);
    },
  },
];

/** The scenarios worth showing for a piece theme. */
export const scenariosFor = (hero: boolean): Scenario[] =>
  SCENARIOS.filter(s => hero || !s.heroOnly);
