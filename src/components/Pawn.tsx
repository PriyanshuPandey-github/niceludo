import React, { memo } from 'react';
import Svg, {
  Circle,
  ClipPath,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  RadialGradient,
  Stop,
} from 'react-native-svg';
import { ColorId } from '../engine/types';
import { PLAYER_COLORS, PieceColors, PieceTheme } from '../theme/theme';
import { useSvgId } from './svgId';
import { webPath } from './web';
import { MaskEyes, Mood, useEyes } from './eyes';

export interface PieceGeometry {
  /** aspect ratio of the artwork (width / height) */
  ratio: number;
  /** where the piece's footprint sits inside its own box, as a fraction */
  anchorY: number;
  /** rendered height, in board cells */
  cells: number;
}

/** Discs are square and centred on their cell. */
export const PIECE_GEOMETRY: Record<PieceTheme, PieceGeometry> = {
  disc: { ratio: 1, anchorY: 0.52, cells: 1.08 },
  spider: { ratio: 1, anchorY: 0.52, cells: 1.08 },
};

export interface PawnProps {
  color: ColorId;
  /** rendered height in pixels */
  height: number;
  theme?: PieceTheme;
  /** draw the "you can move me" ring */
  highlighted?: boolean;
  /** draw the "an opponent can reach me" marker */
  threatened?: boolean;
  dimmed?: boolean;
  /** Spider: what the eyes should express */
  mood?: Mood;
  /** Spider: blink and emote on their own (off for static renders) */
  animated?: boolean;
  /** Spider: wrapped in a web cocoon (just captured) */
  webbed?: boolean;
}

interface PieceArtProps {
  id: string;
  palette: PieceColors;
  highlighted?: boolean;
  dimmed?: boolean;
  mood: Mood;
  animated: boolean;
  webbed?: boolean;
}

/** Red "!" badge in the top-right corner of the piece's box. */
const ThreatBadge = ({ cx, cy }: { cx: number; cy: number }) => (
  <G>
    <Circle
      cx={cx}
      cy={cy}
      r={13}
      fill="#FF3B30"
      stroke="#FFFFFF"
      strokeWidth={3}
    />
    <Path
      d={`M${cx},${cy - 7} L${cx},${cy + 2}`}
      stroke="#FFFFFF"
      strokeWidth={4}
      strokeLinecap="round"
    />
    <Circle cx={cx} cy={cy + 7} r={2.2} fill="#FFFFFF" />
  </G>
);

// -------------------------------------------------------------------- discs
// Both disc themes share one body on a 100x100 grid: a face of radius 38
// centred at (50, 48), sitting on a darker edge offset downward to read as
// thickness.
const FACE_X = 50;
const FACE_Y = 48;
const FACE_R = 38;
const EDGE_DROP = 5;

const DiscBase = ({
  id,
  palette,
  highlighted,
  face,
}: {
  id: string;
  palette: PieceColors;
  highlighted?: boolean;
  face: string;
}) => (
  <>
    <Ellipse
      cx={FACE_X}
      cy={FACE_Y + EDGE_DROP + 4}
      rx={FACE_R + 6}
      ry={FACE_R + 2}
      fill={`url(#${id}-shadow)`}
    />
    {highlighted ? (
      <Circle
        cx={FACE_X}
        cy={FACE_Y + EDGE_DROP / 2}
        r={FACE_R + 7}
        fill="none"
        stroke={palette.glow}
        strokeWidth={4.5}
        opacity={0.9}
      />
    ) : null}
    {/* edge */}
    <Circle
      cx={FACE_X}
      cy={FACE_Y + EDGE_DROP}
      r={FACE_R}
      fill={`url(#${id}-edge)`}
      stroke={palette.dark}
      strokeWidth={2}
    />
    {/* face */}
    <Circle
      cx={FACE_X}
      cy={FACE_Y}
      r={FACE_R}
      fill={face}
      stroke={palette.dark}
      strokeWidth={2}
    />
  </>
);

const DiscDefs = ({ id, palette }: { id: string; palette: PieceColors }) => (
  <>
    <LinearGradient id={`${id}-edge`} x1="0" y1="0" x2="0" y2="1">
      <Stop offset="0%" stopColor={palette.base} />
      <Stop offset="100%" stopColor={palette.dark} />
    </LinearGradient>
    <RadialGradient id={`${id}-shadow`} cx="50%" cy="50%" r="50%">
      <Stop offset="0%" stopColor="#000000" stopOpacity={0.45} />
      <Stop offset="100%" stopColor="#000000" stopOpacity={0} />
    </RadialGradient>
  </>
);

/** A glossy board-game counter with a bevelled groove and centre dimple. */
const DiscArt = ({ id, palette, highlighted, dimmed }: PieceArtProps) => (
  <>
    <Defs>
      <DiscDefs id={id} palette={palette} />
      <RadialGradient id={`${id}-face`} cx="38%" cy="32%" r="75%">
        <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.9} />
        <Stop offset="22%" stopColor={palette.light} />
        <Stop offset="62%" stopColor={palette.base} />
        <Stop offset="100%" stopColor={palette.dark} />
      </RadialGradient>
      <RadialGradient id={`${id}-dimple`} cx="60%" cy="65%" r="70%">
        <Stop offset="0%" stopColor={palette.light} />
        <Stop offset="100%" stopColor={palette.dark} />
      </RadialGradient>
    </Defs>
    <G opacity={dimmed ? 0.5 : 1}>
      <DiscBase
        id={id}
        palette={palette}
        highlighted={highlighted}
        face={`url(#${id}-face)`}
      />
      {/* bevelled groove: dark cut with a lit lower lip */}
      <Circle
        cx={FACE_X}
        cy={FACE_Y}
        r={27}
        fill="none"
        stroke={palette.dark}
        strokeWidth={2.4}
        opacity={0.55}
      />
      <Circle
        cx={FACE_X}
        cy={FACE_Y + 1.5}
        r={25}
        fill="none"
        stroke={palette.light}
        strokeWidth={1.4}
        opacity={0.7}
      />
      {/* centre dimple */}
      <Circle
        cx={FACE_X}
        cy={FACE_Y}
        r={9}
        fill={`url(#${id}-dimple)`}
        stroke={palette.dark}
        strokeWidth={1.4}
        opacity={0.85}
      />
      {/* specular */}
      <Ellipse
        cx={36}
        cy={32}
        rx={13}
        ry={7}
        fill="#FFFFFF"
        opacity={0.5}
        transform="rotate(-32 36 32)"
      />
    </G>
  </>
);

// -------------------------------------------------------------------- spider
// The web radiates from just below the eyes, like the seams on a mask:
// twelve spokes (one straight down the nose line) and five rings whose
// segments sag toward the centre.
/** Wrapping strands of a web cocoon, criss-crossing the face. */
const COCOON = [
  'M14,36 Q50,52 86,30',
  'M12,54 Q50,40 88,58',
  'M18,68 Q52,58 84,74',
  'M24,20 Q46,46 30,84',
  'M76,20 Q56,50 72,84',
].join(' ');

const WEB_PATH = webPath(FACE_X, FACE_Y + 5, 41, { spokeReach: 1.22 });

/** A disc wearing a web-slinger mask in the player's colour. */
const SpiderArt = ({
  id,
  palette,
  highlighted,
  dimmed,
  mood,
  animated,
  webbed,
}: PieceArtProps) => {
  const eyes = useEyes(mood, animated);
  return (
    <>
      <Defs>
        <DiscDefs id={id} palette={palette} />
        <RadialGradient id={`${id}-face`} cx="40%" cy="34%" r="78%">
          <Stop offset="0%" stopColor={palette.light} />
          <Stop offset="55%" stopColor={palette.base} />
          <Stop offset="100%" stopColor={palette.dark} />
        </RadialGradient>
        <ClipPath id={`${id}-clip`}>
          <Circle cx={FACE_X} cy={FACE_Y} r={FACE_R - 1} />
        </ClipPath>
      </Defs>
      <G opacity={dimmed ? 0.5 : 1}>
        <DiscBase
          id={id}
          palette={palette}
          highlighted={highlighted}
          face={`url(#${id}-face)`}
        />
        <Path
          d={WEB_PATH}
          clipPath={`url(#${id}-clip)`}
          fill="none"
          stroke="#140C10"
          strokeWidth={1.3}
          strokeLinecap="round"
          opacity={0.6}
        />
        <MaskEyes id={id} pose={eyes} />
        {webbed ? (
          <G clipPath={`url(#${id}-clip)`}>
            <Path
              d={WEB_PATH}
              fill="none"
              stroke="#FFFFFF"
              strokeWidth={1.4}
              opacity={0.45}
            />
            <Path
              d={COCOON}
              fill="none"
              stroke="#F4F6FF"
              strokeWidth={3.2}
              strokeLinecap="round"
              opacity={0.92}
            />
          </G>
        ) : null}
        {/* specular */}
        <Ellipse
          cx={50}
          cy={17}
          rx={9}
          ry={3.5}
          fill="#FFFFFF"
          opacity={0.35}
        />
      </G>
    </>
  );
};

// ------------------------------------------------------------------- export
const ART = { disc: DiscArt, spider: SpiderArt };

const PawnView = ({
  color,
  height,
  theme = 'disc',
  highlighted,
  threatened,
  dimmed,
  mood = 'idle',
  animated = true,
  webbed,
}: PawnProps) => {
  const id = useSvgId('pawn');
  const palette = PLAYER_COLORS[color];
  const { ratio } = PIECE_GEOMETRY[theme];
  const viewHeight = 100 / ratio;
  const Art = ART[theme];

  return (
    <Svg
      width={height * ratio}
      height={height}
      viewBox={`0 0 100 ${viewHeight}`}
    >
      <Art
        id={id}
        palette={palette}
        highlighted={highlighted}
        dimmed={dimmed}
        mood={mood}
        animated={animated}
        webbed={webbed}
      />
      {threatened ? <ThreatBadge cx={84} cy={16} /> : null}
    </Svg>
  );
};

export const Pawn = memo(PawnView);
