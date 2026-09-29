/**
 * Local persistence. Everything the app knows lives on the device - there is
 * no network code anywhere in this project.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Difficulty, GameState } from '../engine/types';
import { SAVE_VERSION } from '../engine/rules';
import { PieceTheme, isPieceTheme } from '../theme/theme';

const SAVE_KEY = '@niceludo/save/v1';
const SETTINGS_KEY = '@niceludo/settings/v1';
const CAREER_KEY = '@niceludo/career/v1';

export interface Settings {
  vibrate: boolean;
  /** synthesised sound effects */
  sound: boolean;
  fastAnimations: boolean;
  /** auto-play the only legal move instead of asking for a tap */
  autoMoveSingle: boolean;
  /** show which pawns can move and which are in danger */
  showHints: boolean;
  difficulty: Difficulty;
  /** look of the pieces: plain discs or Spider masked discs */
  pieceTheme: PieceTheme;
}

export const DEFAULT_SETTINGS: Settings = {
  vibrate: true,
  sound: true,
  fastAnimations: false,
  autoMoveSingle: true,
  showHints: true,
  difficulty: 'normal',
  pieceTheme: 'spider',
};

export interface Career {
  gamesPlayed: number;
  gamesFinished: number;
  wins: number;
  /** lifetime dice tally, all seats pooled - the fairness panel graphs it */
  faces: number[];
}

export const EMPTY_CAREER: Career = {
  gamesPlayed: 0,
  gamesFinished: 0,
  wins: 0,
  faces: [0, 0, 0, 0, 0, 0],
};

const readJson = async <T>(key: string): Promise<T | null> => {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};

const writeJson = async (key: string, value: unknown): Promise<void> => {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage being unavailable must never take the game down.
  }
};

/** Cheap structural check so a corrupt file can never crash the board. */
const looksLikeGame = (value: unknown): value is GameState => {
  const state = value as GameState | null;
  return (
    !!state &&
    typeof state === 'object' &&
    state.version === SAVE_VERSION &&
    Array.isArray(state.players) &&
    state.players.length >= 2 &&
    state.players.length <= 4 &&
    state.players.every(
      player =>
        Array.isArray(player.tokens) &&
        player.tokens.length === 4 &&
        player.tokens.every(step => typeof step === 'number'),
    ) &&
    typeof state.turn === 'number' &&
    state.turn < state.players.length &&
    !!state.rng &&
    typeof state.rng.a === 'number'
  );
};

/** Online matches are never saved or resumed - leaving one forfeits it. */
export const isOnline = (state: GameState): boolean => state.mode === 'online';

export const saveGame = (state: GameState): Promise<void> =>
  isOnline(state) ? Promise.resolve() : writeJson(SAVE_KEY, state);

export const loadGame = async (): Promise<GameState | null> => {
  const state = await readJson<GameState>(SAVE_KEY);
  if (!looksLikeGame(state) || state.phase === 'over' || isOnline(state)) {
    return null;
  }
  // A save is always resumed at the start of a turn: whatever roll was in
  // flight when the app died is discarded rather than replayed.
  return { ...state, phase: 'roll', die: null };
};

export const clearGame = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(SAVE_KEY);
  } catch {
    // a missing save file is not an error
  }
};

export const loadSettings = async (): Promise<Settings> => {
  const stored = await readJson<Partial<Settings>>(SETTINGS_KEY);
  const merged = { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
  if (!isPieceTheme(merged.pieceTheme)) {
    merged.pieceTheme = DEFAULT_SETTINGS.pieceTheme;
  }
  return merged;
};

export const saveSettings = (settings: Settings): Promise<void> =>
  writeJson(SETTINGS_KEY, settings);

export const loadCareer = async (): Promise<Career> => {
  const stored = await readJson<Partial<Career>>(CAREER_KEY);
  const faces =
    Array.isArray(stored?.faces) && stored?.faces.length === 6
      ? (stored?.faces as number[])
      : EMPTY_CAREER.faces;
  return { ...EMPTY_CAREER, ...(stored ?? {}), faces };
};

export const saveCareer = (career: Career): Promise<void> =>
  writeJson(CAREER_KEY, career);
