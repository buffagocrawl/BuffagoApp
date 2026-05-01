import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
  colors: {
    ...PaperDark.colors,
    primary: '#E67E22',
    secondary: '#8E44AD',

    // Darker page background, so content & popups float above it
    background: '#050607',

    // Base surface slightly lighter than background
    surface: '#111218',

    // Surfaces used for cards/dialogs/etc
    surfaceVariant: '#20222C',

    // Outlines for subtle separation
    outlineVariant: '#393B46',

    // Tuned elevation steps so dialogs & sheets clearly stand out
    elevation: {
      ...PaperDark.colors.elevation,
      level0: 'transparent',
      level1: '#151821',
      level2: '#1C1F2A', // typical cards
      level3: '#222634',
      level4: '#272C3C',
      level5: '#2D3244', // dialogs / highest elevation
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
