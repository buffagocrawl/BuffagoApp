import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Button, Text } from 'react-native-paper';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WingShotComposer } from '../../../components/wingShots/WingShotComposer';
import { supabase } from '../../../lib/supabase';
import { loadPhotoWorkflowFlags } from '../../../lib/photoWorkflowFlags';
import { saveWingShotIntent, isWingShotDestinationId } from '../../../lib/wingShotAuthIntent';
import { trackEvent } from '../../../lib/analytics';
const SOURCES = new Set(['onboarding', 'buffacoin', 'profile', 'home_cta']);
export default function WingShotSubmitScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const source = SOURCES.has(String(params.source)) ? String(params.source) : 'profile';
  const destinationId = typeof params.destinationId === 'string' ? params.destinationId : '';
  const restaurantName = typeof params.restaurantName === 'string' ? params.restaurantName.slice(0, 120) : '';
  const [state, setState] = useState('loading');
  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (!active) return;
      if (error || !data?.user || data.user.is_anonymous) {
        if (source === 'onboarding') await saveWingShotIntent(AsyncStorage, { destinationId, restaurantName });
        if (active) setState('auth');
        return;
      }
      const flags = await loadPhotoWorkflowFlags(supabase);
      if (!active) return;
      setState(flags.prompt && flags.photo ? 'ready' : 'unavailable');
      if (flags.prompt && flags.photo) void trackEvent({ eventName: 'wing_shot_upload_opened', screen: 'profile/wing-shots/submit', destinationId: isWingShotDestinationId(destinationId) ? destinationId : null, metadata: { source } }).catch(() => {});
    })().catch(() => { if (active) setState('unavailable'); });
    return () => { active = false; };
  }, [destinationId, restaurantName, source]);
  if (state === 'ready') return <WingShotComposer source={source} destinationId={destinationId} restaurantName={restaurantName} onClose={() => router.replace('/(tabs)/home')} />;
  return <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 16 }}>
    {state === 'loading' ? <ActivityIndicator /> : <>
      <Text>{state === 'auth' ? 'Sign in to add a Wing Shot. Your local preview stays on this device.' : 'Wing Shots are unavailable right now. Your local preview stays on this device.'}</Text>
      {state === 'auth' && <Button onPress={() => router.replace('/auth/login')}>Sign in / Create account</Button>}
    </>}
    <Button onPress={() => router.replace('/(tabs)/home')}>Explore BuffaGo</Button>
  </View>;
}
