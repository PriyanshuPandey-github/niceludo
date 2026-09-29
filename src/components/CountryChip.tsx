import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { flagOf } from '../state/online';
import { colors, radius } from '../theme/theme';

/** A player's country: flag and code in a small pill. */
export const CountryChip = ({
  country,
  compact,
}: {
  country: string;
  /** flag only */
  compact?: boolean;
}) => (
  <View
    style={styles.chip}
    accessible
    accessibilityLabel={`Country ${country}`}
  >
    <Text style={styles.flag}>{flagOf(country)}</Text>
    {compact ? null : <Text style={styles.code}>{country}</Text>}
  </View>
);

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceStrong,
    borderWidth: 1,
    borderColor: colors.border,
  },
  flag: { fontSize: 11 },
  code: {
    color: colors.textMuted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
    marginLeft: 3,
  },
});
