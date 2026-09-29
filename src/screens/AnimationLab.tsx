/**
 * Animation lab: a demo board with a control panel that plays every
 * animation and scenario on demand - rolls, moves, captures, finishing,
 * winning and (for Spider) the eye moods - through the real game screen.
 *
 * Nothing here is saved: demo games are never persisted, never tallied into
 * the fair-dice stats, and never touch the dice stream.
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Career, Settings } from '../state/storage';
import { PIECE_THEMES, PieceTheme, colors, radius } from '../theme/theme';
import { Button, Segmented } from '../components/ui';
import { Mood } from '../components/eyes';
import { GameDemo, GameScreen } from './GameScreen';
import { Scenario, idleBoard, scenariosFor } from '../lab/scenarios';

const noop = () => {};

const MOOD_CHIPS: Array<{ mood: Mood | null; label: string }> = [
  { mood: null, label: 'Auto' },
  { mood: 'idle', label: 'Idle' },
  { mood: 'ready', label: 'Ready' },
  { mood: 'danger', label: 'Danger' },
  { mood: 'moving', label: 'Moving' },
  { mood: 'happy', label: 'Happy' },
  { mood: 'hurt', label: 'Hurt' },
];

const Chip = ({
  label,
  active,
  disabled,
  onPress,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    accessibilityRole="button"
    accessibilityState={{ selected: active, disabled }}
    style={[
      styles.chip,
      active && styles.chipActive,
      disabled && styles.chipDisabled,
    ]}
  >
    <Text style={[styles.chipText, active && styles.chipTextActive]}>
      {label}
    </Text>
  </Pressable>
);

export interface AnimationLabProps {
  settings: Settings;
  career: Career;
  onClose: () => void;
}

export const AnimationLab = ({
  settings,
  career,
  onClose,
}: AnimationLabProps) => {
  const insets = useSafeAreaInsets();
  const api = useRef<GameDemo | null>(null);
  const demo = useMemo(() => ({ api }), []);
  const [initial] = useState(idleBoard);
  const [theme, setTheme] = useState<PieceTheme>(settings.pieceTheme);
  const [playing, setPlaying] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [mood, setMood] = useState<Mood | null>(null);

  const hero = theme === 'spider';
  const scenarios = scenariosFor(hero);
  const labSettings = useMemo(
    () => ({ ...settings, pieceTheme: theme, showHints: true }),
    [settings, theme],
  );

  const chooseMood = useCallback((next: Mood | null) => {
    setMood(next);
    api.current?.setMood(next);
  }, []);

  /** Play scenarios one after another, folding the panel out of the way. */
  const play = useCallback(
    async (list: Scenario[], label: string) => {
      if (playing || !api.current) {
        return;
      }
      setPlaying(label);
      setPanelOpen(false);
      chooseMood(null);
      try {
        for (const scenario of list) {
          if (!api.current) {
            break;
          }
          await scenario.run(api.current);
          await new Promise<void>(resolve => setTimeout(resolve, 700));
        }
      } finally {
        setPlaying(null);
        setPanelOpen(true);
      }
    },
    [chooseMood, playing],
  );

  return (
    <View style={styles.root}>
      <GameScreen
        initial={initial}
        settings={labSettings}
        career={career}
        onPersist={noop}
        onRollTallied={noop}
        onGameOver={noop}
        onExit={onClose}
        onRematch={() => api.current?.reset(idleBoard())}
        onSettingsChange={noop}
        demo={demo}
      />

      <Pressable
        onPress={onClose}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Close animation lab"
        style={[styles.close, { top: insets.top + 6 }]}
      >
        <Text style={styles.closeText}>✕</Text>
      </Pressable>

      <View
        pointerEvents="box-none"
        style={[styles.panelWrap, { paddingBottom: insets.bottom + 8 }]}
      >
        {panelOpen ? (
          <View style={styles.panel}>
            <View style={styles.panelHeader}>
              <Text style={styles.title}>Animation lab</Text>
              <Pressable
                onPress={() => setPanelOpen(false)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Hide controls"
              >
                <Text style={styles.hide}>Hide ▾</Text>
              </Pressable>
            </View>

            <Segmented<PieceTheme>
              options={PIECE_THEMES.map(t => ({ value: t.id, label: t.label }))}
              value={theme}
              onChange={next => {
                setTheme(next);
                chooseMood(null);
              }}
            />

            <Text style={styles.section}>Scenarios</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
            >
              {scenarios.map(scenario => (
                <Chip
                  key={scenario.id}
                  label={scenario.label}
                  disabled={!!playing}
                  onPress={() => play([scenario], scenario.label)}
                />
              ))}
            </ScrollView>

            {hero ? (
              <>
                <Text style={styles.section}>Eyes</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chipRow}
                >
                  {MOOD_CHIPS.map(chip => (
                    <Chip
                      key={chip.label}
                      label={chip.label}
                      active={mood === chip.mood}
                      disabled={!!playing}
                      onPress={() => chooseMood(chip.mood)}
                    />
                  ))}
                </ScrollView>
              </>
            ) : null}

            <Button
              label="Play all"
              compact
              style={styles.playAll}
              onPress={() => play(scenarios, 'All scenarios')}
              disabled={!!playing}
            />
          </View>
        ) : (
          <Pressable
            onPress={() => !playing && setPanelOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={
              playing ? `Playing ${playing}` : 'Show controls'
            }
            style={styles.pill}
          >
            <Text style={styles.pillText}>
              {playing ? `Playing: ${playing}…` : 'Animation lab ▴'}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgDeep },
  close: {
    position: 'absolute',
    left: 12,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  closeText: { color: colors.text, fontSize: 18, fontWeight: '800' },
  panelWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  panel: {
    alignSelf: 'stretch',
    padding: 14,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(26,4,7,0.94)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  panelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  title: { color: colors.text, fontSize: 16, fontWeight: '800' },
  hide: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
  section: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: 12,
    marginBottom: 6,
  },
  chipRow: { gap: 8, paddingRight: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceStrong,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: 'rgba(230,233,238,0.16)',
    borderColor: colors.accent,
  },
  chipDisabled: { opacity: 0.45 },
  chipText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  chipTextActive: { color: colors.accent },
  playAll: { marginTop: 14 },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(26,4,7,0.9)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillText: { color: colors.text, fontSize: 13, fontWeight: '700' },
});
