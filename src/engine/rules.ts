/**
 * Ludo rules.
 *
 * House rules (the familiar ones, matching how the popular mobile version
 * plays):
 *  - A token leaves the base only on a 6.
 *  - A 6 grants another roll, but three sixes in a row burn the turn.
 *  - Landing on an opponent sends every one of their tokens on that cell
 *    back to base, unless the cell is protected. A capture grants another roll.
 *  - The eight protected cells are the four coloured start cells and the four
 *    star cells.
 *  - Tokens of the same colour may share a cell; they never block anyone.
 *  - The centre must be reached by an exact count; a token that would overshoot
 *    simply cannot move. Bringing a token home grants another roll.
 *  - A player is ranked as soon as all four tokens are home; the last player
 *    left takes the final rank.
 */
import {
  ALL_COLORS,
  ColorId,
  DiceStats,
  Difficulty,
  FINISHED,
  GameEvent,
  GameState,
  HOME_ENTRY,
  IN_BASE,
  Move,
  PlayerState,
  SeatConfig,
} from './types';
import { isSafeCell, ringIndex } from './board';
import { createRng, emptyDiceStats, recordRoll, rollDie } from './rng';

export const SAVE_VERSION = 1;
export const TOKENS_PER_PLAYER = 4;
export const MAX_SIX_STREAK = 3;

export const createGame = (
  seats: SeatConfig[],
  difficulty: Difficulty = 'normal',
  seed?: number[],
): GameState => {
  // Seats always play in clockwise board order, whatever order they were
  // configured in, so the turn rotation matches what the player sees.
  const players: PlayerState[] = seats
    .slice()
    .sort((a, b) => ALL_COLORS.indexOf(a.color) - ALL_COLORS.indexOf(b.color))
    .map(seat => ({
      color: seat.color,
      type: seat.type,
      name: seat.name,
      tokens: new Array(TOKENS_PER_PLAYER).fill(IN_BASE),
      rank: null,
    }));
  const now = Date.now();
  return {
    version: SAVE_VERSION,
    players,
    turn: 0,
    die: null,
    sixStreak: 0,
    phase: 'roll',
    rng: createRng(seed),
    stats: emptyDiceStats(players.length),
    difficulty,
    turnCount: 0,
    startedAt: now,
    updatedAt: now,
  };
};

export const currentPlayer = (state: GameState): PlayerState =>
  state.players[state.turn];

export const isFinished = (steps: number): boolean => steps === FINISHED;
export const isOnTrack = (steps: number): boolean =>
  steps >= 0 && steps < HOME_ENTRY;

export const tokensHome = (player: PlayerState): number =>
  player.tokens.filter(isFinished).length;

/** How far a player has travelled in total - used for ranking and AI. */
export const progressOf = (player: PlayerState): number =>
  player.tokens.reduce((sum, steps) => sum + Math.max(0, steps), 0);

export const hasWon = (player: PlayerState): boolean =>
  player.tokens.every(isFinished);

/** Every token (of any other player) standing on a given ring cell. */
export const occupantsOfCell = (
  state: GameState,
  cell: number,
  exceptPlayer: number,
): Array<[number, number]> => {
  const found: Array<[number, number]> = [];
  state.players.forEach((player, playerIndex) => {
    if (playerIndex === exceptPlayer || player.rank !== null) {
      return;
    }
    player.tokens.forEach((steps, tokenIndex) => {
      if (isOnTrack(steps) && ringIndex(player.color, steps) === cell) {
        found.push([playerIndex, tokenIndex]);
      }
    });
  });
  return found;
};

/** All moves the current player may legally make with `die`. */
export const legalMoves = (state: GameState, die: number): Move[] => {
  const playerIndex = state.turn;
  const player = state.players[playerIndex];
  if (!player || player.rank !== null || die < 1 || die > 6) {
    return [];
  }
  const moves: Move[] = [];
  player.tokens.forEach((steps, token) => {
    let to: number;
    if (steps === IN_BASE) {
      if (die !== 6) {
        return;
      }
      to = 0;
    } else if (steps === FINISHED) {
      return;
    } else {
      to = steps + die;
      if (to > FINISHED) {
        return; // exact count required for the centre
      }
    }
    const captures =
      to < HOME_ENTRY && !isSafeCell(ringIndex(player.color, to))
        ? occupantsOfCell(state, ringIndex(player.color, to), playerIndex)
        : [];
    moves.push({
      token,
      from: steps,
      to,
      captures,
      finishes: to === FINISHED,
      leavesBase: steps === IN_BASE,
    });
  });
  return moves;
};

const nextActiveSeat = (state: GameState, from: number): number => {
  const count = state.players.length;
  for (let step = 1; step <= count; step++) {
    const candidate = (from + step) % count;
    if (state.players[candidate].rank !== null) {
      continue;
    }
    return candidate;
  }
  return from;
};

const activePlayers = (state: GameState): number =>
  state.players.filter(player => player.rank === null).length;

/** Roll for the current player. Also handles the three-sixes forfeit. */
export const roll = (
  state: GameState,
): { state: GameState; events: GameEvent[]; moves: Move[] } => {
  if (state.phase !== 'roll') {
    return { state, events: [], moves: [] };
  }
  const draw = rollDie(state.rng);
  const die = draw.value;
  const stats: DiceStats = recordRoll(state.stats, state.turn, die);
  const events: GameEvent[] = [{ type: 'roll', player: state.turn, die }];
  const sixStreak = die === 6 ? state.sixStreak + 1 : 0;

  let next: GameState = {
    ...state,
    rng: draw.state,
    stats,
    die,
    sixStreak,
    updatedAt: Date.now(),
  };

  if (die === 6 && sixStreak >= MAX_SIX_STREAK) {
    events.push({ type: 'forfeit', player: state.turn, reason: 'threeSixes' });
    return { state: endTurn(next, events), events, moves: [] };
  }

  const moves = legalMoves(next, die);
  if (moves.length === 0) {
    events.push({ type: 'forfeit', player: state.turn, reason: 'noMoves' });
    // A six with no legal move still counts towards the streak, but the turn
    // passes on - there is nothing to move.
    return { state: endTurn(next, events), events, moves: [] };
  }

  next = { ...next, phase: 'select' };
  return { state: next, events, moves };
};

/** Hand the turn to the next seat and reset per-turn bookkeeping. */
const endTurn = (state: GameState, events: GameEvent[]): GameState => {
  if (state.phase === 'over') {
    return state;
  }
  const turn = nextActiveSeat(state, state.turn);
  events.push({ type: 'turn', player: turn });
  return {
    ...state,
    turn,
    die: null,
    sixStreak: 0,
    phase: 'roll',
    turnCount: state.turnCount + 1,
    updatedAt: Date.now(),
  };
};

/** Apply a move produced by `legalMoves`. */
export const applyMove = (
  state: GameState,
  move: Move,
): { state: GameState; events: GameEvent[] } => {
  const events: GameEvent[] = [];
  const playerIndex = state.turn;
  const die = state.die ?? 0;

  const players = state.players.map((player, index) => {
    if (index !== playerIndex) {
      return player;
    }
    const tokens = player.tokens.slice();
    tokens[move.token] = move.to;
    return { ...player, tokens };
  });

  events.push({
    type: 'move',
    player: playerIndex,
    token: move.token,
    from: move.from,
    to: move.to,
  });

  move.captures.forEach(([victim, token]) => {
    const player = players[victim];
    const tokens = player.tokens.slice();
    tokens[token] = IN_BASE;
    players[victim] = { ...player, tokens };
    events.push({ type: 'capture', player: victim, token, by: playerIndex });
  });

  if (move.finishes) {
    events.push({ type: 'finish', player: playerIndex, token: move.token });
  }

  let next: GameState = { ...state, players, updatedAt: Date.now() };

  // Ranking: a player who just brought every token home is placed.
  const alreadyRanked = next.players.filter(p => p.rank !== null).length;
  if (
    next.players[playerIndex].rank === null &&
    hasWon(next.players[playerIndex])
  ) {
    const rank = alreadyRanked + 1;
    next = {
      ...next,
      players: next.players.map((player, index) =>
        index === playerIndex ? { ...player, rank } : player,
      ),
    };
    events.push({ type: 'rank', player: playerIndex, rank });
  }

  // The game is done once at most one player is still going.
  if (activePlayers(next) <= 1) {
    const rankedCount = next.players.filter(p => p.rank !== null).length;
    next = {
      ...next,
      players: next.players.map(player =>
        player.rank === null ? { ...player, rank: rankedCount + 1 } : player,
      ),
      phase: 'over',
      die: null,
      updatedAt: Date.now(),
    };
    next.players.forEach((player, index) => {
      if (state.players[index].rank === null && player.rank !== null) {
        events.push({ type: 'rank', player: index, rank: player.rank });
      }
    });
    events.push({ type: 'gameOver' });
    return { state: next, events };
  }

  // Extra roll for a six, a capture, or a token brought home.
  const extraReason: 'six' | 'capture' | 'finish' | null = move.captures.length
    ? 'capture'
    : move.finishes
    ? 'finish'
    : die === 6
    ? 'six'
    : null;

  if (extraReason && next.players[playerIndex].rank === null) {
    events.push({
      type: 'extraTurn',
      player: playerIndex,
      reason: extraReason,
    });
    return {
      state: {
        ...next,
        phase: 'roll',
        die: null,
        // Only a six keeps the streak alive - a capture or a finish
        // grants the extra roll but clears the streak.
        sixStreak: die === 6 ? state.sixStreak : 0,
      },
      events,
    };
  }

  return { state: endTurn(next, events), events };
};

/** Final standings, best first. */
export const standings = (state: GameState): PlayerState[] =>
  state.players
    .slice()
    .sort(
      (a, b) =>
        (a.rank ?? 99) - (b.rank ?? 99) || progressOf(b) - progressOf(a),
    );

export const colorOfSeat = (state: GameState, index: number): ColorId =>
  state.players[index].color;
