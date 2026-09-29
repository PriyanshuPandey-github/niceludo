import React, { memo } from 'react';
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient,
  Rect,
  Stop,
  RadialGradient,
} from 'react-native-svg';
import { ColorId } from '../engine/types';
import { PLAYER_COLORS } from '../theme/theme';
import { useSvgId } from './svgId';

/**
 * Pip layout on a 3×3 logical grid.
 * Values are column/row indices (0-2).
 */
const PIPS: Record<number, Array<[number, number]>> = {
  1: [[1, 1]],
  2: [
    [0, 0],
    [2, 2],
  ],
  3: [
    [0, 0],
    [1, 1],
    [2, 2],
  ],
  4: [
    [0, 0],
    [2, 0],
    [0, 2],
    [2, 2],
  ],
  5: [
    [0, 0],
    [2, 0],
    [1, 1],
    [0, 2],
    [2, 2],
  ],
  6: [
    [0, 0],
    [2, 0],
    [0, 1],
    [2, 1],
    [0, 2],
    [2, 2],
  ],
};

// ── Squircle geometry ──
// Die face spans 0-100 in a viewBox with padding on all sides.
const PAD = 8; // padding around the die in viewBox units
const VB = 100 + PAD * 2; // total viewBox dimension
const RX = 28; // large corner radius → squircle look
const BEVEL_INSET = 8; // inner bevel inset from die edge
const BEVEL_RX = RX - 4;

// ── Pip geometry — inset from die edges so dots never touch borders ──
const PIP_PAD = 18; // padding inside the die face for pip area
const pipArea = 100 - PIP_PAD * 2; // usable area for pips
const cell = pipArea / 3;
const pipRadius = 7.6;

/** Convert logical grid position (0-2) to viewBox coordinate. */
const pipCx = (col: number) => PAD + PIP_PAD + cell * col + cell / 2;
const pipCy = (row: number) => PAD + PIP_PAD + cell * row + cell / 2;

/** Die geometry in viewBox units (the tray sizes the die from it). */
export const DIE_GEOMETRY = { PAD, VB, RX };

export interface DiceProps {
  face: number;
  size: number;
  color: ColorId;
  /** slightly flatter shading while the die is tumbling */
  tumbling?: boolean;
}

const DiceView = ({ face, size, color, tumbling }: DiceProps) => {
  const id = useSvgId('dice');
  const palette = PLAYER_COLORS[color];
  const value = Math.min(6, Math.max(1, Math.round(face)));
  const pips = PIPS[value];

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${VB} ${VB}`}>
      <Defs>
        <LinearGradient id={`${id}-face`} x1="0.1" y1="0" x2="0.9" y2="1">
          <Stop offset="0%" stopColor="#FFFFFF" />
          <Stop offset="55%" stopColor="#F2F4FF" />
          <Stop offset="100%" stopColor="#D8DDF2" />
        </LinearGradient>
        <RadialGradient id={`${id}-pip`} cx="35%" cy="30%" r="75%">
          <Stop offset="0%" stopColor={palette.light} />
          <Stop offset="45%" stopColor={palette.base} />
          <Stop offset="100%" stopColor={palette.dark} />
        </RadialGradient>
        <LinearGradient id={`${id}-edge`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%" stopColor={palette.light} />
          <Stop offset="100%" stopColor={palette.dark} />
        </LinearGradient>
      </Defs>

      {/* drop shadow */}
      <Rect
        x={PAD + 4}
        y={PAD + 8}
        width={100}
        height={100}
        rx={RX}
        fill="#000000"
        opacity={tumbling ? 0.12 : 0.25}
      />
      {/* die body — squircle with large corner radius */}
      <Rect
        x={PAD}
        y={PAD}
        width={100}
        height={100}
        rx={RX}
        fill={`url(#${id}-face)`}
        stroke={`url(#${id}-edge)`}
        strokeWidth={3.5}
      />
      {/* inner bevel highlight */}
      <Rect
        x={PAD + BEVEL_INSET}
        y={PAD + BEVEL_INSET}
        width={100 - BEVEL_INSET * 2}
        height={100 - BEVEL_INSET * 2}
        rx={BEVEL_RX}
        fill="none"
        stroke="#FFFFFF"
        strokeWidth={2.5}
        opacity={0.65}
      />

      {/* pips — positioned with generous padding from edges */}
      <G>
        {pips.map(([col, row], index) => (
          <Circle
            key={`${value}-${index}`}
            cx={pipCx(col)}
            cy={pipCy(row)}
            r={pipRadius}
            fill={`url(#${id}-pip)`}
          />
        ))}
      </G>

      {/* gloss highlight */}
      <Rect
        x={PAD + 12}
        y={PAD + 8}
        width={76}
        height={24}
        rx={12}
        fill="#FFFFFF"
        opacity={0.38}
      />
    </Svg>
  );
};

export const Dice = memo(DiceView);
