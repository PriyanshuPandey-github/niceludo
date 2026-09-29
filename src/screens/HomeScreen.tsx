import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ColorId,
  GameMode,
  GameState,
  SeatConfig,
} from '../engine';
import { Career, Settings } from '../state/storage';
import { colors, radius } from '../theme/theme';
import { Backdrop } from '../components/Backdrop';
import { AppIcon } from '../components/AppIcon';
import { Card, GradientFill } from '../components/ui';
import { FairnessSheet, RulesSheet, SettingsSheet } from '../components/sheets';
import { NewGameSheet } from '../components/NewGameSheet';
import { CornerWebs } from '../components/homeFx';
import { PieceShow } from '../components/pieceShow';
import { SpiderLogo } from '../components/SpiderLogo';
import { OfflineBanner } from '../components/OfflineBanner';
import { useIsOnline } from '../state/network';
import {
  IconHistory,
  IconPlay,
  IconDice,
  IconBook,
  IconGear,
  IconChevronRight,
} from '../components/Icons';

/** The landing screen opens on a ready-to-play 1 vs 1 game. */
const DEFAULT_SEATS: ColorId[] = [ColorId.Red, ColorId.Yellow];

const MODE_LABEL: Record<GameMode, string> = {
  cpu: 'vs CPU',
  local: 'Pass & Play',
  online: 'Online',
};

export interface HomeScreenProps {
  saved: GameState | null;
  settings: Settings;
  career: Career;
  onSettingsChange: (settings: Settings) => void;
  onStart: (seats: SeatConfig[], mode: GameMode) => void;
  onResume: () => void;
  onDiscardSave: () => void;
  /** open the animation lab */
  onOpenLab: () => void;
}

export const HomeScreen = ({
  saved,
  settings,
  career,
  onSettingsChange,
  onStart,
  onResume,
  onDiscardSave,
  onOpenLab,
}: HomeScreenProps) => {
  const insets = useSafeAreaInsets();
  const online = useIsOnline();
  const { width } = useWindowDimensions();
  const [seats, setSeats] = useState<ColorId[]>(DEFAULT_SEATS);
  const [sheet, setSheet] = useState<
    'none' | 'setup' | 'rules' | 'settings' | 'fair'
  >('none');

  /** the hero - the die and the pieces' skits - spans the content width */
  const stageWidth = width - 40;
  const stageHeight = Math.round(Math.min(stageWidth * 0.7, 280));

  return (
    <Backdrop>
      <CornerWebs />
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: Math.max(insets.top, 32) + 20, paddingBottom: insets.bottom + 28 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <AppIcon size={54} />
          <View style={styles.headerText}>
            <Text style={styles.title}>SPIDER LUDO</Text>
            <Text style={styles.subtitle}>Luck plays no favourites.</Text>
          </View>
        </View>

        <View style={[styles.stage, { height: stageHeight }]}>
          {/* the logo as a faint backdrop, so the eye stays on the show */}
          <View pointerEvents="none" style={styles.heroLogo}>
            <SpiderLogo width={stageWidth * 0.84} />
          </View>
          <PieceShow width={stageWidth} height={stageHeight} />
        </View>

        {saved ? (
          <Card style={styles.resumeCard}>
            <View style={styles.resumeRow}>
              <View style={styles.historyIconBox}>
                <IconHistory color={colors.text} size={24} />
              </View>
              <View style={styles.resumeTextCol}>
                <Text style={styles.resumeTitle}>Continue last game</Text>
                <Text style={styles.resumeMeta}>
                  {`${MODE_LABEL[saved.mode ?? 'cpu']} · ${saved.players.length} players · Turn ${saved.turnCount}`}
                </Text>
              </View>
              <View style={styles.resumeActionCol}>
                <Pressable
                  onPress={onDiscardSave}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Discard saved game"
                  style={styles.discard}
                >
                  <Text style={styles.discardText}>✕</Text>
                </Pressable>
                <Pressable onPress={onResume} style={styles.resumeButtonNew}>
                  <GradientFill from={colors.accentLight} to={colors.accentDeep} angle="horizontal" />
                  <IconPlay color={colors.onAccent} size={16} />
                  <Text style={styles.resumeButtonText}>Resume</Text>
                </Pressable>
              </View>
            </View>
          </Card>
        ) : null}

        <Pressable
          onPress={() => setSheet('setup')}
          accessibilityRole="button"
          style={styles.playButtonNew}
        >
          <View style={StyleSheet.absoluteFill}>
            <GradientFill from={colors.primary} to={colors.primaryDeep} angle="horizontal" />
          </View>
          <IconDice color="#fff" size={32} />
          <Text style={styles.playButtonText}>Start Game</Text>
          <IconChevronRight color="#fff" size={24} />
        </Pressable>

        <View style={styles.footer}>
          {[
            { key: 'rules', label: 'How to play', icon: IconBook },
            { key: 'fair', label: 'Dice odds', icon: IconDice },
            { key: 'settings', label: 'Settings', icon: IconGear },
          ].map(item => {
            const Icon = item.icon;
            return (
              <Pressable
                key={item.key}
                onPress={() => setSheet(item.key as typeof sheet)}
                accessibilityRole="button"
                style={styles.footerButton}
              >
                <Icon color={colors.textMuted} size={18} />
                <Text style={styles.footerLabel}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {career.gamesFinished > 0 ? (
          <Text style={styles.version}>
            {`${career.wins} wins in ${career.gamesFinished} finished games`}
          </Text>
        ) : null}
      </ScrollView>

      <NewGameSheet
        visible={sheet === 'setup'}
        onClose={() => setSheet('none')}
        seats={seats}
        onSeatsChange={setSeats}
        difficulty={settings.difficulty}
        onDifficultyChange={difficulty =>
          onSettingsChange({ ...settings, difficulty })
        }
        onStart={onStart}
        online={online}
      />

      <OfflineBanner offline={!online} />

      <RulesSheet
        visible={sheet === 'rules'}
        onClose={() => setSheet('none')}
      />
      <SettingsSheet
        visible={sheet === 'settings'}
        settings={settings}
        onChange={onSettingsChange}
        onClose={() => setSheet('none')}
        onTestAnimations={() => {
          setSheet('none');
          onOpenLab();
        }}
      />
      <FairnessSheet
        visible={sheet === 'fair'}
        career={career}
        onClose={() => setSheet('none')}
      />
    </Backdrop>
  );
};

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 20 },
  header: { flexDirection: 'row', alignItems: 'center' },
  headerText: { marginLeft: 14 },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 3,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 12,
    letterSpacing: 1,
    marginTop: 2,
  },
  stage: { marginTop: 14, marginBottom: 4 },
  heroLogo: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    // sits a little high, clear of the die's spot on the floor
    paddingBottom: 36,
    opacity: 0.22,
  },
  resumeCard: { marginTop: 14, overflow: 'hidden' },
  resumeRow: { flexDirection: 'row', alignItems: 'center' },
  historyIconBox: { width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center', marginRight: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  resumeTextCol: { flex: 1 },
  resumeActionCol: { alignItems: 'flex-end', justifyContent: 'space-between', alignSelf: 'stretch', marginLeft: 10 },
  resumeTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  resumeMeta: { color: colors.textMuted, fontSize: 12, marginTop: 4, lineHeight: 17 },
  resumeButtonNew: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, overflow: 'hidden', paddingHorizontal: 16, paddingVertical: 8, marginTop: 10 },
  resumeButtonText: { color: colors.onAccent, fontWeight: '800', marginLeft: 6, fontSize: 13 },
  discard: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceStrong },
  discardText: { color: colors.textMuted, fontWeight: '800', fontSize: 12 },
  playButtonNew: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 28, overflow: 'hidden', paddingHorizontal: 24, paddingVertical: 14, marginTop: 22 },
  playButtonText: { color: '#fff', fontSize: 20, fontWeight: '900', letterSpacing: 0.5 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 20 },
  footerButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, marginHorizontal: 4, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: colors.border },
  footerLabel: { color: colors.textMuted, fontSize: 13, fontWeight: '700', marginLeft: 8 },
  version: {
    color: colors.textFaint,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 18,
  },
});
