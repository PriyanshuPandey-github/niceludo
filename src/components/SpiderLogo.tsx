/**
 * The Spider Ludo logo: a notched silver shield with "SPIDER" across it and
 * "LUDO" beneath, like the app icon's. The badge and the word are separate
 * layers the same size, so the splash can animate them apart; `SpiderLogo`
 * is the two together.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, {
  Defs,
  LinearGradient,
  Path,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import { useSvgId } from './svgId';

export const BADGE_W = 300;
export const BADGE_H = 180;
/** A shield with a notched top, like the icon's. */
const BADGE_PATH =
  'M16,30 L96,30 L110,12 L190,12 L204,30 L284,30 L284,112 L232,130 ' +
  'L214,168 L86,168 L68,130 L16,112 Z';

/** Shield plate, silver rim and "SPIDER"; "LUDO" is a separate layer. */
export const LogoBadge = ({ width }: { width: number }) => {
  const id = useSvgId('badge');
  return (
    <Svg
      width={width}
      height={(width * BADGE_H) / BADGE_W}
      viewBox={`0 0 ${BADGE_W} ${BADGE_H}`}
    >
      <Defs>
        <LinearGradient id={`${id}-plate`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor="#8A1A22" />
          <Stop offset="100%" stopColor="#3A070C" />
        </LinearGradient>
        <LinearGradient id={`${id}-silver`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor="#FFFFFF" />
          <Stop offset="48%" stopColor="#D5D9E0" />
          <Stop offset="54%" stopColor="#9EA3AE" />
          <Stop offset="100%" stopColor="#EEF0F4" />
        </LinearGradient>
      </Defs>
      <Path
        d={BADGE_PATH}
        fill={`url(#${id}-plate)`}
        stroke="#1A0204"
        strokeWidth={14}
        strokeLinejoin="round"
      />
      <Path
        d={BADGE_PATH}
        fill="none"
        stroke={`url(#${id}-silver)`}
        strokeWidth={7}
        strokeLinejoin="round"
      />
      <SvgText
        x={150}
        y={105}
        fontSize={56}
        fontWeight="900"
        textAnchor="middle"
        fill="#140203"
        fillOpacity={0.55}
      >
        SPIDER
      </SvgText>
      <SvgText
        x={150}
        y={101}
        fontSize={56}
        fontWeight="900"
        textAnchor="middle"
        fill={`url(#${id}-silver)`}
        stroke="#2A0508"
        strokeWidth={1.2}
      >
        SPIDER
      </SvgText>
    </Svg>
  );
};

/** The "LUDO" wordmark, drawn to overlay `LogoBadge` exactly. */
export const LogoWord = ({ width }: { width: number }) => (
  <Svg
    width={width}
    height={(width * BADGE_H) / BADGE_W}
    viewBox={`0 0 ${BADGE_W} ${BADGE_H}`}
  >
    <SvgText
      x={150}
      y={156}
      fontSize={40}
      fontStyle="italic"
      fontWeight="800"
      letterSpacing={2}
      textAnchor="middle"
      fill="#F4F5F8"
      stroke="#2A0508"
      strokeWidth={1}
    >
      LUDO
    </SvgText>
  </Svg>
);

/** The whole logo, `width` wide. */
export const SpiderLogo = ({ width }: { width: number }) => (
  <View style={{ width, height: (width * BADGE_H) / BADGE_W }}>
    <LogoBadge width={width} />
    <View style={StyleSheet.absoluteFill}>
      <LogoWord width={width} />
    </View>
  </View>
);
