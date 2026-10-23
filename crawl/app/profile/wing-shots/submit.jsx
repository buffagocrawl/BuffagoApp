import OnboardingRatingConfirmation from '../../../components/OnboardingRatingConfirmation';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Button, Text } from 'react-native-paper';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WingShotComposer } from '../../../components/wingShots/WingShotComposer';
import { supabase } from '../../../lib/supabase';
import { loadPhotoWorkflowFlags } from '../../../lib/photoWorkflowFlags';
import { saveWingShotIntent, isWingShotDestinationId, getWingShotHandoff, completeWingShotHandoff, clearWingShotIntent } from '../../../lib/wingShotAuthIntent';
import { trackEvent } from '../../../lib/analytics';
const SOURCES = new Set(['onboarding', 'buffacoin', 'profile', 'home_cta']);
export default function WingShotSubmitScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const source = SOURCES.has(String(params.source)) ? String(params.source) : 'profile';
  const destinationId = typeof params.destinationId === 'string' ? params.destinationId : '';
  const restaurantName = typeof params.restaurantName === 'string' ? params.restaurantName.slice(0, 120) : '';
  const handoffId = typeof params.handoffId === 'string' ? params.handoffId : '';
  const [state, setState] = useState('loading');
  const [attempt, setAttempt] = useState(0);
  const [context, setContext] = useState(null);
  const verifiedContext = useRef(null);
  const account = useRef(null);
  useEffect(() => {
    let active = true;
    let revision = 0;
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user;
      if (account.current && (user?.id !== account.current || user.is_anonymous)) {
        revision += 1;
        verifiedContext.current = null;
        if (active) { setContext(null); setState('changed'); }
      }
    });
    const requestRevision = revision;
    setState('loading');
    // A failed/slow flag call has a timeout in loadPhotoWorkflowFlags. Explore
    // stays visible even while current account verification is offline.
    (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (!active || revision !== requestRevision) return;
      if (error) { setState('unavailable'); return; }
      if (!data?.user || data.user.is_anonymous) { setState('auth'); return; }
      account.current = data.user.id;
      let selectedContext = { destinationId, restaurantName };
      if (handoffId) {
        const intent = verifiedContext.current || await getWingShotHandoff({ storage: AsyncStorage, client: supabase, handoffId });
        if (!active || revision !== requestRevision) return;
        if (!intent || intent.userId !== data.user.id) { setState('expired'); return; }
        selectedContext = intent;
        verifiedContext.current = intent;
      }
      const flags = await loadPhotoWorkflowFlags(supabase);
      if (!active || revision !== requestRevision) return;
      const { data: current, error: currentError } = await supabase.auth.getUser();
      if (!active || revision !== requestRevision || currentError) { if (active) setState('unavailable'); return; }
      if (current?.user?.id !== account.current || current.user.is_anonymous) { setState('changed'); return; }
      setContext(selectedContext);
      setState(flags.prompt && flags.photo ? 'ready' : 'disabled');
      if (flags.prompt && flags.photo) void trackEvent({ eventName: 'wing_shot_upload_opened', screen: 'profile/wing-shots/submit', destinationId: isWingShotDestinationId(selectedContext.destinationId) ? selectedContext.destinationId : null, metadata: { source } }).catch(() => {});
    })().catch(() => { if (active && revision === requestRevision) setState('unavailable'); });
    return () => { active = false; authListener?.subscription?.unsubscribe?.(); };
  }, [destinationId, restaurantName, handoffId, source, attempt]);
  const close = async () => { await clearWingShotIntent(AsyncStorage); router.replace('/(tabs)/home'); };
  const signIn = async () => {
    // Only explicit retry can create a new intent. Merely visiting a stale route
    // must never extend its expiry or replay an action under another account.
    if (source === 'onboarding' && !handoffId) await saveWingShotIntent(AsyncStorage, { destinationId, restaurantName });
    router.replace('/auth/login');
  };
  if (state === 'ready' && context?.previewId) return <OnboardingRatingConfirmation key={account.current} context={context} userId={account.current} handoffId={handoffId} onClose={close} />;
  if (state === 'ready' && context) return <WingShotComposer source={source} destinationId={context.destinationId} restaurantName={context.restaurantName}
    userId={account.current} onDestinationResolved={() => { if (handoffId) return completeWingShotHandoff(AsyncStorage, handoffId); }} onClose={close} />;
  return <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 16 }}>
    {state === 'loading' ? <ActivityIndicator accessibilityLabel="Checking Wing Shot availability" /> : <>
      <Text accessibilityRole="alert">{state === 'auth' ? 'Sign in to add a Wing Shot. Your local preview stays on this device.' : state === 'changed' || state === 'expired' ? 'This Wing Shot handoff has ended. Explore BuffaGo and start a new photo from your profile. Your local preview is unchanged.' : state === 'disabled' ? 'Photo uploads are not available for this account right now. You can still keep favorites and explore. Your preview stays on this device.' : 'We could not check photo availability. Retry or explore; your local preview stays on this device.'}</Text>
      {state === 'auth' && <Button onPress={signIn}>Sign in / Create account</Button>}
      {(state === 'unavailable' || state === 'disabled') && <Button onPress={() => setAttempt(value => value + 1)}>Retry availability</Button>}
    </>}
    <Button onPress={close}>Explore BuffaGo</Button>
  </View>;
}
