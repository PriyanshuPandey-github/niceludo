import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Svg, { Defs, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { ColorId } from '../engine/types';
import { colors } from '../theme/theme';
import { Dice } from '../components/Dice';
import { Pawn } from '../components/Pawn';
import { Mood } from '../components/eyes';
import { useSvgId } from '../components/svgId';
import { webPath } from '../components/web';
import {
  BADGE_H,
  BADGE_W,
  LogoBadge,
  LogoWord,
} from '../components/SpiderLogo';

/**
 * The animated launch screen: the app icon's scene - web, silver badge, three
 * Spider pieces and a die - built from the real in-app pieces and brought in
 * one element at a time.
 *
 * The native launch screens (LaunchScreen.storyboard, the Android window
 * background and the Android 12+ system splash) show only this backdrop
 * colour, which is also this screen's first frame, so the hand-off is
 * invisible and everything visible is animated here.
 */
export const SPLASH_BACKDROP = '#2E080B';

/** Back to front, as on the icon. */
const PIECES = [ColorId.Green, ColorId.Yellow, ColorId.Red];
/** Faces the die shows while it tumbles in; it lands on a six. */
const TUMBLE = [3, 5, 2, 4, 1, 6];

/** Start of each beat, in ms from mount. */
const AT = {
  web: 0,
  badge: 250,
  ludo: 700,
  pieces: 850,
  die: 950,
  tagline: 1600,
  exit: 2350,
};
const ROLL_MS = 760;
const EXIT_MS = 280;

const GLINT_PATH =
  'M10,0 L12.4,7.6 L20,10 L12.4,12.4 L10,20 L7.6,12.4 L0,10 L7.6,7.6 Z';

/** Soft red bloom behind the badge. */
const Glow = ({ width, height }: { width: number; height: number }) => {
  const id = useSvgId('splash-glow');
  return (
    <Svg width={width} height={height}>
      <Defs>
        <RadialGradient id={id} cx="50%" cy="44%" r="62%">
          <Stop offset="0%" stopColor="#A3232C" stopOpacity={0.9} />
          <Stop offset="55%" stopColor="#6B1218" stopOpacity={0.45} />
          <Stop offset="100%" stopColor={SPLASH_BACKDROP} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width={width} height={height} fill={`url(#${id})`} />
    </Svg>
  );
};

export const SplashScreen = ({ onDone }: { onDone: () => void }) => {
  const { width, height } = useWindowDimensions();
  const badgeW = Math.min(width * 0.8, 360);
  const badgeH = (badgeW * BADGE_H) / BADGE_W;
  const pawn = badgeW * 0.3;
  const die = pawn * 1.15;
  const webSize = Math.max(width, height) * 1.25;

  const web = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const badge = useRef(new Animated.Value(0)).current;
  const ludo = useRef(new Animated.Value(0)).current;
  const pieces = useRef(PIECES.map(() => new Animated.Value(0))).current;
  const roll = useRef(new Animated.Value(0)).current;
  const tagline = useRef(new Animated.Value(0)).current;
  const glint = useRef(new Animated.Value(0)).current;
  const shimmer = useRef(new Animated.Value(0)).current;
  const exit = useRef(new Animated.Value(0)).current;
  const [face, setFace] = useState(TUMBLE[0]);
  const [mood, setMood] = useState<Mood>('idle');

  // App re-renders (and hands over a fresh callback) while settings load;
  // that must not restart the timeline.
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    const at = (ms: number, animation: Animated.CompositeAnimation) =>
      Animated.sequence([Animated.delay(ms), animation]);
    const to = (
      value: Animated.Value,
      toValue: number,
      duration: number,
      easing = Easing.out(Easing.cubic),
    ) =>
      Animated.timing(value, {
        toValue,
        duration,
        easing,
        useNativeDriver: true,
      });
    const spring = (value: Animated.Value) =>
      Animated.spring(value, {
        toValue: 1,
        friction: 6,
        tension: 70,
        useNativeDriver: true,
      });

    const intro = Animated.parallel([
      at(AT.web, to(web, 1, 900)),
      at(AT.badge, spring(badge)),
      at(AT.ludo, to(ludo, 1, 380, Easing.out(Easing.back(1.6)))),
      ...pieces.map((value, i) => at(AT.pieces + i * 120, spring(value))),
      at(AT.die, to(roll, 1, ROLL_MS)),
      at(AT.tagline, to(tagline, 1, 420)),
      at(
        AT.tagline + 100,
        Animated.sequence([
          to(glint, 1, 260),
          to(glint, 0, 360, Easing.in(Easing.quad)),
        ]),
      ),
      at(AT.exit, to(exit, 1, EXIT_MS, Easing.inOut(Easing.quad))),
    ]);
    intro.start(({ finished }) => {
      if (finished) {
        done.current();
      }
    });

    const loops = [
      Animated.loop(to(spin, 1, 24000, Easing.linear)),
      Animated.loop(to(shimmer, 1, 1400, Easing.inOut(Easing.quad))),
    ];
    loops.forEach(loop => loop.start());

    // the die shows a new face every few frames of its tumble
    const timers = TUMBLE.map((value, i) =>
      setTimeout(() => setFace(value), AT.die + (i * ROLL_MS) / TUMBLE.length),
    );
    // and the pieces cheer the six
    timers.push(setTimeout(() => setMood('happy'), AT.die + ROLL_MS));

    return () => {
      intro.stop();
      loops.forEach(loop => loop.stop());
      timers.forEach(clearTimeout);
    };
  }, [badge, exit, glint, ludo, pieces, roll, shimmer, spin, tagline, web]);

  const fadeIn = (value: Animated.Value, until = 0.4) =>
    value.interpolate({
      inputRange: [0, until],
      outputRange: [0, 1],
      extrapolate: 'clamp',
    });

  return (
    <View style={styles.root} accessible accessibilityLabel="Spider Ludo">
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { opacity: web }]}
      >
        <Glow width={width} height={height} />
      </Animated.View>

      <Animated.View
        pointerEvents="none"
        style={[
          styles.web,
          {
            width: webSize,
            height: webSize,
            left: (width - webSize) / 2,
            top: height * 0.4 - webSize / 2,
            opacity: web,
            transform: [
              {
                scale: web.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.35, 1],
                }),
              },
              {
                rotate: spin.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0deg', '360deg'],
                }),
              },
            ],
          },
        ]}
      >
        <Svg width={webSize} height={webSize}>
          <Path
            d={webPath(webSize / 2, webSize / 2, webSize * 0.42, {
              spokes: 16,
              rings: 6,
              spokeReach: 1.25,
            })}
            stroke="#FF6B6B"
            strokeOpacity={0.18}
            strokeWidth={1.4}
            fill="none"
          />
        </Svg>
      </Animated.View>

      <Animated.View
        style={{
          width: badgeW,
          height: badgeH,
          opacity: fadeIn(badge),
          transform: [
            {
              translateY: badge.interpolate({
                inputRange: [0, 1],
                outputRange: [-height * 0.18, 0],
              }),
            },
            {
              scale: badge.interpolate({
                inputRange: [0, 1],
                outputRange: [1.35, 1],
              }),
            },
          ],
        }}
      >
        <LogoBadge width={badgeW} />
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              opacity: fadeIn(ludo, 0.6),
              transform: [
                {
                  translateX: ludo.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-36, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <LogoWord width={badgeW} />
        </Animated.View>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.glint,
            {
              width: badgeW * 0.12,
              height: badgeW * 0.12,
              left: badgeW * 0.82,
              top: badgeH * 0.04,
              opacity: glint,
              transform: [
                { scale: glint },
                {
                  rotate: glint.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['-45deg', '0deg'],
                  }),
                },
              ],
            },
          ]}
        >
          <Svg width="100%" height="100%" viewBox="0 0 20 20">
            <Path d={GLINT_PATH} fill="#FFFFFF" />
          </Svg>
        </Animated.View>
      </Animated.View>

      <View style={{ width: badgeW, height: pawn * 1.45, marginTop: 18 }}>
        {PIECES.map((color, i) => (
          <Animated.View
            key={color}
            style={[
              styles.piece,
              {
                left: i * pawn * 0.58,
                top: i * pawn * 0.2,
                opacity: fadeIn(pieces[i]),
                transform: [
                  {
                    translateY: pieces[i].interpolate({
                      inputRange: [0, 1],
                      outputRange: [pawn * 1.4, 0],
                    }),
                  },
                  {
                    scale: pieces[i].interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.5, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            <Pawn
              color={color}
              height={pawn}
              theme="spider"
              animated
              mood={mood}
            />
          </Animated.View>
        ))}
        <Animated.View
          style={[
            styles.die,
            {
              top: pawn * 0.12,
              opacity: fadeIn(roll, 0.15),
              transform: [
                {
                  translateX: roll.interpolate({
                    inputRange: [0, 1],
                    outputRange: [width * 0.6, 0],
                  }),
                },
                {
                  translateY: roll.interpolate({
                    inputRange: [0, 0.5, 0.75, 1],
                    outputRange: [-pawn * 0.8, 0, -pawn * 0.18, 0],
                  }),
                },
                {
                  rotate: roll.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['-540deg', '0deg'],
                  }),
                },
              ],
            },
          ]}
        >
          <Dice face={face} size={die} color={ColorId.Red} />
        </Animated.View>
      </View>

      <Animated.View
        style={{
          alignItems: 'center',
          opacity: tagline,
          transform: [
            {
              translateY: tagline.interpolate({
                inputRange: [0, 1],
                outputRange: [10, 0],
              }),
            },
          ],
        }}
      >
        <Text style={styles.tagline}>Luck plays no favourites.</Text>
        <View style={styles.trackRow}>
          <View style={styles.track} />
          <Animated.View
            style={[
              styles.spark,
              {
                transform: [
                  {
                    translateX: shimmer.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-26, 26],
                    }),
                  },
                ],
              },
            ]}
          />
        </View>
      </Animated.View>

      {/* fades the scene out onto the home screen's backdrop */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.exit, { opacity: exit }]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SPLASH_BACKDROP,
    overflow: 'hidden',
  },
  web: { position: 'absolute' },
  glint: { position: 'absolute' },
  piece: { position: 'absolute' },
  die: { position: 'absolute', right: 0 },
  tagline: {
    color: 'rgba(255,235,235,0.72)',
    fontSize: 13,
    letterSpacing: 1.6,
    marginTop: 30,
    textAlign: 'center',
  },
  trackRow: { marginTop: 22, width: 90, alignItems: 'center' },
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
    backgroundColor: '#F1C9C9',
  },
  exit: { backgroundColor: colors.bgMid },
});
