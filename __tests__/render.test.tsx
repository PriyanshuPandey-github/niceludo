/**
 * Smoke tests: mount every screen and make sure a full CPU-vs-CPU turn can be
 * driven through the real components without throwing.
 */
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ColorId, createGame } from '../src/engine';
import { DEFAULT_SETTINGS, EMPTY_CAREER } from '../src/state/storage';
import App from '../App';
import { Board } from '../src/components/Board';
import { Dice } from '../src/components/Dice';
import { Pawn } from '../src/components/Pawn';
import { Logo } from '../src/components/Logo';
import { HomeScreen } from '../src/screens/HomeScreen';
import { GameScreen } from '../src/screens/GameScreen';
import { SplashScreen } from '../src/screens/SplashScreen';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const metrics = {
  frame: { x: 0, y: 0, width: 400, height: 840 },
  insets: { top: 34, left: 0, right: 0, bottom: 24 },
};

/** Screens use safe-area insets, so tests need a provider with real metrics. */
const withInsets = (element: React.ReactElement) => (
  <SafeAreaProvider initialMetrics={metrics}>{element}</SafeAreaProvider>
);

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

// react-native-svg renders through a host component that the test renderer
// serialises as null, so these assert "mounts without throwing" rather than
// inspecting a tree.
describe('components render', () => {
  it('draws the board, dice, pawns and logo', () => {
    [
      <Board key="b" size={320} seated={[ColorId.Red, ColorId.Yellow]} />,
      <Dice key="d" face={5} size={40} color={ColorId.Blue} />,
      <Pawn key="p" color={ColorId.Green} height={30} highlighted threatened />,
      <Logo key="l" size={64} />,
    ].forEach(element => {
      expect(() => {
        let tree: renderer.ReactTestRenderer | null = null;
        act(() => {
          tree = renderer.create(element);
        });
        act(() => {
          tree?.unmount();
        });
      }).not.toThrow();
    });
  });

  it('renders every dice face', () => {
    for (let face = 1; face <= 6; face++) {
      expect(() => {
        let tree: renderer.ReactTestRenderer | null = null;
        act(() => {
          tree = renderer.create(
            <Dice face={face} size={40} color={ColorId.Red} />,
          );
        });
        act(() => {
          tree?.unmount();
        });
      }).not.toThrow();
    }
  });
});

describe('screens render', () => {
  it('mounts the splash screen', async () => {
    const tree = renderer.create(
      withInsets(<SplashScreen onDone={() => {}} />),
    );
    await flush();
    expect(tree.toJSON()).toBeTruthy();
    await act(async () => {
      tree.unmount();
    });
  });

  it('mounts the menu with a saved game', async () => {
    const saved = createGame(
      [
        { color: ColorId.Red, type: 'human', name: 'You' },
        { color: ColorId.Yellow, type: 'cpu', name: 'CPU' },
      ],
      'normal',
      [1, 2, 3, 4],
    );
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        withInsets(
          <HomeScreen
            saved={saved}
            settings={DEFAULT_SETTINGS}
            career={EMPTY_CAREER}
            onSettingsChange={() => {}}
            onStart={() => {}}
            onResume={() => {}}
            onDiscardSave={() => {}}
          />,
        ),
      );
    });
    await flush();
    expect(tree.toJSON()).toBeTruthy();
    await act(async () => {
      tree.unmount();
    });
  });

  it('mounts the board screen and lets the CPU take turns', async () => {
    jest.useFakeTimers();
    const game = createGame(
      [
        { color: ColorId.Red, type: 'cpu', name: 'CPU 1' },
        { color: ColorId.Green, type: 'cpu', name: 'CPU 2' },
        { color: ColorId.Blue, type: 'cpu', name: 'CPU 3' },
      ],
      'hard',
      [9, 9, 9, 9],
    );
    let persisted = 0;
    let latest = game;
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        withInsets(
          <GameScreen
            initial={game}
            settings={DEFAULT_SETTINGS}
            career={EMPTY_CAREER}
            onPersist={state => {
              persisted += 1;
              latest = state;
            }}
            onRollTallied={() => {}}
            onGameOver={() => {}}
            onExit={() => {}}
            onRematch={() => {}}
            onSettingsChange={() => {}}
          />,
        ),
      );
    });
    // Let a few turns play out on fake timers.
    for (let i = 0; i < 40; i++) {
      await act(async () => {
        jest.advanceTimersByTime(400);
        await Promise.resolve();
      });
    }
    expect(tree.toJSON()).toBeTruthy();
    expect(persisted).toBeGreaterThan(0);
    // The CPU loop must actually advance the game, not just mount it.
    const rolls = latest.stats.faces
      .flat()
      .reduce((sum: number, count: number) => sum + count, 0);
    expect(rolls).toBeGreaterThan(3);
    expect(latest.turnCount).toBeGreaterThan(0);
    await act(async () => {
      tree.unmount();
    });
    jest.useRealTimers();
  });

  it('boots the app end to end', async () => {
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<App />);
    });
    await flush();
    await flush();
    expect(tree.toJSON()).toBeTruthy();
    await act(async () => {
      tree.unmount();
    });
  });
});
