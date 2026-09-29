import React from 'react';
import { Image, StyleSheet } from 'react-native';

/**
 * The app icon, as the app itself shows it. `src/assets/app-icon.png` is cut
 * from the same artwork as the launcher icons by `scripts/gen-assets.js`, so
 * the brand is identical everywhere.
 */
export const AppIcon = ({ size }: { size: number }) => (
  <Image
    source={require('../assets/app-icon.png')}
    style={[
      styles.icon,
      // the iOS home-screen corner radius, roughly
      { width: size, height: size, borderRadius: size * 0.2237 },
    ]}
    accessibilityIgnoresInvertColors
  />
);

const styles = StyleSheet.create({
  icon: { overflow: 'hidden' },
});
