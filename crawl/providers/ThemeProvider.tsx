import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { operationTokens } from '../src/theme/operationTokens';
import {
  MD3DarkTheme as PaperDark,
  MD3LightTheme as PaperLight,
  PaperProvider,
} from 'react-native-paper';

type Mode = 'system' | 'light' | 'dark';
type Ctx = {
  mode: Mode;
  setMode: (m: Mode) => void;
  toggleCycle: () => void; // system -> light -> dark -> system
  isDark: boolean;
  theme: typeof PaperDark;
};

const ThemeCtx = createContext<Ctx | null>(null);
const STORAGE_KEY = 'buffago:themeMode';

/* ---------------- Light theme ---------------- */

const lightTheme = {
  ...PaperLight,
  colors: {
    ...PaperLight.colors,
    primary: '#E67E22',
    onPrimary: '#17100B',
    secondary: '#8E44AD',
    background: '#FFFCE8',
    // keep surfaces close but distinct
    surface: '#FFFFFF',
    surfaceVariant: '#FFE7D3',
    outlineVariant: '#E2C2A8',
  },
};

/* ---------------- Dark theme (popup-friendly) ---------------- */

const darkTheme = {
  ...PaperDark,
  roundness: 12,
  colors: {
    ...PaperDark.colors,
    primary: operationTokens.colors.orange,
    onPrimary: '#17100B',
    primaryContainer: '#452718',
    onPrimaryContainer: '#FFD9C3',
    secondary: operationTokens.colors.muted,
    secondaryContainer: '#272B31',
    onSecondaryContainer: operationTokens.colors.text,
    tertiary: operationTokens.colors.amber,
    onBackground: operationTokens.colors.text,
    onSurface: operationTokens.colors.text,
    onSurfaceVariant: operationTokens.colors.muted,
    outline: operationTokens.colors.border,
    success: operationTokens.colors.success,

    // Darker page background, so content & popups float above it
    background: operationTokens.colors.background,

    // Base surface slightly lighter than background
    surface: operationTokens.colors.surface,

    // Surfaces used for cards/dialogs/etc
    surfaceVariant: operationTokens.colors.surfaceRaised,

    // Outlines for subtle separation
    outlineVariant: operationTokens.colors.border,

    // Tuned elevation steps so dialogs & sheets clearly stand out
    elevation: {
      ...PaperDark.colors.elevation,
      level0: 'transparent',
      level1: '#14161A',
      level2: '#1D2025',
      level3: '#252930',
      level4: '#2B3038',
      level5: '#323842',
    },

    // Slightly stronger backdrop for modals
    backdrop: 'rgba(0,0,0,0.65)',
  },
};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // ✅ Default NEW users to dark (until they explicitly choose otherwise)
  const [mode, setModeState] = useState<Mode>('dark');

  const [system, setSystem] = useState<'light' | 'dark'>(
    Appearance.getColorScheme() === 'dark' ? 'dark' : 'light'
  );

  // load saved mode once
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (!alive) return;

        if (saved === 'light' || saved === 'dark' || saved === 'system') {
          setModeState(saved as Mode);
        } else {
          // ✅ first launch: persist dark so iOS doesn't pick light via "system"
          await AsyncStorage.setItem(STORAGE_KEY, 'dark');
          setModeState('dark');
        }
      } catch {
        // If storage fails, still default to dark
        setModeState('dark');
      }
    })();

    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystem(colorScheme === 'dark' ? 'dark' : 'light');
    });

    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  const setMode = async (m: Mode) => {
    setModeState(m);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, m);
    } catch {
      // ignore
    }
  };

  const toggleCycle = () => {
    setMode(mode === 'system' ? 'light' : mode === 'light' ? 'dark' : 'system');
  };

  const effective = mode === 'system' ? system : mode;
  const isDark = effective === 'dark';

  const theme = useMemo(() => (isDark ? darkTheme : lightTheme), [isDark]);

  const value: Ctx = { mode, setMode, toggleCycle, isDark, theme };

  return (
    <ThemeCtx.Provider value={value}>
      <PaperProvider theme={theme}>{children}</PaperProvider>
    </ThemeCtx.Provider>
  );
}

export function useThemeMode() {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error('useThemeMode must be used within ThemeProvider');
  return ctx;
}
