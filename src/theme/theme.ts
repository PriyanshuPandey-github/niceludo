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

export const colors = {
  bgDeep: '#070B1A',
  bgMid: '#111a3d',
  bgGlowA: '#2B2C7A',
  bgGlowB: '#0E4C6B',
  surface: 'rgba(255,255,255,0.07)',
  surfaceStrong: 'rgba(255,255,255,0.12)',
  surfaceSolid: '#161E3E',
  border: 'rgba(255,255,255,0.14)',
  borderStrong: 'rgba(255,255,255,0.28)',
  text: '#F3F5FF',
  textMuted: '#98A2CC',
  textFaint: '#6E77A0',
  gold: '#F6CF6A',
  goldDeep: '#B8862A',
  goldLight: '#FFF0BD',
  danger: '#FF5C5C',
  boardFrameA: '#1B2350',
  boardFrameB: '#0C1130',
  boardCell: '#F7F9FF',
  boardCellEdge: '#C2CCEC',
  boardInk: '#2A3358',
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
