import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, {
  Defs,
  LinearGradient,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import { colors } from '../theme/theme';
import { useSvgId } from './svgId';

/**
 * The app-wide background: a deep indigo gradient with two slow-drifting
 * light blooms and a vignette. Everything is transform/opacity driven so it
 * runs entirely on the native thread.
 */
const Bloom = ({
  color,
  size,
  style,
  delay,
  drift,
}: {
  color: string;
  size: number;
  style: object;
  delay: number;
  drift: number;
}) => {
  const t = useRef(new Animated.Value(0)).current;
  const gid = useSvgId('bloom');

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(t, {
          toValue: 1,
          duration: 9000,
          delay,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(t, {
          toValue: 0,
          duration: 9000,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [delay, t]);

  const translateY = t.interpolate({
    inputRange: [0, 1],
    outputRange: [-drift, drift],
  });
  const translateX = t.interpolate({
    inputRange: [0, 1],
    outputRange: [drift * 0.6, -drift * 0.6],
  });
  const scale = t.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: 'absolute', width: size, height: size },
        style,
        { transform: [{ translateX }, { translateY }, { scale }] },
      ]}
    >
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Defs>
          <RadialGradient id={gid} cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={color} stopOpacity={0.55} />
            <Stop offset="55%" stopColor={color} stopOpacity={0.16} />
            <Stop offset="100%" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="100" fill={`url(#${gid})`} />
      </Svg>
    </Animated.View>
  );
};

export const Backdrop = ({ children }: { children?: React.ReactNode }) => {
  const sky = useSvgId('sky');
  return (
    <View style={styles.root}>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <LinearGradient id={sky} x1="0" y1="0" x2="0.35" y2="1">
            <Stop offset="0%" stopColor="#0A1030" />
            <Stop offset="45%" stopColor={colors.bgMid} />
            <Stop offset="100%" stopColor={colors.bgDeep} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${sky})`} />
      </Svg>
      <Bloom
        color={colors.bgGlowA}
        size={520}
        style={{ top: -160, left: -140 }}
        delay={0}
        drift={26}
      />
      <Bloom
        color={colors.bgGlowB}
        size={460}
        style={{ bottom: -120, right: -130 }}
        delay={1200}
        drift={22}
      />
      <Bloom
        color="#6B2F86"
        size={380}
        style={{ top: '38%', right: -160 }}
        delay={2400}
        drift={18}
      />
      <View style={styles.content}>{children}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgDeep, overflow: 'hidden' },
  content: { flex: 1 },
});
