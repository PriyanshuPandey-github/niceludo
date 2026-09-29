import React, { useEffect, useRef, useState } from 'react';
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
import { DIE_GEOMETRY, Dice } from './Dice';
import { rollEasing, rollImpacts } from './diceRoll';
import { sfx } from '../audio/sfx';

export interface DiceTrayProps {
  color: ColorId;
  /** width/height of the tray in pixels */
  size: number;
  face: number;
  active: boolean;
  rolling: boolean;
  /** true when tapping actually rolls (human player, waiting for input) */
  interactive: boolean;
  /** player name displayed on the dice box */
  playerName: string;
  onPress: () => void;
  /** length of a roll in ms; the tumble fills it exactly */
  rollMs?: number;
  /** called when the tumble has actually finished on screen */
  onTumbleEnd?: () => void;
}

/**
 * Ludo King style dice box — a coloured square panel that sits at a board
 * corner. Shows the dice prominently on a player-coloured background with
 * the player's name underneath.
 */
export const DiceTray = ({
  color,
  size,
  face,
  active,
  rolling,
  interactive,
  playerName,
  onPress,
  rollMs = 760,
  onTumbleEnd,
}: DiceTrayProps) => {
  const palette = PLAYER_COLORS[color];
  const pulse = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(0)).current;
  /** the face shown while tumbling; `face` is the result it lands on */
  const [tumbleFace, setTumbleFace] = useState(face);
  const faceRef = useRef(face);
  faceRef.current = face;
  const onEndRef = useRef(onTumbleEnd);
  onEndRef.current = onTumbleEnd;

  /* ── Breathing pulse when active ── */
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

  /* ── Tumble / settle on roll ── */
  useEffect(() => {
    if (rolling) {
      // Everything a roll is made of starts here, together, once the tray
      // has actually rendered: the spin, the rattle and the face flips all
      // share one clock, so a slow render can't pull them apart.
      spin.setValue(0);
      const impacts = rollImpacts(rollMs);
      let shown = faceRef.current;
      const flips = impacts.map((at, i) =>
        setTimeout(() => {
          if (i === impacts.length - 1) {
            // the last tip lands on the result, so the settle doesn't jump
            setTumbleFace(faceRef.current);
            return;
          }
          let next = 1 + Math.floor(Math.random() * 6);
          if (next === shown) {
            next = (next % 6) + 1;
          }
          shown = next;
          setTumbleFace(next);
        }, at),
      );
      sfx.roll(rollMs);
      Animated.timing(spin, {
        toValue: 1,
        duration: rollMs,
        easing: rollEasing,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          onEndRef.current?.();
        }
      });
      return () => flips.forEach(clearTimeout);
    } else {
      pop.setValue(0);
      Animated.spring(pop, {
        toValue: 1,
        friction: 4,
        tension: 120,
        useNativeDriver: true,
      }).start();
    }
  }, [rolling, spin, pop, rollMs]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '1080deg'],
  });
  const lift = spin.interpolate({
    inputRange: [0, 0.45, 1],
    // small hop: the die fills most of the tray, which clips its contents
    outputRange: [0, -size * 0.04, 0],
  });
  const settle = pop.interpolate({
    inputRange: [0, 0.6, 1],
    outputRange: [0.82, 1.08, 1],
  });
  const boxScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.04],
  });

  // The visible die is 80% of the tray; its drawing adds padding around it.
  const dieSize = size * 0.8 * (DIE_GEOMETRY.VB / 100);
  const cornerRad = size * 0.16;
  const nameFontSize = Math.max(8, Math.round(size * 0.1));

  return (
    <Pressable
      onPress={interactive && !rolling ? onPress : undefined}
      disabled={!interactive || rolling}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={
        rolling
          ? `${palette.label} dice, rolling`
          : `${palette.label} dice, showing ${face}`
      }
      style={[styles.root, { width: size, height: size }]}
    >
      {/* ── Main coloured box ── */}
      <Animated.View
        style={[
          styles.box,
          {
            borderRadius: cornerRad,
            backgroundColor: palette.base,
            borderWidth: active ? 2.5 : 1.5,
            borderColor: active ? palette.light : palette.dark,
            transform: active ? [{ scale: boxScale }] : [],
          },
        ]}
      >
        {/* Glossy top highlight */}
        <View style={[styles.gloss, { height: size * 0.28 }]} />

        {/* Soft halo behind the die */}
        <View
          pointerEvents="none"
          style={[
            styles.diceHalo,
            {
              width: dieSize,
              height: dieSize,
              borderRadius: dieSize / 2,
              opacity: active ? 0.2 : 0.1,
            },
          ]}
        />

        {/* Die */}
        <Animated.View
          style={{
            transform: [
              { translateY: lift },
              { rotate },
              { scale: rolling ? 1 : settle },
            ],
          }}
        >
          <Dice
            face={rolling ? tumbleFace : face}
            size={dieSize}
            color={color}
            tumbling={rolling}
          />
        </Animated.View>

        {/* TAP hint when interactive, player name otherwise - a pill over
            the die's bottom edge, below its lowest row of pips */}
        <View style={styles.labelWrap}>
          {interactive && !rolling ? (
            <View style={styles.tapBadge}>
              <Text
                style={[
                  styles.tapText,
                  { fontSize: Math.max(7, Math.round(size * 0.1)) },
                ]}
              >
                TAP
              </Text>
            </View>
          ) : (
            <View style={styles.namePill}>
              <Text
                style={[styles.nameText, { fontSize: nameFontSize }]}
                numberOfLines={1}
              >
                {playerName}
              </Text>
            </View>
          )}
        </View>
      </Animated.View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  box: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  gloss: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  diceHalo: {
    position: 'absolute',
    backgroundColor: '#FFFFFF',
  },
  labelWrap: {
    position: 'absolute',
    left: '5%',
    right: '5%',
    bottom: 3,
    alignItems: 'center',
  },
  namePill: {
    maxWidth: '100%',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  tapBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  tapText: {
    color: '#FFFFFF',
    fontWeight: '800',
    letterSpacing: 1,
  },
  nameText: {
    color: '#FFFFFF',
    fontWeight: '800',
    letterSpacing: 0.5,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
