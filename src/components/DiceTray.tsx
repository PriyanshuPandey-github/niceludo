import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ColorId } from '../engine/types';
import { PLAYER_COLORS, radius } from '../theme/theme';
import { Dice } from './Dice';

export interface DiceTrayProps {
  color: ColorId;
  /** width/height of the tray pad in pixels */
  size: number;
  face: number;
  active: boolean;
  rolling: boolean;
  /** true when tapping actually rolls (human player, waiting for input) */
  interactive: boolean;
  onPress: () => void;
}

/**
 * One dice pad, parked in the middle of a colour's home yard - exactly where
 * that player expects to look. The pad glows and breathes while it is that
 * colour's turn; the die tumbles in place for both humans and the CPU.
 */
export const DiceTray = ({
  color,
  size,
  face,
  active,
  rolling,
  interactive,
  onPress,
}: DiceTrayProps) => {
  const palette = PLAYER_COLORS[color];
  const pulse = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 780,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 780,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, pulse]);

  useEffect(() => {
    if (rolling) {
      spin.setValue(0);
      Animated.timing(spin, {
        toValue: 1,
        duration: 780,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else {
      // settle: a short squash-and-stretch when the value lands
      pop.setValue(0);
      Animated.spring(pop, {
        toValue: 1,
        friction: 4,
        tension: 120,
        useNativeDriver: true,
      }).start();
    }
  }, [rolling, spin, pop]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '1080deg'],
  });
  const lift = spin.interpolate({
    inputRange: [0, 0.45, 1],
    outputRange: [0, -size * 0.28, 0],
  });
  const settle = pop.interpolate({
    inputRange: [0, 0.6, 1],
    outputRange: [0.82, 1.08, 1],
  });
  const glowScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.92, 1.14],
  });
  const glowOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.28, 0.62],
  });

  const dieSize = size * 0.66;

  return (
    <Pressable
      onPress={interactive && !rolling ? onPress : undefined}
      disabled={!interactive || rolling}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={`${palette.label} dice, showing ${face}`}
      style={[styles.root, { width: size, height: size }]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.glow,
          {
            borderRadius: size / 2,
            backgroundColor: palette.glow,
            opacity: active ? glowOpacity : 0,
            transform: [{ scale: glowScale }],
          },
        ]}
      />
      <View
        style={[
          styles.pad,
          {
            width: size * 0.94,
            height: size * 0.94,
            borderRadius: radius.md,
            borderColor: active ? palette.light : 'rgba(255,255,255,0.35)',
            backgroundColor: active
              ? 'rgba(255,255,255,0.22)'
              : 'rgba(255,255,255,0.10)',
          },
        ]}
      />
      <Animated.View
        style={{
          transform: [
            { translateY: lift },
            { rotate },
            { scale: rolling ? 1 : settle },
          ],
        }}
      >
        <Dice face={face} size={dieSize} color={color} tumbling={rolling} />
      </Animated.View>
      {interactive && !rolling ? (
        <View style={styles.hint} pointerEvents="none">
          <Text style={styles.hintText}>TAP</Text>
        </View>
      ) : null}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  root: { alignItems: 'center', justifyContent: 'center' },
  glow: { position: 'absolute', width: '100%', height: '100%' },
  pad: { position: 'absolute', borderWidth: 1.5 },
  hint: {
    position: 'absolute',
    bottom: -2,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(6,10,26,0.72)',
  },
  hintText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
});
