// app/(tabs)/journey/index.jsx
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator, Button, Text } from 'react-native-paper';
import { supabase } from '../../../lib/supabase.js';

// ✅ app/(tabs)/journey -> app/profile/history
import HistoryScreen from '../../profile/history/index.jsx';
import BuffaverseOverview from '../../../components/buffaverse/BuffaverseOverview';
import { ENABLE_BUFFAVERSE } from '../../../config/features';

export default function JourneyTab() {
  const router = useRouter();

  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    let alive = true;

    // Initial session check
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!alive) return;

        // Optional: quiet “Invalid Refresh Token” loops
        if (error?.message?.includes('Refresh Token')) {
          supabase.auth.signOut();
          setSignedIn(false);
          setReady(true);
          return;
        }

        setSignedIn(!!data?.session);
        setReady(true);
      })
      .catch(() => {
        if (!alive) return;
        setSignedIn(false);
        setReady(true);
      });

    // Keep in sync
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      if (!alive) return;
      setSignedIn(!!session);
      setReady(true);
    });

    return () => {
      alive = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  if (!ready) {
    return (
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator />
        </View>
      </SafeAreaView>
    );
  }

  if (!signedIn) {
    return (
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text variant="titleLarge" style={{ fontWeight: '900', marginBottom: 8 }}>
            Sign in to see your Journey
          </Text>
          <Text style={{ opacity: 0.75, textAlign: 'center', marginBottom: 16 }}>
            Track crawls, ratings, and your wing stats across time.
          </Text>

          <Button
            mode="contained"
            onPress={() => router.push('/auth/login')}
            style={{ borderRadius: 12 }}
            contentStyle={{ paddingVertical: 8, paddingHorizontal: 10 }}
          >
            Sign In
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  if (ENABLE_BUFFAVERSE && !showHistory) {
    return <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <BuffaverseOverview onOpenHistory={() => setShowHistory(true)} />
    </SafeAreaView>;
  }

  // History remains available as a linked detail view from Buffaverse.
  return <HistoryScreen />;
}
