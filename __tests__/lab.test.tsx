import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ColorId, FINISHED, IN_BASE } from '../src/engine';
import { DEFAULT_SETTINGS, EMPTY_CAREER } from '../src/state/storage';
import { GameDemo, GameScreen } from '../src/screens/GameScreen';
import { AnimationLab } from '../src/screens/AnimationLab';
import { SCENARIOS, idleBoard, scenariosFor } from '../src/lab/scenarios';
import { PieceTheme } from '../src/theme/theme';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const metrics = {
  frame: { x: 0, y: 0, width: 400, height: 840 },
  insets: { top: 34, left: 0, right: 0, bottom: 24 },
};

/** Mount a demo board and return its remote plus what it reported. */
const mountDemo = (pieceTheme: PieceTheme) => {
  const api: { current: GameDemo | null } = { current: null };
  const reported = { persisted: 0, tallied: 0, over: 0 };
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={metrics}>
        <GameScreen
          initial={idleBoard()}
          settings={{ ...DEFAULT_SETTINGS, pieceTheme }}
          career={EMPTY_CAREER}
          onPersist={() => (reported.persisted += 1)}
          onRollTallied={() => (reported.tallied += 1)}
          onGameOver={() => (reported.over += 1)}
          onExit={() => {}}
          onRematch={() => {}}
          onSettingsChange={() => {}}
          demo={{ api }}
        />
      </SafeAreaProvider>,
    );
  });
  return { api, reported, tree };
};

/** Run a scenario to completion on fake timers. */
const play = async (demo: GameDemo, id: string) => {
  const scenario = SCENARIOS.find(s => s.id === id)!;
  let done = false;
  act(() => {
    scenario.run(demo).then(() => (done = true));
  });
  for (let i = 0; i < 400 && !done; i++) {
    await act(async () => {
      jest.advanceTimersByTime(100);
      await Promise.resolve();
    });
  }
  expect(done).toBe(true);
};

const tokensOf = (demo: GameDemo, color: ColorId) =>
  demo.current().players.find(p => p.color === color)!.tokens;

describe('animation lab scenarios', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  (['disc', 'spider'] as const).forEach(theme => {
    describe(`${theme} pieces`, () => {
      it('brings a piece out of the yard', async () => {
        const { api, tree } = mountDemo(theme);
        await play(api.current!, 'leave');
        expect(tokensOf(api.current!, ColorId.Red)[0]).toBe(0);
        act(() => tree.unmount());
      });

      it('moves along the track', async () => {
        const { api, tree } = mountDemo(theme);
        await play(api.current!, 'move');
        expect(tokensOf(api.current!, ColorId.Red)[0]).toBe(7);
        act(() => tree.unmount());
      });

      it('captures, and sends the victim home', async () => {
        const { api, tree } = mountDemo(theme);
        await play(api.current!, 'capture');
        expect(tokensOf(api.current!, ColorId.Green)[1]).toBe(IN_BASE);
        act(() => tree.unmount());
      });

      it('captures two at once', async () => {
        const { api, tree } = mountDemo(theme);
        await play(api.current!, 'double');
        const green = tokensOf(api.current!, ColorId.Green);
        expect([green[1], green[2]]).toEqual([IN_BASE, IN_BASE]);
        act(() => tree.unmount());
      });

      it('finishes a piece', async () => {
        const { api, tree } = mountDemo(theme);
        await play(api.current!, 'home');
        expect(tokensOf(api.current!, ColorId.Red)[0]).toBe(FINISHED);
        act(() => tree.unmount());
      });

      it('wins the game, without reporting it', async () => {
        const { api, reported, tree } = mountDemo(theme);
        await play(api.current!, 'win');
        expect(api.current!.current().phase).toBe('over');
        expect(reported.over).toBe(0);
        act(() => tree.unmount());
      });
    });
  });

  it('never saves the demo or tallies its rolls', async () => {
    const { api, reported, tree } = mountDemo('spider');
    for (const scenario of scenariosFor(true)) {
      await play(api.current!, scenario.id);
    }
    expect(reported).toEqual({ persisted: 0, tallied: 0, over: 0 });
    act(() => tree.unmount());
  }, 30000); // plays every scenario back to back

  it('only offers the eye moods with Spider pieces', () => {
    expect(scenariosFor(false).some(s => s.id === 'eyes')).toBe(false);
    expect(scenariosFor(true).some(s => s.id === 'eyes')).toBe(true);
  });
});

describe('AnimationLab', () => {
  it('mounts with its controls', () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <SafeAreaProvider initialMetrics={metrics}>
          <AnimationLab
            settings={DEFAULT_SETTINGS}
            career={EMPTY_CAREER}
            onClose={() => {}}
          />
        </SafeAreaProvider>,
      );
    });
    const labels = tree.root
      .findAll(node => node.props.accessibilityRole === 'button')
      .map(node => node.props.accessibilityLabel)
      .filter(Boolean);
    expect(labels).toContain('Close animation lab');
    expect(labels).toContain('Play all');
    act(() => tree.unmount());
  });
});
