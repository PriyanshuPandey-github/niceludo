import React, { memo } from 'react';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  RadialGradient,
  Stop,
} from 'react-native-svg';
import { ColorId } from '../engine/types';
import { PLAYER_COLORS } from '../theme/theme';
import { useSvgId } from './svgId';

/** Aspect ratio of the pawn artwork (width / height). */
export const PAWN_RATIO = 100 / 130;
/** Where the pawn's footprint sits inside its own box, as a fraction. */
export const PAWN_ANCHOR_Y = 112 / 130;

export interface PawnProps {
  color: ColorId;
  /** rendered height in pixels */
  height: number;
  /** draw the "you can move me" ring */
  highlighted?: boolean;
  /** draw the "an opponent can reach me" marker */
  threatened?: boolean;
  dimmed?: boolean;
}

const PawnView = ({
  color,
  height,
  highlighted,
  threatened,
  dimmed,
}: PawnProps) => {
  const id = useSvgId('pawn');
  const palette = PLAYER_COLORS[color];
  const width = height * PAWN_RATIO;

  return (
    <Svg width={width} height={height} viewBox="0 0 100 130">
      <Defs>
        <LinearGradient id={`${id}-body`} x1="0.15" y1="0" x2="0.9" y2="1">
          <Stop offset="0%" stopColor={palette.light} />
          <Stop offset="42%" stopColor={palette.base} />
          <Stop offset="100%" stopColor={palette.dark} />
        </LinearGradient>
        <RadialGradient id={`${id}-head`} cx="38%" cy="30%" r="72%">
          <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.95} />
          <Stop offset="28%" stopColor={palette.light} />
          <Stop offset="70%" stopColor={palette.base} />
          <Stop offset="100%" stopColor={palette.dark} />
        </RadialGradient>
        <RadialGradient id={`${id}-shadow`} cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#000000" stopOpacity={0.45} />
          <Stop offset="100%" stopColor="#000000" stopOpacity={0} />
        </RadialGradient>
      </Defs>

      {/* ground shadow */}
      <Ellipse cx={50} cy={118} rx={36} ry={11} fill={`url(#${id}-shadow)`} />

      <G opacity={dimmed ? 0.5 : 1}>
        {highlighted ? (
          <Ellipse
            cx={50}
            cy={114}
            rx={41}
            ry={13}
            fill="none"
            stroke={palette.glow}
            strokeWidth={5}
            opacity={0.9}
          />
        ) : null}

        {/* foot */}
        <Ellipse
          cx={50}
          cy={110}
          rx={31}
          ry={11}
          fill={`url(#${id}-body)`}
          stroke={palette.dark}
          strokeWidth={2}
        />
        {/* body */}
        <Path
          d="M22,110 C22,100 32,96 36,86 C41,74 43,66 43,58 L57,58 C57,66 59,74 64,86 C68,96 78,100 78,110 Z"
          fill={`url(#${id}-body)`}
          stroke={palette.dark}
          strokeWidth={2}
          strokeLinejoin="round"
        />
        {/* collar */}
        <Ellipse
          cx={50}
          cy={57}
          rx={16}
          ry={5.5}
          fill={palette.light}
          stroke={palette.dark}
          strokeWidth={1.6}
        />
        {/* head */}
        <Circle
          cx={50}
          cy={35}
          r={23}
          fill={`url(#${id}-head)`}
          stroke={palette.dark}
          strokeWidth={2}
        />
        {/* specular */}
        <Ellipse
          cx={41}
          cy={26}
          rx={7}
          ry={9}
          fill="#FFFFFF"
          opacity={0.55}
          transform="rotate(-20 41 26)"
        />
        <Ellipse
          cx={50}
          cy={104}
          rx={20}
          ry={4}
          fill="#FFFFFF"
          opacity={0.16}
        />
      </G>

      {threatened ? (
        <G>
          <Circle
            cx={78}
            cy={16}
            r={13}
            fill="#FF3B30"
            stroke="#FFFFFF"
            strokeWidth={3}
          />
          <Path
            d="M78,9 L78,18"
            stroke="#FFFFFF"
            strokeWidth={4}
            strokeLinecap="round"
          />
          <Circle cx={78} cy={23} r={2.2} fill="#FFFFFF" />
        </G>
      ) : null}
    </Svg>
  );
};

export const Pawn = memo(PawnView);
