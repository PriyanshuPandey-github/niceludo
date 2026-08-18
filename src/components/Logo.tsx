import React from 'react';
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from 'react-native-svg';
import { ColorId } from '../engine/types';
import { PLAYER_COLORS, colors } from '../theme/theme';
import { useSvgId } from './svgId';

/**
 * The NiceLudo mark: a board tile with four coloured quadrants, a white
 * cross, a gold centre star and a die resting on top. `scripts/gen-assets.js`
 * rasterises the same drawing into the launcher icon and splash logo, so the
 * brand is identical everywhere.
 */
export const Logo = ({ size }: { size: number }) => {
  const id = useSvgId('logo');
  const pip = (cx: number, cy: number) => (
    <Circle cx={cx} cy={cy} r={5.4} fill="#20264A" key={`${cx}-${cy}`} />
  );

  return (
    <Svg width={size} height={size} viewBox="0 0 200 200">
      <Defs>
        <LinearGradient id={`${id}-plate`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%" stopColor="#2A356B" />
          <Stop offset="100%" stopColor="#0D1230" />
        </LinearGradient>
        <LinearGradient id={`${id}-gold`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%" stopColor={colors.goldLight} />
          <Stop offset="50%" stopColor={colors.gold} />
          <Stop offset="100%" stopColor={colors.goldDeep} />
        </LinearGradient>
        <LinearGradient id={`${id}-die`} x1="0.1" y1="0" x2="0.9" y2="1">
          <Stop offset="0%" stopColor="#FFFFFF" />
          <Stop offset="100%" stopColor="#D6DCF4" />
        </LinearGradient>
      </Defs>

      <Rect
        x={10}
        y={10}
        width={180}
        height={180}
        rx={44}
        fill={`url(#${id}-plate)`}
      />
      <Rect
        x={18}
        y={18}
        width={164}
        height={164}
        rx={38}
        fill="none"
        stroke={`url(#${id}-gold)`}
        strokeWidth={4}
        opacity={0.9}
      />

      <G>
        <Path
          d="M36,36 h56 v56 h-56 z"
          fill={PLAYER_COLORS[ColorId.Red].base}
          opacity={0.96}
        />
        <Path
          d="M108,36 h56 v56 h-56 z"
          fill={PLAYER_COLORS[ColorId.Green].base}
          opacity={0.96}
        />
        <Path
          d="M108,108 h56 v56 h-56 z"
          fill={PLAYER_COLORS[ColorId.Yellow].base}
          opacity={0.96}
        />
        <Path
          d="M36,108 h56 v56 h-56 z"
          fill={PLAYER_COLORS[ColorId.Blue].base}
          opacity={0.96}
        />
      </G>

      {/* cross lanes */}
      <Rect x={92} y={30} width={16} height={140} fill="#F4F6FF" />
      <Rect x={30} y={92} width={140} height={16} fill="#F4F6FF" />
      <Circle cx={100} cy={100} r={17} fill={`url(#${id}-gold)`} />

      {/* die */}
      <G transform="rotate(-14 128 132)">
        <Rect
          x={96}
          y={100}
          width={64}
          height={64}
          rx={16}
          fill={`url(#${id}-die)`}
          stroke="#8D97C4"
          strokeWidth={3}
        />
        {pip(112, 116)}
        {pip(144, 116)}
        {pip(128, 132)}
        {pip(112, 148)}
        {pip(144, 148)}
      </G>
    </Svg>
  );
};
