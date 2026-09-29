import React, { useRef, useState } from 'react';
import {
  Animated,
  LayoutChangeEvent,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { colors, radius, shadow } from '../theme/theme';
import { useSvgId } from './svgId';

/**
 * An absolutely-positioned linear gradient used as a background fill.
 *
 * The parent is measured and the SVG drawn at explicit pixel sizes: on iOS,
 * react-native-svg resolves "100%" against the first layout pass and does not
 * redraw when the parent settles, leaving the fill short and offset.
 */
export const GradientFill = ({
  from,
  to,
  angle = 'diagonal',
}: {
  from: string;
  to: string;
  angle?: 'diagonal' | 'vertical' | 'horizontal';
}) => {
  const id = useSvgId('fill');
  const [size, setSize] = useState({ width: 0, height: 0 });
  const coords =
    angle === 'vertical'
      ? { x1: '0', y1: '0', x2: '0', y2: '1' }
      : angle === 'horizontal'
      ? { x1: '0', y1: '0', x2: '1', y2: '0' }
      : { x1: '0', y1: '0', x2: '1', y2: '1' };

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize(prev =>
      prev.width === width && prev.height === height ? prev : { width, height },
    );
  };

  return (
    <View
      style={StyleSheet.absoluteFill}
      onLayout={onLayout}
      pointerEvents="none"
    >
      {size.width > 0 && size.height > 0 ? (
        <Svg width={size.width} height={size.height}>
          <Defs>
            <LinearGradient id={id} {...coords}>
              <Stop offset="0%" stopColor={from} />
              <Stop offset="100%" stopColor={to} />
            </LinearGradient>
          </Defs>
          <Rect
            x="0"
            y="0"
            width={size.width}
            height={size.height}
            fill={`url(#${id})`}
          />
        </Svg>
      ) : null}
    </View>
  );
};

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  disabled?: boolean;
  subtitle?: string;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}

export const Button = ({
  label,
  onPress,
  variant = 'primary',
  disabled,
  subtitle,
  style,
  compact,
}: ButtonProps) => {
  const scale = useRef(new Animated.Value(1)).current;

  const press = (to: number) =>
    Animated.spring(scale, {
      toValue: to,
      friction: 7,
      tension: 180,
      useNativeDriver: true,
    }).start();

  const isPrimary = variant === 'primary';
  const isGhost = variant === 'ghost';

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <Pressable
        onPress={disabled ? undefined : onPress}
        onPressIn={() => !disabled && press(0.96)}
        onPressOut={() => press(1)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={[
          styles.button,
          compact && styles.buttonCompact,
          isPrimary ? shadow.card : shadow.soft,
          isGhost && styles.buttonGhost,
          !isPrimary && !isGhost && styles.buttonSecondary,
          disabled && styles.disabled,
        ]}
      >
        {isPrimary ? (
          <GradientFill from={colors.primary} to={colors.primaryDeep} />
        ) : null}
        <Text
          style={[
            styles.buttonLabel,
            compact && styles.buttonLabelCompact,
            isPrimary ? styles.buttonLabelOnPrimary : styles.buttonLabelLight,
          ]}
        >
          {label}
        </Text>
        {subtitle ? (
          <Text
            style={[
              styles.buttonSubtitle,
              isPrimary ? styles.subtitleOnPrimary : styles.subtitleLight,
            ]}
          >
            {subtitle}
          </Text>
        ) : null}
      </Pressable>
    </Animated.View>
  );
};

export const Card = ({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) => <View style={[styles.card, style]}>{children}</View>;

export const SectionTitle = ({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
}) => <Text style={[styles.sectionTitle, style]}>{children}</Text>;

export interface SegmentedProps<T extends string | number> {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  style,
}: SegmentedProps<T>) {
  return (
    <View style={[styles.segmented, style]}>
      {options.map(option => {
        const selected = option.value === value;
        return (
          <Pressable
            key={String(option.value)}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            style={[styles.segment, selected && styles.segmentSelected]}
          >
            <Text
              style={[
                styles.segmentLabel,
                selected && styles.segmentLabelSelected,
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export const Divider = () => <View style={styles.divider} />;

export const Pill = ({
  label,
  tone = 'default',
}: {
  label: string;
  tone?: 'default' | 'accent' | 'danger';
}) => (
  <View
    style={[
      styles.pill,
      tone === 'accent' && styles.pillAccent,
      tone === 'danger' && styles.pillDanger,
    ]}
  >
    <Text
      style={[
        styles.pillText,
        tone === 'accent' && styles.pillTextAccent,
        tone === 'danger' && styles.pillTextDanger,
      ]}
    >
      {label}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  button: {
    minHeight: 58,
    paddingHorizontal: 26,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  buttonCompact: {
    minHeight: 46,
    paddingHorizontal: 18,
    borderRadius: radius.md,
  },
  buttonSecondary: {
    backgroundColor: colors.surfaceStrong,
    borderWidth: 1,
    borderColor: colors.border,
  },
  buttonGhost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.border,
  },
  disabled: { opacity: 0.4 },
  buttonLabel: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  buttonLabelCompact: { fontSize: 15 },
  buttonLabelOnPrimary: { color: colors.onPrimary },
  buttonLabelLight: { color: colors.text },
  buttonSubtitle: { fontSize: 12, marginTop: 2, fontWeight: '600' },
  subtitleOnPrimary: { color: 'rgba(255,255,255,0.75)' },
  subtitleLight: { color: colors.textMuted },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: radius.pill,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segment: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: radius.pill,
    alignItems: 'center',
  },
  segmentSelected: {
    backgroundColor: colors.accent,
  },
  segmentLabel: {
    color: colors.textMuted,
    fontWeight: '700',
    fontSize: 14,
    letterSpacing: 0.4,
  },
  segmentLabelSelected: { color: colors.onAccent },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 14,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceStrong,
  },
  pillAccent: { backgroundColor: 'rgba(230,233,238,0.16)' },
  pillDanger: { backgroundColor: 'rgba(255,138,92,0.18)' },
  pillText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  pillTextAccent: { color: colors.accent },
  pillTextDanger: { color: colors.danger },
});
