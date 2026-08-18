import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { Backdrop } from '../components/Backdrop';
import { Logo } from '../components/Logo';
import { colors } from '../theme/theme';

/**
 * In-app splash. The Android window background (see `launch_screen.xml`)
 * shows the same mark, so the hand-off from the system splash to this screen
 * is seamless - no white flash.
 */
export const SplashScreen = ({ onDone }: { onDone: () => void }) => {
  const enter = useRef(new Animated.Value(0)).current;
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.spring(enter, {
        toValue: 1,
        friction: 6,
        tension: 60,
        useNativeDriver: true,
      }),
      Animated.delay(520),
    ]).start(({ finished }) => {
      if (finished) {
        onDone();
      }
    });

    const loop = Animated.loop(
      Animated.timing(shimmer, {
        toValue: 1,
        duration: 1400,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [enter, onDone, shimmer]);

  const scale = enter.interpolate({
    inputRange: [0, 1],
    outputRange: [0.62, 1],
  });
  const rotate = enter.interpolate({
    inputRange: [0, 1],
    outputRange: ['-18deg', '0deg'],
  });
  const dotShift = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [-26, 26],
  });

  return (
    <Backdrop>
      <View style={styles.root}>
        <Animated.View
          style={{ opacity: enter, transform: [{ scale }, { rotate }] }}
        >
          <Logo size={148} />
        </Animated.View>
        <Animated.View style={{ opacity: enter }}>
          <Text style={styles.title}>NICE LUDO</Text>
          <Text style={styles.tagline}>Fair dice. No tricks. No internet.</Text>
        </Animated.View>
        <View style={styles.trackRow}>
          <View style={styles.track} />
          <Animated.View
            style={[styles.spark, { transform: [{ translateX: dotShift }] }]}
          />
        </View>
      </View>
    </Backdrop>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: {
    color: colors.text,
    fontSize: 38,
    fontWeight: '900',
    letterSpacing: 6,
    marginTop: 26,
    textAlign: 'center',
  },
  tagline: {
    color: colors.textMuted,
    fontSize: 13,
    letterSpacing: 1.6,
    marginTop: 8,
    textAlign: 'center',
  },
  trackRow: { marginTop: 46, width: 90, alignItems: 'center' },
  track: {
    width: 90,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  spark: {
    position: 'absolute',
    top: 0,
    width: 38,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.gold,
  },
});
