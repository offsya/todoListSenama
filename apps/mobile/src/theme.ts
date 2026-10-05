import { useMemo } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';

const light = {
  background: '#f4f5fb',
  surface: '#ffffff',
  surfaceMuted: '#f1f2f8',
  text: '#181b26',
  textMuted: '#636a80',
  border: '#e3e6ef',
  primary: '#4f46e5',
  primarySoft: '#eef0ff',
  onPrimary: '#ffffff',
  danger: '#d92d20',
  dangerSoft: '#fef1f0',
};

export type Colors = typeof light;

const dark: Colors = {
  background: '#0e1016',
  surface: '#161922',
  surfaceMuted: '#1c202b',
  text: '#e9ebf3',
  textMuted: '#99a0b5',
  border: '#2a2f3d',
  primary: '#7f77ff',
  primarySoft: 'rgba(127, 119, 255, 0.16)',
  onPrimary: '#0e1016',
  danger: '#ff7a6e',
  dangerSoft: 'rgba(255, 122, 110, 0.14)',
};

export const radius = { sm: 8, md: 12, lg: 18 };

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}

/** Creates a hook that returns theme-aware styles, recomputed only when the color scheme changes. */
export function makeStyles<T extends StyleSheet.NamedStyles<T>>(factory: (colors: Colors) => T) {
  return function useStyles(): T {
    const colors = useColors();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}
