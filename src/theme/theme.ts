import { ColorId } from '../engine/types';

export interface PieceColors {
  /** main body colour */
  base: string;
  /** shadow side of the piece */
  dark: string;
  /** lit side of the piece */
  light: string;
  /** halo used for the active-player glow */
  glow: string;
  /** very soft wash used for board regions */
  tint: string;
  label: string;
}

export const PLAYER_COLORS: Record<ColorId, PieceColors> = {
  [ColorId.Red]: {
    base: '#F0453C',
    dark: '#8E1109',
    light: '#FF9C93',
    glow: '#FF6A5E',
    tint: '#FADAD7',
    label: 'Red',
  },
  [ColorId.Green]: {
    base: '#22BC69',
    dark: '#086434',
    light: '#86EAB1',
    glow: '#3BE288',
    tint: '#D4F2E2',
    label: 'Green',
  },
  [ColorId.Yellow]: {
    base: '#F5C02B',
    dark: '#9C6C02',
    light: '#FFE694',
    glow: '#FFD453',
    tint: '#FBEFCD',
    label: 'Yellow',
  },
  [ColorId.Blue]: {
    base: '#2C86F0',
    dark: '#093F8C',
    light: '#9AC9FF',
    glow: '#54A6FF',
    tint: '#D5E6FC',
    label: 'Blue',
  },
};

/**
 * The Spider Ludo palette, taken from the app icon and the launch screen:
 * deep crimson backgrounds, a bold red for the main actions and brushed
 * silver (the icon's badge) for highlights.
 */
export const colors = {
  bgTop: '#3D0B10',
  /** the launch backdrop - also the native launch screens' colour */
  bgMid: '#2E080B',
  bgDeep: '#140305',
  background: '#140305',
  bgGlowA: '#A3232C',
  bgGlowB: '#6B1218',
  bgGlowC: '#8A1F2A',
  surface: 'rgba(255,255,255,0.07)',
  surfaceStrong: 'rgba(255,255,255,0.12)',
  surfaceSolid: '#3A0D12',
  sheet: '#2A070B',
  scrim: 'rgba(14,2,4,0.76)',
  border: 'rgba(255,220,220,0.14)',
  borderStrong: 'rgba(255,220,220,0.28)',
  text: '#FFF4F4',
  textMuted: '#D2A9AC',
  textFaint: '#94686C',
  /** main actions: Start, Play, primary buttons */
  primary: '#E3343C',
  primaryDeep: '#8C1119',
  onPrimary: '#FFFFFF',
  /** brushed silver: selections, switches, the board's rim and star */
  accent: '#E6E9EE',
  accentDeep: '#9CA2AD',
  accentLight: '#FFFFFF',
  onAccent: '#2A0508',
  danger: '#FF8A5C',
  boardFrameA: '#4A0C12',
  boardFrameB: '#1F0407',
  boardCell: '#FFF8F7',
  boardCellEdge: '#E8C9CB',
  boardInk: '#4A1A1F',
  shadow: '#000000',
} as const;

export const radius = {
  sm: 10,
  md: 16,
  lg: 24,
  xl: 32,
  pill: 999,
} as const;

export const spacing = (n: number) => n * 8;

export const font = {
  /** The template ships no custom font, so we stay on the platform stack and
   *  lean on weight + letter spacing for the premium feel. */
  display: undefined as string | undefined,
  weightBlack: '900' as const,
  weightBold: '700' as const,
  weightMedium: '600' as const,
};

export const shadow = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  soft: {
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
} as const;

export const colorOf = (color: ColorId): PieceColors => PLAYER_COLORS[color];

/** How the pieces on the board are drawn. */
export type PieceTheme = 'disc' | 'spider';

export const PIECE_THEMES: Array<{ id: PieceTheme; label: string }> = [
  { id: 'disc', label: 'Discs' },
  { id: 'spider', label: 'Spider' },
];

export const isPieceTheme = (value: unknown): value is PieceTheme =>
  PIECE_THEMES.some(theme => theme.id === value);
