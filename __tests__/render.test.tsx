/**
 * Smoke tests: mount every screen and make sure a full CPU-vs-CPU turn can be
 * driven through the real components without throwing.
 */
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ColorId, IN_BASE, createGame } from '../src/engine';
import { DEFAULT_SETTINGS, EMPTY_CAREER } from '../src/state/storage';
import App from '../App';
import { Board } from '../src/components/Board';
import { Dice } from '../src/components/Dice';
import { Pawn } from '../src/components/Pawn';
import { AppIcon } from '../src/components/AppIcon';
import { HomeScreen } from '../src/screens/HomeScreen';
import { GameScreen } from '../src/screens/GameScreen';
import { SplashScreen } from '../src/screens/SplashScreen';
import { CornerWebs } from '../src/components/homeFx';
import { PieceShow, SKITS } from '../src/components/pieceShow';

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
  it('draws the board, dice, pawns and app icon', () => {
    [
      <Board key="b" size={320} seated={[ColorId.Red, ColorId.Yellow]} />,
      <Dice key="d" face={5} size={40} color={ColorId.Blue} />,
      ...(['disc', 'spider'] as const).map(theme => (
        <Pawn
          key={`p-${theme}`}
          color={ColorId.Green}
          height={30}
          theme={theme}
          highlighted
          threatened
        />
      )),
      <AppIcon key="l" size={64} />,
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

  it('hands over from the splash once, even if the parent re-renders', () => {
    jest.useFakeTimers();
    try {
      const onDone = jest.fn();
      let tree!: renderer.ReactTestRenderer;
      act(() => {
        tree = renderer.create(withInsets(<SplashScreen onDone={onDone} />));
      });
      // App hands over a fresh callback while settings load, mid-animation
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      const later = jest.fn();
      act(() => {
        tree.update(withInsets(<SplashScreen onDone={later} />));
      });
      act(() => {
        jest.advanceTimersByTime(2000);
      });
      expect(onDone).not.toHaveBeenCalled();
      expect(later).toHaveBeenCalledTimes(1);
      act(() => {
        jest.advanceTimersByTime(3000);
      });
      expect(later).toHaveBeenCalledTimes(1);
      act(() => {
        tree.unmount();
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it.each(SKITS.map(skit => [skit.name, skit] as const))(
    'plays the %s skit to the end',
    (_name, Skit) => {
      jest.useFakeTimers();
      try {
        const onDone = jest.fn();
        let tree!: renderer.ReactTestRenderer;
        act(() => {
          tree = renderer.create(
            <Skit
              stage={{ W: 335, H: 250, floor: 246, S: 40 }}
              colors={[ColorId.Red, ColorId.Green]}
              onDone={onDone}
            />,
          );
        });
        act(() => {
          jest.advanceTimersByTime(15000);
        });
        expect(onDone).toHaveBeenCalledTimes(1);
        act(() => {
          tree.unmount();
        });
      } finally {
        jest.useRealTimers();
      }
    },
  );

  it('runs the piece show through several skits', () => {
    jest.useFakeTimers();
    try {
      let tree!: renderer.ReactTestRenderer;
      act(() => {
        tree = renderer.create(
          <>
            <CornerWebs />
            <PieceShow width={335} height={250} />
          </>,
        );
      });
      for (let i = 0; i < 12; i++) {
        act(() => {
          jest.advanceTimersByTime(5000);
        });
      }
      act(() => {
        tree.unmount();
      });
    } finally {
      jest.useRealTimers();
    }
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
            onOpenLab={() => {}}
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

  it.each(['disc', 'spider'] as const)(
    'mounts the board screen and lets the CPU take turns (%s pieces)',
    async pieceTheme => {
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
              settings={{ ...DEFAULT_SETTINGS, pieceTheme }}
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
      for (let i = 0; i < 100; i++) {
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
      // Pieces must actually have moved - for Spider that means swung.
      expect(
        latest.players.some(p => p.tokens.some(steps => steps !== IN_BASE)),
      ).toBe(true);
      await act(async () => {
        tree.unmount();
      });
      jest.useRealTimers();
    },
    30000, // simulates ~40 s of CPU play
  );

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
