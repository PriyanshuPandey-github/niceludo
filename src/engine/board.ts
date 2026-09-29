/**
 * Board geometry.
 *
 * The board is the classic 15x15 Ludo cross. Cell coordinates are `[col, row]`
 * with the origin at the top-left. Everything the UI needs to place a pawn is
 * derived from the tables below, so the renderer never hard-codes positions.
 */
import { ColorId, FINISHED, HOME_ENTRY, IN_BASE } from './types';

export const GRID = 15;

/** Continuous board coordinates, in cell units (a cell is 1 x 1). */
export interface Point {
  x: number;
  y: number;
}

const cellCentre = ([c, r]: [number, number]): Point => ({
  x: c + 0.5,
  y: r + 0.5,
});

/**
 * The shared ring, clockwise, 52 cells.
 * Index 0 is `[0, 6]` - the cell in the outer-left lane closest to the corner.
 */
export const TRACK: Array<[number, number]> = (() => {
  const cells: Array<[number, number]> = [];
  // left arm, upper lane, heading right
  for (let c = 0; c <= 5; c++) {
    cells.push([c, 6]);
  }
  // top arm, left lane, heading up
  for (let r = 5; r >= 0; r--) {
    cells.push([6, r]);
  }
  cells.push([7, 0]); // tip
  // top arm, right lane, heading down
  for (let r = 0; r <= 5; r++) {
    cells.push([8, r]);
  }
  // right arm, upper lane, heading right
  for (let c = 9; c <= 14; c++) {
    cells.push([c, 6]);
  }
  cells.push([14, 7]); // tip
  // right arm, lower lane, heading left
  for (let c = 14; c >= 9; c--) {
    cells.push([c, 8]);
  }
  // bottom arm, right lane, heading down
  for (let r = 9; r <= 14; r++) {
    cells.push([8, r]);
  }
  cells.push([7, 14]); // tip
  // bottom arm, left lane, heading up
  for (let r = 14; r >= 9; r--) {
    cells.push([6, r]);
  }
  // left arm, lower lane, heading left
  for (let c = 5; c >= 0; c--) {
    cells.push([c, 8]);
  }
  cells.push([0, 7]); // tip
  return cells;
})();

export const TRACK_LENGTH = TRACK.length; // 52

/**
 * The board's four corners, clockwise from the top-left. Each corner owns a
 * yard, a start cell and a home column; which colour sits where is decided
 * by CORNER_OF alone, so recolouring the board is a one-line change.
 */
export enum Corner {
  TopLeft = 0,
  TopRight = 1,
  BottomRight = 2,
  BottomLeft = 3,
}

/** Where each colour sits. Clockwise from top-left: Yellow, Blue, Red, Green. */
export const CORNER_OF: Record<ColorId, Corner> = {
  [ColorId.Yellow]: Corner.TopLeft,
  [ColorId.Blue]: Corner.TopRight,
  [ColorId.Red]: Corner.BottomRight,
  [ColorId.Green]: Corner.BottomLeft,
};

const byCorner = <T>(table: Record<Corner, T>): Record<ColorId, T> => ({
  [ColorId.Red]: table[CORNER_OF[ColorId.Red]],
  [ColorId.Green]: table[CORNER_OF[ColorId.Green]],
  [ColorId.Yellow]: table[CORNER_OF[ColorId.Yellow]],
  [ColorId.Blue]: table[CORNER_OF[ColorId.Blue]],
});

/** Ring index of each colour's start cell. */
export const START_INDEX: Record<ColorId, number> = byCorner({
  [Corner.TopLeft]: 1,
  [Corner.TopRight]: 14,
  [Corner.BottomRight]: 27,
  [Corner.BottomLeft]: 40,
});

/**
 * Protected cells: the four coloured start cells plus the four star cells
 * (eight ring steps further along). Tokens standing here cannot be captured.
 */
export const SAFE_CELLS: number[] = [1, 9, 14, 22, 27, 35, 40, 48];
const SAFE_SET = new Set(SAFE_CELLS);
export const isSafeCell = (index: number): boolean => SAFE_SET.has(index);
/** The four star-marked cells (the start cells get an arrow instead). */
export const STAR_CELLS: number[] = [9, 22, 35, 48];

/** The five private cells leading to the centre, ordered outward-to-inward. */
export const HOME_COLUMN: Record<ColorId, Array<[number, number]>> = byCorner({
  [Corner.TopLeft]: [
    [1, 7],
    [2, 7],
    [3, 7],
    [4, 7],
    [5, 7],
  ],
  [Corner.TopRight]: [
    [7, 1],
    [7, 2],
    [7, 3],
    [7, 4],
    [7, 5],
  ],
  [Corner.BottomRight]: [
    [13, 7],
    [12, 7],
    [11, 7],
    [10, 7],
    [9, 7],
  ],
  [Corner.BottomLeft]: [
    [7, 13],
    [7, 12],
    [7, 11],
    [7, 10],
    [7, 9],
  ],
});

/** Top-left corner of each 6x6 base quadrant. */
export const BASE_ORIGIN: Record<ColorId, [number, number]> = byCorner({
  [Corner.TopLeft]: [0, 0],
  [Corner.TopRight]: [9, 0],
  [Corner.BottomRight]: [9, 9],
  [Corner.BottomLeft]: [0, 9],
});

/** Inner yard rectangle of a base, in cell units: [x, y, w, h]. */
export const yardRect = (color: ColorId): [number, number, number, number] => {
  const [ox, oy] = BASE_ORIGIN[color];
  return [ox + 1, oy + 1, 4, 4];
};

/** The four parking spots inside a base yard. */
export const baseSlot = (color: ColorId, token: number): Point => {
  const [x, y] = yardRect(color);
  const dx = token % 2 === 0 ? 1 : 3;
  const dy = token < 2 ? 1 : 3;
  return { x: x + dx, y: y + dy };
};

/**
 * Corner position for each colour's dice tray (Ludo King style).
 * These sit just outside the playing grid, at each board corner.
 * The coordinate is the centre of where the dice box should be placed.
 */
const DICE_POINT: Record<ColorId, Point> = byCorner({
  [Corner.TopLeft]: { x: -0.1, y: -0.1 },
  [Corner.TopRight]: { x: GRID + 0.1, y: -0.1 },
  [Corner.BottomRight]: { x: GRID + 0.1, y: GRID + 0.1 },
  [Corner.BottomLeft]: { x: -0.1, y: GRID + 0.1 },
});
export const dicePoint = (color: ColorId): Point => DICE_POINT[color];

export const CENTRE: Point = { x: 7.5, y: 7.5 };

/** Unit vector pointing from the centre towards a colour's home column. */
const HOME_DIR: Record<ColorId, Point> = byCorner({
  [Corner.TopLeft]: { x: -1, y: 0 },
  [Corner.TopRight]: { x: 0, y: -1 },
  [Corner.BottomRight]: { x: 1, y: 0 },
  [Corner.BottomLeft]: { x: 0, y: 1 },
});

/** Where a finished token rests inside the centre triangle. */
export const finishedSlot = (color: ColorId, token: number): Point => {
  const dir = HOME_DIR[color];
  const perp = { x: -dir.y, y: dir.x };
  const lateral = [-0.42, 0.42, -0.42, 0.42][token];
  const depth = [0.95, 0.95, 0.45, 0.45][token];
  return {
    x: CENTRE.x + dir.x * depth + perp.x * lateral,
    y: CENTRE.y + dir.y * depth + perp.y * lateral,
  };
};

/** Absolute ring index for a token that is `steps` along its own route. */
export const ringIndex = (color: ColorId, steps: number): number =>
  (START_INDEX[color] + steps) % TRACK_LENGTH;

/** Board position of a token, whatever state it is in. */
export const tokenPoint = (
  color: ColorId,
  steps: number,
  token: number,
): Point => {
  if (steps === IN_BASE) {
    return baseSlot(color, token);
  }
  if (steps === FINISHED) {
    return finishedSlot(color, token);
  }
  if (steps >= HOME_ENTRY) {
    return cellCentre(HOME_COLUMN[color][steps - HOME_ENTRY]);
  }
  return cellCentre(TRACK[ringIndex(color, steps)]);
};

/** Cell centre for a raw ring index (used when painting the board). */
export const trackPoint = (index: number): Point => cellCentre(TRACK[index]);
export const cellPoint = (c: number, r: number): Point => cellCentre([c, r]);
