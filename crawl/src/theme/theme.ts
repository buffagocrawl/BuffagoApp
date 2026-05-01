// src/theme/theme.ts
import { MD3LightTheme, MD3DarkTheme } from 'react-native-paper';

export const lightTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#FF6B2C',      // Wing Orange
    secondary: '#D73A2F',    // Buffalo Red
    tertiary: '#F2B705',     // Beer Gold
    background: '#FFF7E9',   // Cream
    surface: '#FFFFFF',
    surfaceVariant: '#FFE8D8',
    outline: '#E5C9B8',
    onPrimary: '#FFFFFF',
    onSurface: '#1F1F1F',
    success: '#2E7D32',
  },
  roundness: 16,
};

export const darkTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: '#FF7E47',
    secondary: '#E24A3F',
    tertiary: '#FFD35A',
    background: '#0F0F0F',
    surface: '#1C1C1C',
    surfaceVariant: '#2A2A2A',
    outline: '#3A3A3A',
    onPrimary: '#0F0F0F',
    onSurface: '#F7F7F7',
    success: '#4CAF50',
  },
  roundness: 16,
};
