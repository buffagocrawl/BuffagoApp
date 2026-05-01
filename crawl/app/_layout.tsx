// app/_layout.tsx
import * as WebBrowser from 'expo-web-browser';
WebBrowser.maybeCompleteAuthSession();

import 'react-native-reanimated';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { Stack, usePathname } from 'expo-router'; 
import { StatusBar } from 'expo-status-bar';

// Theme + Providers
import { ThemeProvider } from '../providers/ThemeProvider';
import {
  useTheme as usePaperTheme,
  PaperProvider,
  Text,
  ProgressBar,
} from 'react-native-paper';
import {
  ThemeProvider as NavThemeProvider,
  DarkTheme as NavDark,
} from '@react-navigation/native';

import QueryProvider from '../providers/QueryProvider';
import { AuthProvider } from '../providers/AuthProvider';
import LocationProvider from '../providers/LocationProvider';
import XpToastProvider from '../providers/XpToastProvider';

import { supabase } from '../lib/supabase';
import { useOnboardingGate } from '../hooks/useOnboardingGate';
import OnboardingFlow from '../components/OnboardingFlow';

/**
 * Fun-fact boot splash (JS-only).
 * Rotates facts every ~3s, shows indeterminate progress bar,
 * and enforces a minimum duration.
 */
function AppBootSplash() {
  const paperTheme = usePaperTheme();

  const FUN_FACTS = useMemo(
    () => [
      'Chicken wings are a $12B+ per year industry in the U.S.',
      '“Wingette” refers to the flat section of the wing.',
      'Some chefs smoke wings over applewood for sweetness.',
      'Lemon pepper wings got huge thanks to Atlanta culture.',
      'Before 1964, many restaurants treated wings as scraps.',
      'The Scoville scale measures heat by capsaicin level.',
      'The average chicken only has two usable wings for wing night.',
      'Pro tip: sauce on the side keeps crispiness alive.',
      '“Wing Wednesday” became a national promotion in the 1990s.',
      'Restaurants prefer fresh wings for better texture.',
      'The Wing Bowl in Philadelphia ran for 26 years before ending in 2018.',
      '“Mild” Buffalo sauce was invented for kids.',
      'A “suicide wing” usually measures over 500,000 Scoville units.',
      'There are over 1,500 wing-focused restaurants in the U.S.',
      'The most expensive wings ever sold were $4,900 for 12 wings covered in foie gras, cognac-infused cream, and caviar.',
      'Wing prices spike before major sporting events due to demand.',
      'A wing’s crispiness comes from rendering its fat just right.',
    ],
    []
  );

  const [factIndex, setFactIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setFactIndex(Math.floor(Math.random() * FUN_FACTS.length));

    timerRef.current = setInterval(() => {
      setFactIndex((i) => (i + 1) % FUN_FACTS.length);
    }, 3000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [FUN_FACTS.length]);

  const fact = FUN_FACTS[factIndex] ?? '';

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: paperTheme.colors.background,
        padding: 24,
      }}
    >
      <Text style={{ fontSize: 24, fontWeight: '900', marginBottom: 10 }}>
        BuffaGo
      </Text>

      <Text style={{ opacity: 0.75, textAlign: 'center', marginBottom: 14 }}>
        Warming up the sauce…
      </Text>

      <ProgressBar
        indeterminate
        style={{
          height: 10,
          borderRadius: 10,
          width: '92%',
          marginBottom: 14,
        }}
      />

      <Text style={{ opacity: 0.85, textAlign: 'center', lineHeight: 20 }}>
        {fact}
      </Text>
    </View>
  );
}

/**
 * Inner app stack that receives all providers.
 *
 * NOTE: Locks Navigation to Dark theme. Paper theme still comes from ThemeProvider.
 */
function AppShell() {
  const paperTheme = usePaperTheme();
   const pathname = usePathname(); // 

  // ---- Boot splash gate ----
  const MIN_SPLASH_MS = 10000;
  const SETTLE_MS = 500;

  const [bootDone, setBootDone] = useState(false);
  const [minTimeDone, setMinTimeDone] = useState(false);
  const [appReady, setAppReady] = useState(false);

  // Onboarding gate
  const { loading: onboardingLoading, shouldShowIntro, markIntroSeen } = useOnboardingGate();
  const [onboardingOpen, setOnboardingOpen] = useState(false);

  useEffect(() => {
    if (!onboardingLoading && shouldShowIntro) setOnboardingOpen(true);
  }, [onboardingLoading, shouldShowIntro]);

  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      if (alive) setMinTimeDone(true);
    }, MIN_SPLASH_MS);

    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, []);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        await supabase.auth.getSession();
      } catch {
        // ignore
      } finally {
        if (alive) setBootDone(true);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    if (!bootDone || !minTimeDone) return;

    const t = setTimeout(() => {
      if (alive) setAppReady(true);
    }, SETTLE_MS);

    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [bootDone, minTimeDone]);

  if (!appReady) return <AppBootSplash />;

  const navTheme = {
    ...NavDark,
    colors: {
      ...NavDark.colors,
      background: paperTheme.colors.background,
      card: paperTheme.colors.surface,
      primary: paperTheme.colors.primary,
      text: paperTheme.colors.onSurface,
      border: paperTheme.colors.outline,
      notification: paperTheme.colors.secondary,
    },
  };

  const hideOnboardingOverlay = pathname === '/onboarding/crawl-preview'; 

  return (
    <PaperProvider theme={paperTheme}>
      <NavThemeProvider value={navTheme}>
        <LocationProvider>
          <StatusBar style="light" />
          <XpToastProvider>
            {/* Full screen onboarding overlay */}
            {onboardingOpen && !hideOnboardingOverlay ? (
              <OnboardingFlow
                onComplete={async () => {
                  await markIntroSeen();
                  setOnboardingOpen(false);
                }}
              />
            ) : null}

            <Stack
              initialRouteName="(tabs)"
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: paperTheme.colors.background },
              }}
            >
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="crawl/[id]" options={{ headerShown: false }} />
              <Stack.Screen name="onboarding/crawl-preview" options={{ headerShown: false }} />
              <Stack.Screen
                name="auth/login"
                options={{ headerShown: false, presentation: 'modal' }}
              />
              <Stack.Screen
                name="auth/reset"
                options={{ headerShown: false, presentation: 'modal' }}
              />
              <Stack.Screen
                name="auth/change-password"
                options={{ headerShown: false, presentation: 'modal' }}
              />
              <Stack.Screen name="auth/callback" options={{ headerShown: false }} />

              {/* Legacy / compat */}
              <Stack.Screen name="reset" options={{ headerShown: false }} />
            </Stack>
          </XpToastProvider>
        </LocationProvider>
      </NavThemeProvider>
    </PaperProvider>
  );
}

/**
 * Root provider tree wrapping the whole app.
 */
export default function RootLayout() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <QueryProvider>
          <AppShell />
        </QueryProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
