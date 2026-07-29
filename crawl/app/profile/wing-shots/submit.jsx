import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { WingShotComposer } from '../../../components/wingShots/WingShotComposer';
import { supabase } from '../../../lib/supabase';

const SOURCES = new Set(['onboarding', 'buffacoin', 'profile', 'home_cta']);

export default function WingShotSubmitScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const source = SOURCES.has(String(params.source)) ? String(params.source) : 'profile';
  const [ready, setReady] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data?.session) router.replace('/auth/login');
      else setReady(true);
    });
  }, [router]);
  if (!ready) return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator /></View>;
  return <WingShotComposer source={source} onClose={() => router.back()} />;
}
