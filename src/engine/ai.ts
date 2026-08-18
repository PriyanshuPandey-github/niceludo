/**
 * CPU opponent.
 *
 * The CPU is a plain heuristic search over the moves the rules already
 * declared legal. It has exactly the same information a human has on screen
 * and it rolls the same dice from the same stream - difficulty changes how
 * often it picks the best-scoring move, never what it is allowed to do.
 */
import {
  Difficulty,
  FINISHED,
  GameState,
  HOME_ENTRY,
  IN_BASE,
  Move,
  RngState,
} from './types';
import { isSafeCell, ringIndex, TRACK_LENGTH } from './board';
import { nextInt, shuffle } from './rng';
import { isOnTrack, occupantsOfCell } from './rules';

/** How exposed a cell is: how many opponents sit 1..6 steps behind it. */
const threatLevel = (
  state: GameState,
  playerIndex: number,
  ringCell: number,
): number => {
  if (isSafeCell(ringCell)) {
    return 0;
  }
  let threats = 0;
  state.players.forEach((player, index) => {
    if (index === playerIndex || player.rank !== null) {
      return;
    }
    player.tokens.forEach(steps => {
      if (!isOnTrack(steps)) {
        return;
      }
      const from = ringIndex(player.color, steps);
      const gap = (ringCell - from + TRACK_LENGTH) % TRACK_LENGTH;
      if (gap >= 1 && gap <= 6) {
        // A token cannot pass its own home entry, so only count chasers that
        // would still be on the ring after the hop.
        if (steps + gap < HOME_ENTRY) {
          threats += 1;
        }
      }
    });
  });
  return threats;
};

export interface ScoredMove {
  move: Move;
  score: number;
}

export const scoreMove = (
  state: GameState,
  move: Move,
  die: number,
): number => {
  const playerIndex = state.turn;
  const player = state.players[playerIndex];
  const color = player.color;
  let score = 0;

  // Bringing a token home is always worth the most.
  if (move.finishes) {
    score += 1000;
  }

  // Captures: worth more the further the victim had travelled.
  move.captures.forEach(([victim, token]) => {
    const lost = Math.max(0, state.players[victim].tokens[token]);
    score += 620 + lost * 4;
  });

  // Entering the private home column puts a token permanently out of reach.
  if (move.to >= HOME_ENTRY && !move.finishes) {
    score += 340 + (move.to - HOME_ENTRY) * 12;
  }

  // Getting out of the yard, especially while the yard is crowded.
  if (move.leavesBase) {
    const parked = player.tokens.filter(steps => steps === IN_BASE).length;
    const running = player.tokens.filter(isOnTrack).length;
    score += 300 + parked * 25 - running * 20;
  }

  if (move.to < HOME_ENTRY) {
    const toCell = ringIndex(color, move.to);
    const danger = threatLevel(state, playerIndex, toCell);
    const stacked = player.tokens.filter(
      (steps, index) =>
        index !== move.token &&
        isOnTrack(steps) &&
        ringIndex(color, steps) === toCell,
    ).length;

    if (isSafeCell(toCell)) {
      score += 150;
    } else {
      // Each chaser is one sixth of a chance to lose everything this token has.
      score -= danger * (55 + move.to * 2.2);
      if (stacked > 0) {
        score += 40; // sharing a cell at least splits the loss
      }
    }

    // Landing right in front of an opponent we could capture next turn.
    const ahead = occupantsOfCell(
      state,
      (toCell + 3) % TRACK_LENGTH,
      playerIndex,
    );
    if (ahead.length > 0) {
      score += 25;
    }
  }

  if (move.from >= 0 && move.from < HOME_ENTRY) {
    // Escaping a threatened cell is as valuable as the progress it protects.
    const fromCell = ringIndex(color, move.from);
    const escaping = threatLevel(state, playerIndex, fromCell);
    score += escaping * (50 + move.from * 2);
  }

  // A six is the only way out of the yard: spending one elsewhere while
  // pawns are still parked wastes the chance to bring one out.
  if (die === 6 && !move.leavesBase) {
    const parked = player.tokens.filter(steps => steps === IN_BASE).length;
    score -= parked * 18;
  }

  // Prefer the token that is furthest along, so runners are not left behind.
  score += move.to * 1.6;

  // A small nudge to keep at least one token available for a future six.
  const wouldEmptyBoard =
    move.finishes &&
    player.tokens.filter(steps => isOnTrack(steps) || steps >= HOME_ENTRY)
      .length === 1;
  if (wouldEmptyBoard) {
    score -= 40;
  }

  return score;
};

const blunderChance: Record<Difficulty, number> = {
  easy: 0.45,
  normal: 0.18,
  hard: 0.0,
};

/**
 * Pick a move. Randomness comes from the shared stream so a replayed save
 * behaves identically, and the choice never peeks at future dice.
 */
export const chooseMove = (
  state: GameState,
  moves: Move[],
  die: number,
  rng: RngState,
): { move: Move; rng: RngState } => {
  if (moves.length === 1) {
    return { move: moves[0], rng };
  }
  // Shuffle first so equal scores do not always resolve to the same token.
  const shuffled = shuffle(moves, rng);
  let stream = shuffled.state;
  const scored: ScoredMove[] = shuffled.value.map(move => ({
    move,
    score: scoreMove(state, move, die),
  }));
  scored.sort((a, b) => b.score - a.score);

  const slip = blunderChance[state.difficulty] ?? 0.18;
  if (slip > 0 && scored.length > 1) {
    const draw = nextInt(stream, 1000);
    stream = draw.state;
    if (draw.value < slip * 1000) {
      const pick = nextInt(stream, scored.length - 1);
      stream = pick.state;
      return { move: scored[pick.value + 1].move, rng: stream };
    }
  }
  return { move: scored[0].move, rng: stream };
};

/** Human-facing hint: the move the "hard" CPU would make. */
export const bestMove = (
  state: GameState,
  moves: Move[],
  die: number,
): Move | null => {
  if (moves.length === 0) {
    return null;
  }
  return moves.reduce((best, move) =>
    scoreMove(state, move, die) > scoreMove(state, best, die) ? move : best,
  );
};

export const isTokenInDanger = (
  state: GameState,
  playerIndex: number,
  steps: number,
): boolean => {
  if (!isOnTrack(steps) || steps === FINISHED) {
    return false;
  }
  return (
    threatLevel(
      state,
      playerIndex,
      ringIndex(state.players[playerIndex].color, steps),
    ) > 0
  );
};
