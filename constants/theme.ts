/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform, StatusBar, Dimensions } from 'react-native';

const tintColorLight = '#F7931A';
const tintColorDark = '#F7931A';

export const Palette = {
  ink: '#101828',
  slate: '#667085',
  muted: '#98A2B3',
  line: '#EAECF0',
  canvas: '#F8FAFC',
  surface: '#FFFFFF',
  accent: '#F7931A',
  accentDark: '#D97706',
  accentSoft: '#FFF3E0',
  success: '#12B76A',
  danger: '#F04438',
  darkCanvas: '#0B1220',
  darkSurface: '#111B2E',
  darkLine: '#24324A',
};

export const statusBarHeight = StatusBar.currentHeight || Platform.select({
  ios: 0,
  android: StatusBar.currentHeight || 0,
}) || 0;

export const Colors = {
  light: {
    text: Palette.ink,
    background: Palette.canvas,
    tint: tintColorLight,
    icon: Palette.slate,
    tabIconDefault: Palette.muted,
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: '#ffffff',
    background: Palette.darkCanvas,
    tint: tintColorDark,
    icon: '#98A2B3',
    tabIconDefault: '#667085',
    tabIconSelected: tintColorDark,
  },
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
