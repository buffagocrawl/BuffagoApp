    import React, { useEffect, useState } from 'react';
    import { Tabs } from 'expo-router';
    import { View } from 'react-native';
    import { useTheme } from 'react-native-paper';
    import { MaterialCommunityIcons } from '@expo/vector-icons';
    import { supabase } from '../../lib/supabase.js';
    import { useSafeAreaInsets } from 'react-native-safe-area-context';
    import { useSocialBadges } from '../../hooks/useSocialBadges';

    export default function TabsLayout() {
      const theme = useTheme();
      const insets = useSafeAreaInsets();

      const [signedIn, setSignedIn] = useState(false);
      const socialBadges = useSocialBadges();

      useEffect(() => {
        let alive = true;

        supabase.auth
          .getSession()
          .then(({ data, error }) => {
            // ✅ Fix noisy “Invalid Refresh Token” loops
            if (error?.message?.includes('Refresh Token')) {
              supabase.auth.signOut();
              if (alive) setSignedIn(false);
              return;
            }
            if (alive) setSignedIn(!!data?.session?.user?.id);
          })
          .catch(() => {});

        const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
          setSignedIn(!!session?.user?.id);
        });

        return () => {
          alive = false;
          sub?.subscription?.unsubscribe?.();
        };
      }, []);

      const iconSize = 26;

      // Base layout values (keep your current look)
      const BASE_HEIGHT = 64;
      const BASE_PADDING_TOP = 6;

      // ✅ Add enough bottom padding to clear the iPhone home indicator
      // (keeps Android basically unchanged)
      const safeBottom = Math.max(insets.bottom, 10);

      return (
        <View testID={signedIn ? 'auth.signed-in-marker' : undefined} style={{ flex: 1 }}>
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: theme.colors.primary,
            tabBarInactiveTintColor:
              theme.colors.onSurfaceDisabled ?? theme.colors.onSurface,
            tabBarLabelStyle: { fontSize: 12, marginBottom: 4 },

            // ✅ Safe-area aware tab bar
            tabBarStyle: {
              backgroundColor: theme.colors.surface,
              borderTopColor: theme.colors.outline,
              paddingTop: BASE_PADDING_TOP,
              paddingBottom: safeBottom,
              height: BASE_HEIGHT + safeBottom,
            },
          }}
        >
          {/* ✅ 5 tabs only */}
          <Tabs.Screen
            name="home/index"
            options={{
              title: 'Home',
              tabBarLabel: 'Home',
              tabBarButtonTestID: 'nav.home',
              tabBarAccessibilityLabel: 'Home navigation',
              tabBarIcon: ({ color }) => (
                <MaterialCommunityIcons
                  name="home-variant"
                  color={color}
                  size={iconSize}
                />
              ),
            }}
          />

          <Tabs.Screen
            name="routes/index"
            options={{
              title: 'Routes',
              tabBarLabel: 'Crawls',
              tabBarButtonTestID: 'nav.crawl',
              tabBarAccessibilityLabel: 'Crawls navigation',
              tabBarIcon: ({ color }) => (
                <MaterialCommunityIcons
                  name="map-marker-path"
                  color={color}
                  size={iconSize}
                />
              ),
            }}
          />

          <Tabs.Screen
            name="ratings/index"
            options={{
              title: 'Wingdex',
              tabBarLabel: 'Wingdex',
              tabBarButtonTestID: 'nav.wingdex',
              tabBarAccessibilityLabel: 'Wingdex navigation',
              tabBarIcon: ({ color }) => (
                <MaterialCommunityIcons
                  name="food-drumstick"
                  color={color}
                  size={iconSize}
                />
              ),
            }}
          />

          <Tabs.Screen
            name="leaderboards/index"
            options={{
              title: 'Social',
              tabBarLabel: 'Social',
              tabBarButtonTestID: 'nav.leaderboard',
              tabBarAccessibilityLabel: 'Social navigation',
              tabBarBadge: signedIn && socialBadges.total > 0 ? socialBadges.total : undefined,
              tabBarBadgeStyle: { backgroundColor: theme.colors.error, color: theme.colors.onError },
              tabBarIcon: ({ color }) => (
                <MaterialCommunityIcons
                  name="account-group"
                  color={color}
                  size={iconSize}
                />
              ),
            }}
          />

          <Tabs.Screen
            name="journey/index"
            options={{
              title: signedIn ? 'Your Journey' : 'Sign In',
              tabBarLabel: signedIn ? 'Journey' : 'Sign In',
              tabBarButtonTestID: 'nav.profile',
              tabBarAccessibilityLabel: signedIn ? 'Profile navigation' : 'Sign in navigation',
              tabBarIcon: ({ color }) => (
                <MaterialCommunityIcons
                  name={signedIn ? 'timeline-text' : 'login-variant'}
                  color={color}
                  size={iconSize}
                />
              ),
            }}
          />
        </Tabs>
        </View>
      );
    }
