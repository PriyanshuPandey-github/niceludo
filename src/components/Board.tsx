import React, { memo } from 'react';
import Svg, {
  Circle,
  ClipPath,
  Defs,
  G,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from 'react-native-svg';
import {
  ALL_COLORS,
  BASE_ORIGIN,
  CORNER_OF,
  ColorId,
  Corner,
  GRID,
  HOME_COLUMN,
  START_INDEX,
  STAR_CELLS,
  TRACK,
  yardRect,
} from '../engine';
import { PLAYER_COLORS, PieceTheme, colors } from '../theme/theme';
import { useSvgId } from './svgId';
import { webPath } from './web';

/** Every colour on the board that is not a player colour. */
interface BoardSkin {
  faceA: string;
  faceB: string;
  cell: string;
  cellEdge: string;
  /** stands in for a player colour when that seat is empty */
  muted: string;
  mutedBase: string;
  star: string;
  arrow: string;
  yard: string;
  socket: string;
  centreStroke: string;
  emblem: string;
  /** faint web drawn inside each yard */
  yardWeb: boolean;
}

const LIGHT_SKIN: BoardSkin = {
  faceA: '#FFFFFF',
  faceB: '#F6E6E7',
  cell: colors.boardCell,
  cellEdge: colors.boardCellEdge,
  muted: '#E4CDD0',
  mutedBase: '#D6BABE',
  star: '#B0646C',
  arrow: '#FFFFFF',
  yard: colors.boardCell,
  socket: '#F7E9EA',
  centreStroke: '#FFFFFF',
  emblem: '#FFFFFF',
  yardWeb: false,
};

/** Night-time board for the Spider theme: charcoal with a crimson cast. */
const DARK_SKIN: BoardSkin = {
  faceA: '#2B0E11',
  faceB: '#140507',
  cell: '#34151A',
  cellEdge: '#5A242B',
  muted: '#452026',
  mutedBase: '#3A1A1F',
  star: '#E0A6AB',
  arrow: '#FFFFFF',
  yard: '#1E0A0C',
  socket: '#2E1215',
  centreStroke: '#140507',
  emblem: '#26090C',
  yardWeb: true,
};

export const boardSkinFor = (theme: PieceTheme): BoardSkin =>
  theme === 'spider' ? DARK_SKIN : LIGHT_SKIN;

/** Frame thickness around the 15x15 playfield, in cell units. */
const PAD = 0.62;

const isCentre = (c: number, r: number) => c >= 6 && c <= 8 && r >= 6 && r <= 8;
const inCross = (c: number, r: number) =>
  (c >= 6 && c <= 8) || (r >= 6 && r <= 8);

/** Which colour owns a home-column cell, if any. */
const homeOwner = (c: number, r: number): ColorId | null => {
  for (const color of ALL_COLORS) {
    if (HOME_COLUMN[color].some(([hc, hr]) => hc === c && hr === r)) {
      return color;
    }
  }
  return null;
};

const startCellOwner = (c: number, r: number): ColorId | null => {
  for (const color of ALL_COLORS) {
    const [sc, sr] = TRACK[START_INDEX[color]];
    if (sc === c && sr === r) {
      return color;
    }
  }
  return null;
};

/** A five-pointed star path centred on a cell. */
const starPath = (cx: number, cy: number, outer: number): string => {
  const inner = outer * 0.42;
  const points: string[] = [];
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    points.push(
      `${(cx + Math.cos(angle) * radius).toFixed(3)},${(
        cy +
        Math.sin(angle) * radius
      ).toFixed(3)}`,
    );
  }
  return `M${points.join('L')}Z`;
};

/** Small arrow marking the direction of travel out of a start cell. */
const arrowPath = (c: number, r: number, dx: number, dy: number): string => {
  const cx = c + 0.5;
  const cy = r + 0.5;
  const len = 0.24;
  const wide = 0.2;
  const tipX = cx + dx * len;
  const tipY = cy + dy * len;
  const baseX = cx - dx * len * 0.6;
  const baseY = cy - dy * len * 0.6;
  const px = -dy * wide;
  const py = dx * wide;
  return `M${tipX},${tipY} L${baseX + px},${baseY + py} L${baseX - px},${
    baseY - py
  } Z`;
};

/** Direction of travel out of each corner's start cell. */
const START_DIRECTION: Record<Corner, [number, number]> = {
  [Corner.TopLeft]: [1, 0],
  [Corner.TopRight]: [0, 1],
  [Corner.BottomRight]: [-1, 0],
  [Corner.BottomLeft]: [0, -1],
};

export const BOARD_PAD = PAD;

/** Pixel size of one board cell for a board rendered at `size` px. */
export const boardUnit = (size: number): number => size / (GRID + PAD * 2);

/** Convert a board-space point (cell units) into pixels inside the board. */
export const boardPixel = (
  size: number,
  point: { x: number; y: number },
): { x: number; y: number } => {
  const unit = boardUnit(size);
  return { x: (point.x + PAD) * unit, y: (point.y + PAD) * unit };
};

export interface BoardProps {
  size: number;
  /** colours that are actually seated - the rest are drawn muted */
  seated: ColorId[];
  /** the piece theme picks the matching board skin */
  theme?: PieceTheme;
}

const BoardView = ({ size, seated, theme = 'disc' }: BoardProps) => {
  const id = useSvgId('board');
  const skin = boardSkinFor(theme);
  const seatedSet = new Set(seated);

  const cells: React.ReactElement[] = [];
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      if (!inCross(c, r) || isCentre(c, r)) {
        continue;
      }
      const owner = homeOwner(c, r);
      const start = startCellOwner(c, r);
      const key = `${c}-${r}`;
      const active = owner !== null ? seatedSet.has(owner) : true;
      let fill: string = skin.cell;
      if (owner !== null) {
        fill = active ? PLAYER_COLORS[owner].base : skin.muted;
      } else if (start !== null) {
        fill = seatedSet.has(start) ? PLAYER_COLORS[start].base : skin.muted;
      }
      cells.push(
        <Rect
          key={key}
          x={c + 0.04}
          y={r + 0.04}
          width={0.92}
          height={0.92}
          rx={0.16}
          fill={fill}
          stroke={skin.cellEdge}
          strokeWidth={0.035}
        />,
      );
      if (owner !== null && active) {
        // gloss on the home run
        cells.push(
          <Rect
            key={`${key}-gloss`}
            x={c + 0.1}
            y={r + 0.1}
            width={0.8}
            height={0.34}
            rx={0.14}
            fill="#FFFFFF"
            opacity={0.22}
          />,
        );
      }
    }
  }

  // Stars on the four protected cells.
  const stars = STAR_CELLS.map(index => {
    const [c, r] = TRACK[index];
    return (
      <Path
        key={`star-${index}`}
        d={starPath(c + 0.5, r + 0.5, 0.3)}
        fill={skin.star}
        opacity={0.5}
      />
    );
  });

  // Direction arrows on the start cells.
  const arrows = ALL_COLORS.filter(color => seatedSet.has(color)).map(color => {
    const [c, r] = TRACK[START_INDEX[color]];
    const [dx, dy] = START_DIRECTION[CORNER_OF[color]];
    return (
      <Path
        key={`arrow-${color}`}
        d={arrowPath(c, r, dx, dy)}
        fill={skin.arrow}
        opacity={0.85}
      />
    );
  });

  const bases = ALL_COLORS.map(color => {
    const [ox, oy] = BASE_ORIGIN[color];
    const [yx, yy, yw, yh] = yardRect(color);
    const seatedHere = seatedSet.has(color);
    const palette = PLAYER_COLORS[color];
    return (
      <G key={`base-${color}`} opacity={seatedHere ? 1 : 0.35}>
        <Rect
          x={ox + 0.08}
          y={oy + 0.08}
          width={5.84}
          height={5.84}
          rx={0.7}
          fill={seatedHere ? `url(#${id}-base${color})` : skin.mutedBase}
        />
        <Rect
          x={ox + 0.08}
          y={oy + 0.08}
          width={5.84}
          height={5.84}
          rx={0.7}
          fill="none"
          stroke="#FFFFFF"
          strokeWidth={0.09}
          opacity={0.35}
        />
        <Rect
          x={yx}
          y={yy}
          width={yw}
          height={yh}
          rx={0.55}
          fill={skin.yard}
          opacity={0.96}
        />
        {skin.yardWeb ? (
          <Path
            d={webPath(yx + yw / 2, yy + yh / 2, Math.min(yw, yh) * 0.62, {
              rings: 4,
              spokeReach: 1.4,
            })}
            clipPath={`url(#${id}-yard${color})`}
            fill="none"
            stroke={seatedHere ? palette.base : skin.cellEdge}
            strokeWidth={0.035}
            opacity={0.45}
          />
        ) : null}
        <Rect
          x={yx + 0.16}
          y={yy + 0.16}
          width={yw - 0.32}
          height={yh - 0.32}
          rx={0.42}
          fill="none"
          stroke={seatedHere ? palette.base : skin.mutedBase}
          strokeWidth={0.07}
          opacity={0.5}
        />
        {[0, 1, 2, 3].map(slot => {
          const cx = yx + (slot % 2 === 0 ? 1 : 3);
          const cy = yy + (slot < 2 ? 1 : 3);
          return (
            <Circle
              key={`socket-${color}-${slot}`}
              cx={cx}
              cy={cy}
              r={0.46}
              fill={skin.socket}
              stroke={seatedHere ? palette.base : skin.mutedBase}
              strokeWidth={0.05}
              opacity={0.9}
            />
          );
        })}
      </G>
    );
  });

  // Centre: four triangles meeting in the middle, each on the side its
  // colour's home column arrives from.
  const TRIANGLE: Record<Corner, string> = {
    [Corner.TopRight]: 'M6,6 L9,6 L7.5,7.5 Z', // top
    [Corner.BottomRight]: 'M9,6 L9,9 L7.5,7.5 Z', // right
    [Corner.BottomLeft]: 'M9,9 L6,9 L7.5,7.5 Z', // bottom
    [Corner.TopLeft]: 'M6,9 L6,6 L7.5,7.5 Z', // left
  };
  const centre = ALL_COLORS.map(color => ({
    color,
    d: TRIANGLE[CORNER_OF[color]],
  })).map(({ color, d }) => (
    <Path
      key={`centre-${color}`}
      d={d}
      fill={seatedSet.has(color) ? PLAYER_COLORS[color].base : skin.muted}
      stroke={skin.centreStroke}
      strokeWidth={0.05}
    />
  ));

  return (
    <Svg
      width={size}
      height={size}
      viewBox={`${-PAD} ${-PAD} ${GRID + PAD * 2} ${GRID + PAD * 2}`}
    >
      <Defs>
        <LinearGradient id={`${id}-frame`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%" stopColor={colors.boardFrameA} />
          <Stop offset="100%" stopColor={colors.boardFrameB} />
        </LinearGradient>
        <LinearGradient id={`${id}-face`} x1="0" y1="0" x2="0.4" y2="1">
          <Stop offset="0%" stopColor={skin.faceA} />
          <Stop offset="100%" stopColor={skin.faceB} />
        </LinearGradient>
        <LinearGradient id={`${id}-silver`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%" stopColor={colors.accentLight} />
          <Stop offset="45%" stopColor={colors.accent} />
          <Stop offset="100%" stopColor={colors.accentDeep} />
        </LinearGradient>
        {skin.yardWeb
          ? ALL_COLORS.map(color => {
              const [yx, yy, yw, yh] = yardRect(color);
              return (
                <ClipPath key={`clip-${color}`} id={`${id}-yard${color}`}>
                  <Rect x={yx} y={yy} width={yw} height={yh} rx={0.55} />
                </ClipPath>
              );
            })
          : null}
        {ALL_COLORS.map(color => (
          <LinearGradient
            key={`grad-${color}`}
            id={`${id}-base${color}`}
            x1="0"
            y1="0"
            x2="0.7"
            y2="1"
          >
            <Stop offset="0%" stopColor={PLAYER_COLORS[color].light} />
            <Stop offset="45%" stopColor={PLAYER_COLORS[color].base} />
            <Stop offset="100%" stopColor={PLAYER_COLORS[color].dark} />
          </LinearGradient>
        ))}
      </Defs>

      {/* frame */}
      <Rect
        x={-PAD}
        y={-PAD}
        width={GRID + PAD * 2}
        height={GRID + PAD * 2}
        rx={1.1}
        fill={`url(#${id}-frame)`}
      />
      <Rect
        x={-PAD + 0.12}
        y={-PAD + 0.12}
        width={GRID + PAD * 2 - 0.24}
        height={GRID + PAD * 2 - 0.24}
        rx={0.98}
        fill="none"
        stroke={`url(#${id}-silver)`}
        strokeWidth={0.11}
        opacity={0.9}
      />
      {/* playfield */}
      <Rect
        x={-0.06}
        y={-0.06}
        width={GRID + 0.12}
        height={GRID + 0.12}
        rx={0.7}
        fill={`url(#${id}-face)`}
      />

      {bases}
      {cells}
      {stars}
      {arrows}
      {centre}

      {/* centre emblem */}
      <Circle cx={7.5} cy={7.5} r={0.62} fill={skin.emblem} opacity={0.92} />
      <Circle
        cx={7.5}
        cy={7.5}
        r={0.62}
        fill="none"
        stroke={`url(#${id}-silver)`}
        strokeWidth={0.09}
      />
      <Path d={starPath(7.5, 7.5, 0.44)} fill={`url(#${id}-silver)`} />
      {/* soft inner border so the playfield reads as inset */}
      <Rect
        x={-0.06}
        y={-0.06}
        width={GRID + 0.12}
        height={GRID + 0.12}
        rx={0.7}
        fill="none"
        stroke={colors.boardFrameB}
        strokeWidth={0.08}
        opacity={0.25}
      />
    </Svg>
  );
};

export const Board = memo(BoardView);
