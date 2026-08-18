/**
 * NiceLudo - offline Ludo for Android.
 *
 * This component owns the three routes (splash, menu, board), the persisted
 * settings/career, and the save file. Everything below it is either a pure
 * engine module or a presentational component.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GameState, SeatConfig, createGame } from './src/engine';
import {
  Career,
  DEFAULT_SETTINGS,
  EMPTY_CAREER,
  Settings,
  clearGame,
  loadCareer,
  loadGame,
  loadSettings,
  saveCareer,
  saveGame,
  saveSettings,
} from './src/state/storage';
import { colors } from './src/theme/theme';
import { SplashScreen } from './src/screens/SplashScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { GameScreen } from './src/screens/GameScreen';

type Route = 'splash' | 'home' | 'game';

const App = () => {
  const [route, setRoute] = useState<Route>('splash');
  const [ready, setReady] = useState(false);
  const [splashDone, setSplashDone] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [career, setCareer] = useState<Career>(EMPTY_CAREER);
  const [saved, setSaved] = useState<GameState | null>(null);
  const [game, setGame] = useState<GameState | null>(null);
  const [gameKey, setGameKey] = useState(0);

  const careerRef = useRef(career);
  careerRef.current = career;
  const liveGame = useRef<GameState | null>(null);
  const settledGames = useRef(new Set<number>());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [storedSettings, storedCareer, storedGame] = await Promise.all([
        loadSettings(),
        loadCareer(),
        loadGame(),
      ]);
      if (cancelled) {
        return;
      }
      setSettings(storedSettings);
      setCareer(storedCareer);
      setSaved(storedGame);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (ready && splashDone && route === 'splash') {
      setRoute('home');
    }
  }, [ready, splashDone, route]);

  /** Flush the in-memory game and career to disk (also used on background). */
  const flush = useCallback(() => {
    if (liveGame.current && liveGame.current.phase !== 'over') {
      saveGame(liveGame.current);
    }
    saveCareer(careerRef.current);
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', status => {
      if (status !== 'active') {
        flush();
      }
    });
    return () => subscription.remove();
  }, [flush]);

  const updateSettings = useCallback((next: Settings) => {
    setSettings(next);
    saveSettings(next);
  }, []);

  const startGame = useCallback(
    (seats: SeatConfig[]) => {
      const fresh = createGame(seats, settings.difficulty);
      liveGame.current = fresh;
      setGame(fresh);
      setSaved(fresh);
      setGameKey(key => key + 1);
      setRoute('game');
      setCareer(current => {
        const next = { ...current, gamesPlayed: current.gamesPlayed + 1 };
        saveCareer(next);
        return next;
      });
      saveGame(fresh);
    },
    [settings.difficulty],
  );

  const resumeGame = useCallback(() => {
    if (!saved) {
      return;
    }
    liveGame.current = saved;
    setGame(saved);
    setGameKey(key => key + 1);
    setRoute('game');
  }, [saved]);

  const discardSave = useCallback(() => {
    setSaved(null);
    liveGame.current = null;
    clearGame();
  }, []);

  const persistGame = useCallback((state: GameState) => {
    liveGame.current = state;
    setSaved(state);
    saveGame(state);
  }, []);

  const tallyRoll = useCallback((face: number) => {
    setCareer(current => {
      const faces = current.faces.slice();
      faces[face - 1] += 1;
      return { ...current, faces };
    });
  }, []);

  const finishGame = useCallback((state: GameState) => {
    // The board reports the finished state on every render, so guard on the
    // game's own id to keep the career tally honest.
    if (settledGames.current.has(state.startedAt)) {
      return;
    }
    settledGames.current.add(state.startedAt);
    const human = state.players.find(seat => seat.type === 'human');
    setCareer(current => {
      const next = {
        ...current,
        gamesFinished: current.gamesFinished + 1,
        wins: current.wins + (human && human.rank === 1 ? 1 : 0),
      };
      saveCareer(next);
      return next;
    });
    liveGame.current = null;
    setSaved(null);
    clearGame();
  }, []);

  const exitToMenu = useCallback(() => {
    flush();
    setRoute('home');
  }, [flush]);

  const rematch = useCallback(() => {
    const current = liveGame.current ?? game;
    if (!current) {
      setRoute('home');
      return;
    }
    startGame(
      current.players.map(seat => ({
        color: seat.color,
        type: seat.type,
        name: seat.name,
      })),
    );
  }, [game, startGame]);

  return (
    <SafeAreaProvider>
      <View style={styles.root}>
        {/* Edge-to-edge is on by default in RN 0.87, so the bars are
            transparent and only the icon colour needs setting. */}
        <StatusBar barStyle="light-content" />
        {route === 'splash' ? (
          <SplashScreen onDone={() => setSplashDone(true)} />
        ) : null}
        {route === 'home' ? (
          <HomeScreen
            saved={saved}
            settings={settings}
            career={career}
            onSettingsChange={updateSettings}
            onStart={startGame}
            onResume={resumeGame}
            onDiscardSave={discardSave}
          />
        ) : null}
        {route === 'game' && game ? (
          <GameScreen
            key={gameKey}
            initial={game}
            settings={settings}
            career={career}
            onPersist={persistGame}
            onRollTallied={tallyRoll}
            onGameOver={finishGame}
            onExit={exitToMenu}
            onRematch={rematch}
            onSettingsChange={updateSettings}
          />
        ) : null}
      </View>
    </SafeAreaProvider>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgDeep },
});

export default App;
