/**
 * Spider bursts, drawn over the board and driven by one Animated.Value
 * each (0 -> 1, native driver):
 *
 * - `impact`: a capture - a web splat pops where the attacker lands, with
 *   sparks in the attacker's colour.
 * - `home`: a piece reaching the centre - a large web blooms out, a silver
 *   shockwave ring expands, and silver and colour confetti bursts outward.
 */
import React, { memo, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { PieceColors, colors } from '../theme/theme';
import { webPath } from './web';

export type BurstKind = 'impact' | 'home';

export interface Burst {
  id: number;
  kind: BurstKind;
  /** centre, in board pixels */
  x: number;
  y: number;
  unit: number;
  palette: PieceColors;
  progress: Animated.Value;
}

const SPLAT = webPath(50, 50, 40, { spokes: 8, rings: 3, spokeReach: 1.15 });
const BLOOM = webPath(50, 50, 44, { spokes: 12, rings: 4, spokeReach: 1.1 });

/** How long each burst plays, in ms at normal speed. */
export const BURST_MS: Record<BurstKind, number> = { impact: 620, home: 1250 };

export const runBurst = (burst: Burst, speed: number) =>
  Animated.timing(burst.progress, {
    toValue: 1,
    duration: Math.round(BURST_MS[burst.kind] * speed),
    easing: Easing.linear,
    useNativeDriver: true,
  });

interface Spark {
  dx: number;
  dy: number;
  size: number;
  color: string;
  spin: number;
}

const planSparks = (burst: Burst): Spark[] => {
  const home = burst.kind === 'home';
  const count = home ? 16 : 10;
  const [near, far] = home ? [1.6, 2.7] : [0.8, 1.4];
  return Array.from({ length: count }, (_, i) => {
    const a = ((i + Math.random() * 0.6) / count) * Math.PI * 2;
    const d = (near + Math.random() * (far - near)) * burst.unit;
    return {
      dx: Math.cos(a) * d,
      dy: Math.sin(a) * d,
      size: burst.unit * (home ? 0.2 : 0.16) * (0.7 + Math.random() * 0.6),
      color:
        home && i % 2 === 0
          ? colors.accent
          : i % 3 === 0
          ? '#FFFFFF'
          : burst.palette.base,
      spin: (Math.random() < 0.5 ? -1 : 1) * (180 + Math.random() * 360),
    };
  });
};

const HeroBurstView = ({ burst }: { burst: Burst }) => {
  const [sparks] = useState(() => planSparks(burst));
  const { progress: p, unit, x, y } = burst;
  const home = burst.kind === 'home';
  const webSize = unit * (home ? 3.4 : 1.7);

  return (
    <View pointerEvents="none" style={[styles.anchor, { left: x, top: y }]}>
      {home ? (
        <Animated.View
          style={[
            styles.centred,
            {
              width: unit * 2,
              height: unit * 2,
              marginLeft: -unit,
              marginTop: -unit,
              borderRadius: unit,
              borderWidth: Math.max(2, unit * 0.12),
              borderColor: colors.accent,
              opacity: p.interpolate({
                inputRange: [0, 0.05, 0.55],
                outputRange: [0, 1, 0],
                extrapolate: 'clamp',
              }),
              transform: [
                {
                  scale: p.interpolate({
                    inputRange: [0, 0.55],
                    outputRange: [0.3, 2.3],
                    extrapolate: 'clamp',
                  }),
                },
              ],
            },
          ]}
        />
      ) : null}

      <Animated.View
        style={[
          styles.centred,
          {
            width: webSize,
            height: webSize,
            marginLeft: -webSize / 2,
            marginTop: -webSize / 2,
            opacity: p.interpolate(
              home
                ? {
                    inputRange: [0, 0.1, 0.65, 1],
                    outputRange: [0, 0.9, 0.9, 0],
                  }
                : {
                    inputRange: [0, 0.05, 0.5, 1],
                    outputRange: [0, 1, 0.9, 0],
                  },
            ),
            transform: [
              {
                scale: p.interpolate(
                  home
                    ? { inputRange: [0, 0.45, 1], outputRange: [0.1, 1, 1.06] }
                    : {
                        inputRange: [0, 0.3, 1],
                        outputRange: [0.3, 1.15, 1.3],
                      },
                ),
              },
              {
                rotate: p.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0deg', home ? '30deg' : '-20deg'],
                }),
              },
            ],
          },
        ]}
      >
        <Svg width={webSize} height={webSize} viewBox="0 0 100 100">
          <Path
            d={home ? BLOOM : SPLAT}
            fill="none"
            stroke={home ? '#FFF6D8' : '#F2F5FF'}
            strokeWidth={home ? 1.8 : 4}
            strokeLinecap="round"
          />
        </Svg>
      </Animated.View>

      {sparks.map((spark, i) => (
        <Animated.View
          key={i}
          style={[
            styles.centred,
            {
              width: spark.size,
              height: spark.size,
              marginLeft: -spark.size / 2,
              marginTop: -spark.size / 2,
              borderRadius: spark.size * 0.2,
              backgroundColor: spark.color,
              opacity: p.interpolate({
                inputRange: [0, 0.04, 0.6, 1],
                outputRange: [0, 1, 1, 0],
              }),
              transform: [
                {
                  translateX: p.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: [0, spark.dx * 0.85, spark.dx],
                  }),
                },
                {
                  // confetti drifts down a little as it slows
                  translateY: p.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: [
                      0,
                      spark.dy * 0.85,
                      spark.dy + (home ? unit * 0.6 : 0),
                    ],
                  }),
                },
                {
                  rotate: p.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['45deg', `${45 + spark.spin}deg`],
                  }),
                },
                {
                  scale: p.interpolate({
                    inputRange: [0, 0.1, 1],
                    outputRange: [0.4, 1, 0.5],
                  }),
                },
              ],
            },
          ]}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  anchor: { position: 'absolute', width: 0, height: 0, zIndex: 18 },
  centred: { position: 'absolute', left: 0, top: 0 },
});

/** Memoised: a burst's animated nodes must not be rebuilt mid-flight. */
export const HeroBurst = memo(HeroBurstView);
