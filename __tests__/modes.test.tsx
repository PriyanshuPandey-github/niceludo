/**
 * Game modes: the start sheet's three flows, the online opponents, and what
 * the engine records for each mode.
 */
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ColorId, SeatConfig, createGame } from '../src/engine';
import { flagOf, pickOpponents } from '../src/state/online';
import {
  DEFAULT_SETTINGS,
  EMPTY_CAREER,
  loadGame,
  saveGame,
} from '../src/state/storage';
import { NewGameSheet } from '../src/components/NewGameSheet';
import { GameScreen } from '../src/screens/GameScreen';
import { SafeAreaProvider } from 'react-native-safe-area-context';

const metrics = {
  frame: { x: 0, y: 0, width: 400, height: 840 },
  insets: { top: 34, left: 0, right: 0, bottom: 24 },
};

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const press = (tree: renderer.ReactTestRenderer, label: string) => {
  const node = tree.root.find(
    n =>
      n.props?.accessibilityLabel === label &&
      typeof n.props.onPress === 'function',
  );
  act(() => {
    node.props.onPress();
  });
};

const pressText = (tree: renderer.ReactTestRenderer, text: string) => {
  const node = tree.root.find(
    n =>
      typeof n.props?.onPress === 'function' &&
      n.findAll(c => c.props?.children === text).length > 0,
  );
  act(() => {
    node.props.onPress();
  });
};

const mountSheet = (seats: ColorId[]) => {
  const onStart = jest.fn();
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <NewGameSheet
        visible
        onClose={() => {}}
        seats={seats}
        onSeatsChange={() => {}}
        difficulty="normal"
        onDifficultyChange={() => {}}
        onStart={onStart}
      />,
    );
  });
  return { tree, onStart };
};

describe('online opponents', () => {
  it('are distinct players from different countries', () => {
    for (let run = 0; run < 50; run++) {
      const opponents = pickOpponents(3);
      expect(opponents).toHaveLength(3);
      expect(new Set(opponents.map(o => o.name)).size).toBe(3);
      expect(new Set(opponents.map(o => o.country)).size).toBe(3);
      opponents.forEach(o => expect(o.country).toMatch(/^[A-Z]{2}$/));
    }
  });

  it('turn a country code into its flag', () => {
    expect(flagOf('IN')).toBe('🇮🇳');
    expect(flagOf('br')).toBe('🇧🇷');
  });
});

describe('engine', () => {
  const seats: SeatConfig[] = [
    { color: ColorId.Red, type: 'human', name: 'You' },
    { color: ColorId.Blue, type: 'cpu', name: 'Lucas_77', country: 'BR' },
  ];

  it('records the mode and keeps countries on seats', () => {
    const state = createGame(seats, 'hard', [1, 2, 3, 4], 'online');
    expect(state.mode).toBe('online');
    expect(state.difficulty).toBe('hard');
    expect(state.players.find(p => p.name === 'Lucas_77')?.country).toBe('BR');
    expect(state.players.find(p => p.name === 'You')).not.toHaveProperty(
      'country',
    );
  });

  it('defaults to vs CPU and survives a save round trip', async () => {
    expect(createGame(seats).mode).toBe('cpu');
    await AsyncStorage.clear();
    await saveGame(createGame(seats, 'normal', [1, 2, 3, 4], 'local'));
    expect((await loadGame())?.mode).toBe('local');
  });

  it('never saves or resumes an online match', async () => {
    await AsyncStorage.clear();
    const offline = createGame(seats, 'normal', [1, 2, 3, 4], 'cpu');
    await saveGame(offline);
    // an online match must not replace the resumable game...
    await saveGame(createGame(seats, 'hard', [1, 2, 3, 4], 'online'));
    expect((await loadGame())?.startedAt).toBe(offline.startedAt);
    // ...and an online save written some other way is not offered
    await AsyncStorage.setItem(
      '@niceludo/save/v1',
      JSON.stringify(createGame(seats, 'hard', [1, 2, 3, 4], 'online')),
    );
    expect(await loadGame()).toBeNull();
  });
});

describe('leaving an online match', () => {
  const mountGame = (mode: 'online' | 'cpu') => {
    const onExit = jest.fn();
    const game = createGame(
      [
        { color: ColorId.Red, type: 'human', name: 'You' },
        { color: ColorId.Blue, type: 'cpu', name: 'Lucas_77', country: 'BR' },
      ],
      'hard',
      [1, 2, 3, 4],
      mode,
    );
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <SafeAreaProvider initialMetrics={metrics}>
          <GameScreen
            initial={game}
            settings={DEFAULT_SETTINGS}
            career={EMPTY_CAREER}
            onPersist={() => {}}
            onRollTallied={() => {}}
            onGameOver={() => {}}
            onExit={onExit}
            onRematch={() => {}}
            onSettingsChange={() => {}}
          />
        </SafeAreaProvider>,
      );
    });
    return { tree, onExit };
  };

  const labels = (tree: renderer.ReactTestRenderer) =>
    tree.root
      .findAll(n => typeof n.props?.onPress === 'function')
      .map(n => n.props.accessibilityLabel)
      .filter(Boolean);

  it('asks before leaving', () => {
    jest.useFakeTimers();
    try {
      const { tree, onExit } = mountGame('online');
      press(tree, 'Game menu');
      expect(labels(tree)).not.toContain('Save and quit to menu');
      press(tree, 'Leave match');
      // the warning, not the exit
      expect(onExit).not.toHaveBeenCalled();
      expect(labels(tree)).toContain('Keep playing');
      press(tree, 'Keep playing');
      expect(onExit).not.toHaveBeenCalled();

      press(tree, 'Game menu');
      press(tree, 'Leave match');
      const confirm = tree.root
        .findAll(
          n =>
            n.props?.accessibilityLabel === 'Leave match' &&
            typeof n.props.onPress === 'function',
        )
        .pop();
      act(() => confirm?.props.onPress());
      expect(onExit).toHaveBeenCalledTimes(1);
      act(() => tree.unmount());
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps save and quit for offline games', () => {
    jest.useFakeTimers();
    try {
      const { tree } = mountGame('cpu');
      press(tree, 'Game menu');
      expect(labels(tree)).toContain('Save and quit to menu');
      expect(labels(tree)).not.toContain('Leave match');
      act(() => tree.unmount());
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('start sheet', () => {
  it('starts a vs CPU game with CPU seats', () => {
    const { tree, onStart } = mountSheet([ColorId.Red, ColorId.Yellow]);
    press(tree, 'vs CPU');
    pressText(tree, 'Play');
    expect(onStart).toHaveBeenCalledWith(
      [
        { color: ColorId.Red, type: 'human', name: 'You' },
        { color: ColorId.Yellow, type: 'cpu', name: 'CPU' },
      ],
      'cpu',
    );
    act(() => tree.unmount());
  });

  it('starts a pass-and-play game with every seat human', () => {
    const { tree, onStart } = mountSheet([
      ColorId.Red,
      ColorId.Green,
      ColorId.Blue,
    ]);
    press(tree, 'Pass & Play');
    pressText(tree, 'Play');
    const [configs, mode] = onStart.mock.calls[0];
    expect(mode).toBe('local');
    expect(configs.map((c: SeatConfig) => c.type)).toEqual([
      'human',
      'human',
      'human',
    ]);
    expect(configs.map((c: SeatConfig) => c.name)).toEqual([
      'Player 1',
      'Player 2',
      'Player 3',
    ]);
    act(() => tree.unmount());
  });

  it('matches online opponents one by one, then starts', () => {
    jest.useFakeTimers();
    try {
      const { tree, onStart } = mountSheet([
        ColorId.Red,
        ColorId.Green,
        ColorId.Yellow,
        ColorId.Blue,
      ]);
      press(tree, 'Online');
      pressText(tree, 'Find match');
      expect(
        tree.root.findAll(n => n.props?.children === 'Searching...').length,
      ).toBeGreaterThan(0);
      expect(onStart).not.toHaveBeenCalled();
      act(() => {
        jest.advanceTimersByTime(10000);
      });
      expect(onStart).toHaveBeenCalledTimes(1);
      const [configs, mode] = onStart.mock.calls[0];
      expect(mode).toBe('online');
      expect(configs[0]).toEqual({
        color: ColorId.Red,
        type: 'human',
        name: 'You',
      });
      configs.slice(1).forEach((c: SeatConfig) => {
        expect(c.type).toBe('cpu');
        expect(c.country).toMatch(/^[A-Z]{2}$/);
        expect(c.name).not.toMatch(/^CPU/);
      });
      act(() => tree.unmount());
    } finally {
      jest.useRealTimers();
    }
  });

  it('cancels matchmaking without starting', () => {
    jest.useFakeTimers();
    try {
      const { tree, onStart } = mountSheet([ColorId.Red, ColorId.Yellow]);
      press(tree, 'Online');
      pressText(tree, 'Find match');
      pressText(tree, 'Cancel');
      act(() => {
        jest.advanceTimersByTime(10000);
      });
      expect(onStart).not.toHaveBeenCalled();
      act(() => tree.unmount());
    } finally {
      jest.useRealTimers();
    }
  });
});
