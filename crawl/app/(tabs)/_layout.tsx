    import React, { useEffect, useState } from 'react';
    import { Tabs } from 'expo-router';
    import { useTheme } from 'react-native-paper';
    import { MaterialCommunityIcons } from '@expo/vector-icons';
    import { supabase } from '../../lib/supabase.js';
    import { useSafeAreaInsets } from 'react-native-safe-area-context';

    export default function TabsLayout() {
      const theme = useTheme();
      const insets = useSafeAreaInsets();

      const [signedIn, setSignedIn] = useState(false);

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
      );
    }
