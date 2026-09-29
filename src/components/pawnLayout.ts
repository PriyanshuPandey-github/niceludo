import {
  ColorId,
  FINISHED,
  GameState,
  HOME_ENTRY,
  IN_BASE,
  Point,
  ringIndex,
  tokenPoint,
} from '../engine';

export interface PawnPlacement {
  point: Point;
  /** shrink pawns that share a cell so both stay readable */
  scale: number;
  /** how many pawns share this cell */
  stack: number;
}

const groupKey = (
  color: ColorId,
  steps: number,
  player: number,
  token: number,
): string => {
  if (steps === IN_BASE) {
    return `base-${player}-${token}`;
  }
  if (steps === FINISHED) {
    return `done-${player}-${token}`;
  }
  if (steps >= HOME_ENTRY) {
    return `home-${color}-${steps}`;
  }
  return `ring-${ringIndex(color, steps)}`;
};

/** Fan-out offsets (in cell units) for 1..8 pawns sharing one cell. */
const OFFSETS: Array<Array<[number, number]>> = [
  [[0, 0]],
  [
    [-0.2, 0],
    [0.2, 0],
  ],
  [
    [-0.24, -0.1],
    [0.24, -0.1],
    [0, 0.18],
  ],
  [
    [-0.22, -0.14],
    [0.22, -0.14],
    [-0.22, 0.16],
    [0.22, 0.16],
  ],
];

export const pawnKey = (player: number, token: number): string =>
  `${player}:${token}`;

/**
 * Where every pawn should sit for a given state, including the small fan-out
 * applied when several pawns share a cell.
 */
export const layoutPawns = (
  state: GameState,
): Record<string, PawnPlacement> => {
  const groups = new Map<string, Array<[number, number]>>();
  state.players.forEach((player, playerIndex) => {
    player.tokens.forEach((steps, token) => {
      const key = groupKey(player.color, steps, playerIndex, token);
      const list = groups.get(key) ?? [];
      list.push([playerIndex, token]);
      groups.set(key, list);
    });
  });

  const placement: Record<string, PawnPlacement> = {};
  groups.forEach(members => {
    const count = members.length;
    const offsets =
      OFFSETS[Math.min(count, OFFSETS.length) - 1] ??
      OFFSETS[OFFSETS.length - 1];
    members.forEach(([playerIndex, token], index) => {
      const player = state.players[playerIndex];
      const base = tokenPoint(player.color, player.tokens[token], token);
      const [dx, dy] = offsets[index % offsets.length];
      placement[pawnKey(playerIndex, token)] = {
        point: { x: base.x + dx, y: base.y + dy },
        scale: count > 1 ? 0.82 : 1,
        stack: count,
      };
    });
  });
  return placement;
};
