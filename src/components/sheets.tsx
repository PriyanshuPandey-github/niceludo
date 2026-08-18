import React from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { DiceStats, Difficulty } from '../engine/types';
import { chiSquare } from '../engine/rng';
import { Career, Settings } from '../state/storage';
import { colors, radius } from '../theme/theme';
import { Divider, SectionTitle, Segmented } from './ui';
import { Sheet } from './Sheet';

const Row = ({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) => (
  <View style={styles.row}>
    <View style={styles.rowText}>
      <Text style={styles.rowLabel}>{label}</Text>
      {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
    </View>
    {children}
  </View>
);

export const SettingsSheet = ({
  visible,
  settings,
  onChange,
  onClose,
}: {
  visible: boolean;
  settings: Settings;
  onChange: (next: Settings) => void;
  onClose: () => void;
}) => (
  <Sheet visible={visible} title="Settings" onClose={onClose}>
    <SectionTitle>CPU skill</SectionTitle>
    <Segmented<Difficulty>
      options={[
        { value: 'easy', label: 'Easy' },
        { value: 'normal', label: 'Normal' },
        { value: 'hard', label: 'Hard' },
      ]}
      value={settings.difficulty}
      onChange={difficulty => onChange({ ...settings, difficulty })}
    />
    <Text style={styles.note}>
      Skill changes how well the CPU picks a move. It never changes the dice -
      every player rolls from the same stream.
    </Text>
    <Divider />
    <Row label="Vibration" hint="Short buzz on rolls and captures">
      <Switch
        value={settings.vibrate}
        onValueChange={vibrate => onChange({ ...settings, vibrate })}
        thumbColor={settings.vibrate ? colors.gold : '#8892BE'}
        trackColor={{
          true: 'rgba(246,207,106,0.4)',
          false: 'rgba(255,255,255,0.2)',
        }}
      />
    </Row>
    <Row label="Fast animations" hint="Speeds up pawn and dice motion">
      <Switch
        value={settings.fastAnimations}
        onValueChange={fastAnimations =>
          onChange({ ...settings, fastAnimations })
        }
        thumbColor={settings.fastAnimations ? colors.gold : '#8892BE'}
        trackColor={{
          true: 'rgba(246,207,106,0.4)',
          false: 'rgba(255,255,255,0.2)',
        }}
      />
    </Row>
    <Row
      label="Auto-move"
      hint="Play the move automatically when only one is legal"
    >
      <Switch
        value={settings.autoMoveSingle}
        onValueChange={autoMoveSingle =>
          onChange({ ...settings, autoMoveSingle })
        }
        thumbColor={settings.autoMoveSingle ? colors.gold : '#8892BE'}
        trackColor={{
          true: 'rgba(246,207,106,0.4)',
          false: 'rgba(255,255,255,0.2)',
        }}
      />
    </Row>
    <Row
      label="Hints"
      hint="Ring the pawns you can move, flag the ones in danger"
    >
      <Switch
        value={settings.showHints}
        onValueChange={showHints => onChange({ ...settings, showHints })}
        thumbColor={settings.showHints ? colors.gold : '#8892BE'}
        trackColor={{
          true: 'rgba(246,207,106,0.4)',
          false: 'rgba(255,255,255,0.2)',
        }}
      />
    </Row>
  </Sheet>
);

export const RulesSheet = ({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) => (
  <Sheet visible={visible} title="How to play" onClose={onClose}>
    {[
      [
        'Get out of the yard',
        'Roll a 6 to move a pawn onto your coloured start cell.',
      ],
      [
        'Go around',
        'Pawns travel clockwise around the ring, then up their own coloured home run.',
      ],
      [
        'Roll a 6, roll again',
        'Sixes earn an extra roll - but three sixes in a row burns the turn.',
      ],
      [
        'Capture',
        'Land on an opponent and they go back to their yard. You get another roll.',
      ],
      [
        'Safe cells',
        'The coloured start cells and the four star cells cannot be captured on.',
      ],
      ['Stacking', 'Your own pawns can share a cell. They never block anyone.'],
      [
        'Exact count home',
        'You need the precise number to park in the centre. A pawn that would overshoot cannot move.',
      ],
      [
        'Winning',
        'Get all four pawns home. In 3 and 4 player games everyone keeps playing for the remaining places.',
      ],
    ].map(([title, body]) => (
      <View key={title} style={styles.ruleRow}>
        <View style={styles.bullet} />
        <View style={styles.ruleText}>
          <Text style={styles.ruleTitle}>{title}</Text>
          <Text style={styles.ruleBody}>{body}</Text>
        </View>
      </View>
    ))}
  </Sheet>
);

const Bar = ({
  face,
  count,
  total,
}: {
  face: number;
  count: number;
  total: number;
}) => {
  const share = total > 0 ? count / total : 0;
  const expected = 1 / 6;
  const width = Math.min(1, share / (expected * 2));
  return (
    <View style={styles.barRow}>
      <Text style={styles.barFace}>{face}</Text>
      <View style={styles.barTrack}>
        <View
          style={[styles.barFill, { width: `${Math.max(2, width * 100)}%` }]}
        />
        <View style={styles.barTarget} />
      </View>
      <Text style={styles.barValue}>
        {total > 0 ? `${(share * 100).toFixed(1)}%` : '-'}
      </Text>
    </View>
  );
};

export const FairnessSheet = ({
  visible,
  onClose,
  career,
  stats,
  playerNames,
}: {
  visible: boolean;
  onClose: () => void;
  career: Career;
  stats?: DiceStats;
  playerNames?: string[];
}) => {
  const lifetimeTotal = career.faces.reduce((sum, count) => sum + count, 0);
  return (
    <Sheet visible={visible} title="Fair dice" onClose={onClose}>
      <Text style={styles.note}>
        Every roll in this app comes from one shared generator (sfc32, seeded
        per game). The generator cannot see the board, so it cannot favour a
        player who is behind or throttle one who is ahead. Rolls are drawn with
        rejection sampling, so all six faces are exactly equally likely - no
        modulo bias, no "retention" nudges. Here are the real numbers.
      </Text>
      <Divider />
      <SectionTitle>All rolls on this device ({lifetimeTotal})</SectionTitle>
      {[1, 2, 3, 4, 5, 6].map(face => (
        <Bar
          key={face}
          face={face}
          count={career.faces[face - 1]}
          total={lifetimeTotal}
        />
      ))}
      {stats
        ? stats.faces.map((row, index) => {
            const total = row.reduce((sum, count) => sum + count, 0);
            return (
              <View key={index} style={styles.statBlock}>
                <SectionTitle>
                  {`${
                    playerNames?.[index] ?? `Seat ${index + 1}`
                  } - this game (${total})`}
                </SectionTitle>
                {[1, 2, 3, 4, 5, 6].map(face => (
                  <Bar
                    key={face}
                    face={face}
                    count={row[face - 1]}
                    total={total}
                  />
                ))}
                <Text style={styles.chi}>
                  {`chi-square ${chiSquare(stats, index).toFixed(
                    2,
                  )} (5 dof - under 11.07 is a normal, fair spread)`}
                </Text>
              </View>
            );
          })
        : null}
    </Sheet>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  rowText: { flex: 1, paddingRight: 14 },
  rowLabel: { color: colors.text, fontSize: 16, fontWeight: '700' },
  rowHint: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  note: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 10,
  },
  ruleRow: { flexDirection: 'row', marginBottom: 14 },
  bullet: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.gold,
    marginTop: 6,
    marginRight: 12,
  },
  ruleText: { flex: 1 },
  ruleTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  ruleBody: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 2,
  },
  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  barFace: {
    width: 18,
    color: colors.textMuted,
    fontWeight: '800',
    fontSize: 13,
  },
  barTrack: {
    flex: 1,
    height: 12,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
    justifyContent: 'center',
  },
  barFill: {
    height: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.gold,
  },
  barTarget: {
    position: 'absolute',
    left: '50%',
    width: 2,
    height: 12,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  barValue: {
    width: 52,
    textAlign: 'right',
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  statBlock: { marginTop: 18 },
  chi: { color: colors.textFaint, fontSize: 11, marginTop: 4 },
});
