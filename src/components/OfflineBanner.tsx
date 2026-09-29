import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, shadow } from '../theme/theme';
import { IconWifiOff } from './Icons';

/**
 * A pill that slides up from the bottom while the device is offline, and
 * away again once it is back. It never takes touches.
 */
export const OfflineBanner = ({ offline }: { offline: boolean }) => {
  const insets = useSafeAreaInsets();
  const shown = useRef(new Animated.Value(offline ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(shown, {
      toValue: offline ? 1 : 0,
      duration: offline ? 320 : 220,
      easing: offline ? Easing.out(Easing.back(1.4)) : Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [offline, shown]);

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={[
        styles.wrap,
        {
          bottom: insets.bottom + 14,
          opacity: shown,
          transform: [
            {
              translateY: shown.interpolate({
                inputRange: [0, 1],
                outputRange: [80, 0],
              }),
            },
          ],
        },
      ]}
    >
      {/* stays mounted so it can slide away; hidden from screen readers */}
      <View
        style={styles.pill}
        accessible={offline}
        accessibilityRole="alert"
        accessibilityElementsHidden={!offline}
        importantForAccessibility={offline ? 'yes' : 'no-hide-descendants'}
      >
        <IconWifiOff color={colors.danger} size={18} />
        <View style={styles.text}>
          <Text style={styles.title}>You're offline</Text>
          <Text style={styles.sub}>Online matches are unavailable</Text>
        </View>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSolid,
    borderWidth: 1,
    borderColor: 'rgba(255,138,92,0.45)',
    ...shadow.soft,
  },
  text: { marginLeft: 10 },
  title: { color: colors.text, fontSize: 14, fontWeight: '800' },
  sub: { color: colors.textMuted, fontSize: 11.5, marginTop: 1 },
});
