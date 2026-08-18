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

/** Pip layout on a 3x3 grid, in units of the die face. */
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
  const cell = 100 / 3;
  const pipRadius = 8.2;

  return (
    <Svg width={size} height={size} viewBox="-6 -6 112 112">
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
        x={4}
        y={9}
        width={100}
        height={100}
        rx={22}
        fill="#000000"
        opacity={tumbling ? 0.12 : 0.28}
      />
      {/* body */}
      <Rect
        x={0}
        y={0}
        width={100}
        height={100}
        rx={22}
        fill={`url(#${id}-face)`}
        stroke={`url(#${id}-edge)`}
        strokeWidth={4}
      />
      {/* inner bevel */}
      <Rect
        x={6}
        y={6}
        width={88}
        height={88}
        rx={18}
        fill="none"
        stroke="#FFFFFF"
        strokeWidth={3}
        opacity={0.7}
      />
      <G>
        {pips.map(([col, row], index) => (
          <Circle
            key={`${value}-${index}`}
            cx={cell * col + cell / 2 + (col - 1) * 4}
            cy={cell * row + cell / 2 + (row - 1) * 4}
            r={pipRadius}
            fill={`url(#${id}-pip)`}
          />
        ))}
      </G>
      {/* gloss */}
      <Rect
        x={10}
        y={8}
        width={80}
        height={26}
        rx={13}
        fill="#FFFFFF"
        opacity={0.4}
      />
    </Svg>
  );
};

export const Dice = memo(DiceView);
