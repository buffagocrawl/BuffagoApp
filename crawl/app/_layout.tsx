// app/_layout.tsx
import * as WebBrowser from 'expo-web-browser';
import 'react-native-reanimated';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import { Stack, usePathname } from 'expo-router'; 
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { SafeAreaProvider } from 'react-native-safe-area-context';

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
import { AuthProvider, useAuth } from '../providers/AuthProvider';
import LocationProvider from '../providers/LocationProvider';
import XpToastProvider from '../providers/XpToastProvider';

import { dbg } from '../lib/debugLog';
import {
  describeUrl,
  OAUTH_FLOW_ID_KEY,
  OAUTH_FLOW_MODE_KEY,
  OAUTH_FLOW_STARTED_AT_KEY,
  OAUTH_RETURN_URL_KEY,
} from '../lib/facebookOAuth';
import { installAppLifecycleTracking, rotateAnalyticsSession, trackEvent, trackScreenViewed } from '../lib/analytics';
import { useOnboardingGate } from '../hooks/useOnboardingGate';
import OnboardingFlow from '../components/OnboardingFlow';
import ReferralAttributionBridge from '../components/ReferralAttributionBridge';

WebBrowser.maybeCompleteAuthSession();

const ANDROID_SYSTEM_BAR_BACKGROUND = '#050607';
const APP_STARTUP_STARTED_AT = Date.now();
const IOS_SPLASH_ASSET = 'assets/images/BuffaGo-splash.png';
const STARTUP_FAILSAFE_MS = 8000;

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

function AppStatusScreen({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  const paperTheme = usePaperTheme();

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
      <Text style={{ fontSize: 22, fontWeight: '900', marginBottom: 10, textAlign: 'center' }}>
        {title}
      </Text>
      <Text style={{ opacity: 0.8, textAlign: 'center', lineHeight: 21 }}>{message}</Text>
    </View>
  );
}

class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('[startup] Root error boundary caught render error', error);
    dbg(
      'root_error_boundary_caught',
      {
        message: error?.message || 'unknown',
        stack: typeof error?.stack === 'string' ? error.stack.slice(0, 1000) : null,
      },
      'app'
    );
  }

  render() {
    if (this.state.error) {
      return (
        <ThemeProvider>
          <PaperProvider>
            <AppStatusScreen
              title="BuffaGo hit a startup error"
              message="Restart the app or sign out after the next launch. The error was logged."
            />
          </PaperProvider>
        </ThemeProvider>
      );
    }

    return this.props.children;
  }
}

/**
 * Inner app stack that receives all providers.
 *
 * NOTE: Locks Navigation to Dark theme. Paper theme still comes from ThemeProvider.
 */
function AppShell() {
  const paperTheme = usePaperTheme();
  const pathname = usePathname();
  const { user, initializing } = useAuth();
  const lastTrackedPathRef = useRef<string | null>(null);
  const appOpenTrackedRef = useRef(false);
  const initialPathRef = useRef<string | null>(pathname || null);

  // ---- Boot splash gate ----
  const MIN_SPLASH_MS = 3500;
  const SETTLE_MS = 250;

  const [bootDone, setBootDone] = useState(false);
  const [minTimeDone, setMinTimeDone] = useState(false);
  const [appReady, setAppReady] = useState(false);
  const [startupTimedOut, setStartupTimedOut] = useState(false);
  const startupLoggedRef = useRef(false);

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
    if (initializing) return;
    setBootDone(true);
    console.info('[startup] initial session hydration completed', {
      userId: user?.id ?? null,
    });
    dbg(
      'initial_session_hydration_completed',
      { userId: user?.id ?? null },
      'app'
    );
  }, [initializing, user?.id]);

  useEffect(() => {
    console.info('[startup] app mounted', { pathname: pathname || null });
    dbg('app_mounted', { pathname: pathname || null }, 'app');
  }, [pathname]);

  useEffect(() => {
    let alive = true;
    const timeout = setTimeout(() => {
      if (!alive || appReady) return;
      setStartupTimedOut(true);
      console.warn('[startup] failsafe timeout reached before app became ready');
      dbg(
        'startup_failsafe_timeout_reached',
        {
          bootDone,
          minTimeDone,
          authInitializing: initializing,
          pathname: pathname || null,
          userId: user?.id ?? null,
        },
        'app'
      );
    }, STARTUP_FAILSAFE_MS);

    return () => {
      alive = false;
      clearTimeout(timeout);
    };
  }, [appReady, bootDone, initializing, minTimeDone, pathname, user?.id]);

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

  useEffect(() => {
    if (!appReady) return;

    const startupDurationMs = Date.now() - APP_STARTUP_STARTED_AT;
    if (!startupLoggedRef.current) {
      startupLoggedRef.current = true;
      console.info('[startup] Splash initialization complete', {
        duration_ms: startupDurationMs,
        platform: Platform.OS,
        ios_splash_asset: Platform.OS === 'ios' ? IOS_SPLASH_ASSET : undefined,
      });
    }

    let alive = true;
    const cleanup = installAppLifecycleTracking();

    (async () => {
      if (appOpenTrackedRef.current) return;
      appOpenTrackedRef.current = true;
      await rotateAnalyticsSession();
      if (!alive) return;
      await trackEvent({
        eventName: 'app_opened',
        screen: initialPathRef.current,
        userId: user?.id ?? null,
        metadata: {
          source: 'cold_start',
          startup_duration_ms: startupDurationMs,
          splash_asset: Platform.OS === 'ios' ? IOS_SPLASH_ASSET : null,
        },
      });
    })();

    return () => {
      alive = false;
      cleanup?.();
    };
  }, [appReady, user?.id]);

  useEffect(() => {
    if (!appReady || !pathname) return;
    if (lastTrackedPathRef.current === pathname) return;
    lastTrackedPathRef.current = pathname;
    trackScreenViewed(pathname, { user_id_present: !!user?.id });
  }, [appReady, pathname, user?.id]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    SystemUI.setBackgroundColorAsync(ANDROID_SYSTEM_BAR_BACKGROUND).catch((error) => {
      console.warn(
        '[system-ui] Android navigation bar/theme initialization failed',
        error?.message || error
      );
      trackEvent({
        eventName: 'system_ui_initialization_failed',
        screen: 'app_root',
        metadata: {
          component: 'android_navigation_bar',
          background_color: ANDROID_SYSTEM_BAR_BACKGROUND,
          error_message: error?.message || String(error),
        },
      });
    });
  }, []);

  if (!appReady && startupTimedOut) {
    return (
      <AppStatusScreen
        title="BuffaGo is still loading"
        message="Startup took longer than expected. The app stayed visible instead of falling back to a blank screen."
      />
    );
  }

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
            <ReferralAttributionBridge />
            {/* Full screen onboarding overlay */}
            {onboardingOpen && !hideOnboardingOverlay ? (
              <OnboardingFlow
                onComplete={async () => {
                  await trackEvent({
                    eventName: 'onboarding_completed',
                    screen: 'onboarding',
                    userId: user?.id ?? null,
                    metadata: { source: 'root_overlay' },
                  });
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
              <Stack.Screen name="referrals" options={{ headerShown: false }} />

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
  useEffect(() => {
    const logLinkingEvent = async (url: string | null, source: string) => {
      const [flowId, mode, startedAtRaw] = await AsyncStorage.multiGet([
        OAUTH_FLOW_ID_KEY,
        OAUTH_FLOW_MODE_KEY,
        OAUTH_FLOW_STARTED_AT_KEY,
      ]);
      const startedAt = Number(startedAtRaw?.[1]);
      await dbg(
        'linking_event_observed',
        {
          flowId: flowId?.[1] || null,
          mode: mode?.[1] || null,
          source,
          url: url || null,
          parsed: url ? describeUrl(url) : null,
          isAuthCallback: Boolean(url && String(url).includes('auth/callback')),
          elapsedMs: Number.isFinite(startedAt) && startedAt > 0 ? Date.now() - startedAt : null,
        },
        mode?.[1] ? 'facebook' : 'auth'
      );
    };

    const cacheOAuthCallback = async (url: string | null) => {
      await logLinkingEvent(url, 'root');
      if (!url || !String(url).includes('auth/callback')) return;
      await AsyncStorage.setItem(OAUTH_RETURN_URL_KEY, url);
      const [flowId, mode, startedAtRaw] = await AsyncStorage.multiGet([
        OAUTH_FLOW_ID_KEY,
        OAUTH_FLOW_MODE_KEY,
        OAUTH_FLOW_STARTED_AT_KEY,
      ]);
      const startedAt = Number(startedAtRaw?.[1]);
      await dbg(
        'oauth_deep_link_received_at_root',
        {
          flowId: flowId?.[1] || null,
          mode: mode?.[1] || null,
          callback: describeUrl(url),
          elapsedMs: Number.isFinite(startedAt) && startedAt > 0 ? Date.now() - startedAt : null,
        },
        mode?.[1] ? 'facebook' : 'auth'
      );
    };

    const subscription = Linking.addEventListener('url', ({ url }) => {
      cacheOAuthCallback(url).catch(() => {});
    });
    Linking.getInitialURL().then(cacheOAuthCallback).catch(() => {});

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    let previousState = AppState.currentState;
    const subscription = AppState.addEventListener('change', async (nextState) => {
      const [flowId, mode, startedAtRaw] = await AsyncStorage.multiGet([
        OAUTH_FLOW_ID_KEY,
        OAUTH_FLOW_MODE_KEY,
        OAUTH_FLOW_STARTED_AT_KEY,
      ]);
      const startedAt = Number(startedAtRaw?.[1]);
      await dbg(
        'app_state_transition',
        {
          flowId: flowId?.[1] || null,
          mode: mode?.[1] || null,
          previousState,
          nextState,
          elapsedMs: Number.isFinite(startedAt) && startedAt > 0 ? Date.now() - startedAt : null,
        },
        mode?.[1] ? 'facebook' : 'app'
      );
      previousState = nextState;
    });

    return () => subscription.remove();
  }, []);

  return (
    <RootErrorBoundary>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <QueryProvider>
              <AppShell />
            </QueryProvider>
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </RootErrorBoundary>
  );
}
