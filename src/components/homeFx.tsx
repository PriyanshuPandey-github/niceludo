/**
 * Ambient spider touches for the home screen: webs that unfurl from the two
 * top corners and sway (the pieces' skits live in `pieceShow.tsx`).
 *
 * Everything is transform/opacity driven on the native thread, and all motion
 * stops when the system "reduce motion" setting is on.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { webPath } from './web';

export const useReduceMotion = () => {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(value => live && setReduce(value))
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduce,
    );
    return () => {
      live = false;
      subscription?.remove();
    };
  }, []);
  return reduce;
};

const ease = Easing.inOut(Easing.sin);

// ------------------------------------------------------------ corner webs
const CornerWeb = ({
  side,
  radius,
  delay,
  reduce,
}: {
  side: 'left' | 'right';
  radius: number;
  delay: number;
  reduce: boolean;
}) => {
  const grow = useRef(new Animated.Value(0)).current;
  const sway = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduce) {
      grow.setValue(1);
      return;
    }
    const intro = Animated.timing(grow, {
      toValue: 1,
      duration: 900,
      delay,
      easing: Easing.out(Easing.back(1.2)),
      useNativeDriver: true,
    });
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(sway, {
          toValue: 1,
          duration: 3200,
          easing: ease,
          useNativeDriver: true,
        }),
        Animated.timing(sway, {
          toValue: 0,
          duration: 3200,
          easing: ease,
          useNativeDriver: true,
        }),
      ]),
    );
    intro.start();
    loop.start();
    return () => {
      intro.stop();
      loop.stop();
    };
  }, [delay, grow, reduce, sway]);

  // The view is centred on the screen corner, so it scales and sways about it.
  const size = radius * 2;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.corner,
        side === 'left' ? { left: -radius } : { right: -radius },
        {
          top: -radius,
          width: size,
          height: size,
          opacity: grow.interpolate({
            inputRange: [0, 0.3],
            outputRange: [0, 1],
            extrapolate: 'clamp',
          }),
          transform: [
            { scale: grow },
            {
              rotate: sway.interpolate({
                inputRange: [0, 1],
                outputRange: ['0deg', side === 'left' ? '4deg' : '-4deg'],
              }),
            },
          ],
        },
      ]}
    >
      <Svg width={size} height={size}>
        <Path
          d={webPath(radius, radius, radius * 0.8, {
            spokes: 12,
            rings: 5,
            spokeReach: 1.25,
          })}
          stroke="#FFE3E3"
          strokeOpacity={0.2}
          strokeWidth={1.2}
          fill="none"
        />
      </Svg>
    </Animated.View>
  );
};

/** Webs in both top corners; render behind the screen's content. */
export const CornerWebs = () => {
  const reduce = useReduceMotion();
  const { width } = useWindowDimensions();
  const radius = Math.min(width * 0.42, 190);
  return (
    <>
      <CornerWeb side="left" radius={radius} delay={150} reduce={reduce} />
      <CornerWeb side="right" radius={radius} delay={350} reduce={reduce} />
    </>
  );
};

const styles = StyleSheet.create({
  corner: { position: 'absolute' },
});
