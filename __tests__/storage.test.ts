import AsyncStorage from '@react-native-async-storage/async-storage';
import { ColorId, createGame } from '../src/engine';
import {
  DEFAULT_SETTINGS,
  clearGame,
  loadCareer,
  loadGame,
  loadSettings,
  saveCareer,
  saveGame,
  saveSettings,
} from '../src/state/storage';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const SAVE_KEY = '@niceludo/save/v1';

const game = () =>
  createGame(
    [
      { color: ColorId.Red, type: 'human', name: 'You' },
      { color: ColorId.Blue, type: 'cpu', name: 'CPU' },
    ],
    'hard',
    [4, 5, 6, 7],
  );

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('save and resume', () => {
  it('round-trips a game, generator state included', async () => {
    const original = {
      ...game(),
      turnCount: 12,
      turn: 1,
    };
    original.players[0].tokens = [7, -1, 56, 52];
    await saveGame(original);

    const restored = await loadGame();
    expect(restored).not.toBeNull();
    expect(restored?.players[0].tokens).toEqual([7, -1, 56, 52]);
    expect(restored?.turn).toBe(1);
    expect(restored?.turnCount).toBe(12);
    // Resuming continues the same dice stream rather than reseeding.
    expect(restored?.rng).toEqual(original.rng);
  });

  it('always resumes at the start of a turn', async () => {
    await saveGame({ ...game(), phase: 'select', die: 6 });
    const restored = await loadGame();
    expect(restored?.phase).toBe('roll');
    expect(restored?.die).toBeNull();
  });

  it('does not offer a finished game', async () => {
    await saveGame({ ...game(), phase: 'over' });
    expect(await loadGame()).toBeNull();
  });

  it('ignores a corrupt or foreign save file', async () => {
    await AsyncStorage.setItem(SAVE_KEY, 'not json at all');
    expect(await loadGame()).toBeNull();

    await AsyncStorage.setItem(SAVE_KEY, JSON.stringify({ version: 99 }));
    expect(await loadGame()).toBeNull();

    await AsyncStorage.setItem(
      SAVE_KEY,
      JSON.stringify({ ...game(), players: [] }),
    );
    expect(await loadGame()).toBeNull();
  });

  it('clears the save when asked', async () => {
    await saveGame(game());
    await clearGame();
    expect(await loadGame()).toBeNull();
  });
});

describe('settings and career', () => {
  it('falls back to defaults when nothing is stored', async () => {
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
    const career = await loadCareer();
    expect(career.faces).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('merges stored settings over the defaults', async () => {
    await saveSettings({
      ...DEFAULT_SETTINGS,
      difficulty: 'hard',
      vibrate: false,
    });
    const loaded = await loadSettings();
    expect(loaded.difficulty).toBe('hard');
    expect(loaded.vibrate).toBe(false);
    expect(loaded.showHints).toBe(DEFAULT_SETTINGS.showHints);
  });

  it('keeps the lifetime dice tally', async () => {
    await saveCareer({
      gamesPlayed: 3,
      gamesFinished: 2,
      wins: 1,
      faces: [10, 11, 9, 12, 8, 10],
    });
    const career = await loadCareer();
    expect(career.wins).toBe(1);
    expect(career.faces[3]).toBe(12);
  });
});
