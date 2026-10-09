// app/(tabs)/journey/index.jsx
import React, { useEffect, useState } from 'react';
import { View, Modal, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator, Button, Text, useTheme } from 'react-native-paper';
import { supabase } from '../../../lib/supabase.js';

// ✅ app/(tabs)/journey -> app/profile/history
import HistoryScreen from '../../profile/history/index.jsx';
import BuffaverseOverview from '../../../components/buffaverse/BuffaverseOverview';
import { ENABLE_BUFFAVERSE } from '../../../config/features';

export default function JourneyTab() {
  const router = useRouter();
  const theme = useTheme();

  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [showBuffaverse, setShowBuffaverse] = useState(false);

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
        <ScrollView contentContainerStyle={{ flexGrow: 1, alignItems: 'stretch', justifyContent: 'center', padding: 24 }}>
          <Text variant="titleLarge" style={{ fontWeight: '900', marginBottom: 8, textAlign: 'center' }}>
            Sign in to see your Journey
          </Text>
          <Text style={{ opacity: 0.75, textAlign: 'center', marginBottom: 16 }}>
            Track crawls, ratings, and your wing stats across time.
          </Text>

          <Button
            mode="contained"
            onPress={() => router.push('/auth/login')}
            style={{ borderRadius: 12, alignSelf: 'stretch' }}
            contentStyle={{ paddingVertical: 8, paddingHorizontal: 10 }}
          >
            Sign In
          </Button>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return <>
    <HistoryScreen onOpenBuffaverse={ENABLE_BUFFAVERSE ? () => setShowBuffaverse(true) : undefined} />
    {showBuffaverse ? <Modal visible={showBuffaverse} animationType="slide" onRequestClose={() => setShowBuffaverse(false)}>
      <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <Button icon="arrow-left" onPress={() => setShowBuffaverse(false)} contentStyle={{ minHeight: 44 }}>Back to Journey</Button>
        <BuffaverseOverview onOpenHistory={() => setShowBuffaverse(false)} />
      </SafeAreaView>
    </Modal> : null}
  </>;
}
