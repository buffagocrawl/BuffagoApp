import { ENABLE_ONBOARDING_WING_SHOT_INVITE } from '../config/features';
import { loadPhotoWorkflowFlags } from '../lib/photoWorkflowFlags';
import { saveWingShotIntent, claimWingShotIntent, clearWingShotIntent } from '../lib/wingShotAuthIntent';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator, Button, List, Text, TextInput, useTheme } from 'react-native-paper';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { useRouter } from 'expo-router';
import RatingWizardDialog from './RatingWizardDialog';
import WingmanAddDialog from './WingmanAddDialog';
import { supabase } from '../lib/supabase';
import { useAuth } from '../providers/AuthProvider';
import { trackEvent } from '../lib/analytics';
import { markOnboardingSeen } from '../hooks/useOnboardingGate';
import { createGuestRatingPreview, loadGuestRatingPreview, saveGuestRatingPreview } from '../lib/guestRatingPreview';
import { QUICK_RATING_FLOW_VARIANT } from '../lib/quickRating';
import { finishV2, isCanonicalDestination, persistV2Preview } from '../lib/onboardingV2';

export default function OnboardingV2() {
  const router = useRouter();
  const theme = useTheme();
  const { user } = useAuth();
  const [photoAvailable, setPhotoAvailable] = useState(false);
  const [step, setStep] = useState('welcome');
  const [entryPath, setEntryPath] = useState(null);
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [destination, setDestination] = useState(null);
  const [state, setState] = useState(null);
  const [wingman, setWingman] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const mounted = useRef(true);
  const draft = useRef(null);
  const emit = useCallback((eventName, metadata = {}, destinationId = null) => {
    void trackEvent({ eventName, screen: 'onboarding', destinationId, metadata: {
      onboarding_version: 'v2', entry_path: entryPath || 'undecided', platform: Platform.OS, ...metadata,
    } }).catch(() => {});
  }, [entryPath]);

  useEffect(() => {
    mounted.current = true;
    void trackEvent({ eventName: 'onboarding_started', screen: 'onboarding', metadata: {
      onboarding_version: 'v2', platform: Platform.OS, entry_path: 'undecided',
    } }).catch(() => {});
    AsyncStorage.getItem('buffago:onboarding_state_v2').then(raw => {
      if (raw && mounted.current) { try { setState(JSON.parse(raw)); } catch {} }
    }).catch(() => {});
    loadGuestRatingPreview(AsyncStorage).then(saved => {
      if (saved?.payload?.onboarding_version === 'v2' && mounted.current) {
        draft.current = saved;
        setPreview(saved);
        setEntryPath('find_rate');
        setStep('result');
      }
    }).catch(() => { if (mounted.current) setNotice('A saved preview could not be opened. You can still explore.'); });
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => { emit('onboarding_step_viewed', { step_name: step }); }, [step, emit]);
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (busy.current || wingman) return false;
      if (step === 'rating') { setStep('search'); return true; }
      if (step === 'search') { setStep('welcome'); return true; }
      return false;
    });
    return () => subscription.remove();
  }, [step, wingman]);
  useEffect(() => {
    if (step !== 'search') return;
    let active = true;
    const controller = new AbortController();
    setRows([]);
    if (query.trim().length < 2) { setLoading(false); return; }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        // Use the existing destinations table; no permission prompt or separate state stage.
        const term = query.trim().replace(/[%_\\]/g, '').slice(0, 100);
        if (!term) return;
        const { data, error: lookupError } = await supabase.from('destinations')
          .select('id,name,address,city,state_id').ilike('name', `%${term}%`)
          .order('name').limit(30).abortSignal(controller.signal);
        if (lookupError) throw lookupError;
        if (active) { setRows(data || []); setError(''); }
      } catch { if (active) setError('Restaurant search is unavailable. Try again or ask Wingman.'); }
      finally { if (active) setLoading(false); }
    }, 300);
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [query, step]);

  useEffect(() => {
    if (step !== 'result') return;
    let active = true;
    if (!user || user.is_anonymous) {
      setPhotoAvailable(ENABLE_ONBOARDING_WING_SHOT_INVITE);
      if (ENABLE_ONBOARDING_WING_SHOT_INVITE) emit('onboarding_wing_shot_offer_viewed', { source: 'onboarding', eligibility: 'check_after_signin' }, preview?.payload?.destination_id);
      return;
    }
    setPhotoAvailable(false);
    loadPhotoWorkflowFlags(supabase).then(flags => {
      if (active) { setPhotoAvailable(flags.prompt && flags.photo);
        if (flags.prompt && flags.photo) emit('onboarding_wing_shot_offer_viewed', { source: 'onboarding' }, preview?.payload?.destination_id); }
    }).catch(() => {});
    return () => { active = false; };
  }, [step, user, emit, preview?.payload?.destination_id]);
  const addPhoto = async () => {
    if (busy.current) return;
    busy.current = true; setSaving(true);
    try {
      if (user && !user.is_anonymous) {
        const flags = await loadPhotoWorkflowFlags(supabase);
        if (!flags.prompt || !flags.photo) throw new Error('Photos unavailable');
      } else if (!ENABLE_ONBOARDING_WING_SHOT_INVITE) return;
      await saveWingShotIntent(AsyncStorage, { destinationId: preview?.payload?.destination_id, restaurantName: destination?.name || preview?.payload?.restaurant_name, userId: user && !user.is_anonymous ? user.id : null });
      emit('onboarding_wing_shot_selected', { source: 'onboarding' }, preview?.payload?.destination_id);
      const route = user && !user.is_anonymous ? await claimWingShotIntent({ storage: AsyncStorage, client: supabase, userId: user.id }) : null;
      await finishV2({ markSeen: markOnboardingSeen, router, account: false, storage: AsyncStorage, entryPath: entryPath || 'find_rate', platform: Platform.OS });
      router.push(route || '/auth/login');
    } catch { setError('Wing Shots are unavailable right now. Try again or explore; your preview stays on this device.'); }
    finally { busy.current = false; setSaving(false); }
  };
  const select = async (row, options = {}, source = 'search') => {
    if (options.signal?.aborted) throw new Error('Selection cancelled.');
    if (!isCanonicalDestination(row)) {
      setNotice('This restaurant is not verified yet. Search for another restaurant or explore.');
      return;
    }
    const selected = { ...row, saved_at: new Date().toISOString() };
    await AsyncStorage.setItem('buffago:onboarding_dest_v1', JSON.stringify(selected));
    if (options.signal?.aborted || !mounted.current) throw new Error('Selection cancelled.');
    draft.current = null;
    setDestination(selected);
    setError('');
    setStep('rating');
    emit('restaurant_selected', { source }, row.id);
    emit('quick_rating_started', { flow_variant: QUICK_RATING_FLOW_VARIANT }, row.id);
  };
  const save = async payload => {
    if (busy.current || !isCanonicalDestination(destination)) return;
    busy.current = true;
    setSaving(true);
    setError('');
    try {
      if (!draft.current) draft.current = createGuestRatingPreview({
        destination_id: destination.id, restaurant_name: destination.name, state_id: destination.state_id ?? state?.state_id ?? null,
        state_code: destination.state_id === state?.state_id ? state?.state_code : null, ...payload.scores,
        onboarding_seed: true, onboarding_version: 'v2', local_only: true,
        created_at: new Date().toISOString(),
      }, Crypto.randomUUID());
      draft.current = { ...draft.current, payload: { ...draft.current.payload, ...payload.scores } };
      await persistV2Preview(AsyncStorage, draft.current, saveGuestRatingPreview);
      if (!mounted.current) return;
      setPreview(draft.current);
      setStep('result');
      emit('guest_rating_preview_created', { status: 'local_preview' }, destination.id);
      emit('quick_rating_completed', { status: 'local_preview', flow_variant: QUICK_RATING_FLOW_VARIANT }, destination.id);
    } catch { setError('Could not finish saving. Retry, or cancel and explore. Any saved local preview is retained.'); }
    finally { busy.current = false; setSaving(false); }
  };
  const finish = async (account = false, path = entryPath || 'explore') => {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    try {
      await clearWingShotIntent(AsyncStorage);
      emit(account ? 'onboarding_account_offer_selected' : 'onboarding_explore_selected', { entry_path: path });
      await finishV2({ markSeen: markOnboardingSeen, router, account, storage: AsyncStorage, entryPath: path, platform: Platform.OS });
      emit('onboarding_completed', { entry_path: path, rating_status: preview ? 'local_preview' : 'none' });
    } catch { setError('Could not finish onboarding. Please try again.'); }
    finally { busy.current = false; setSaving(false); }
  };
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, padding: 24, gap: 18, justifyContent: 'center' }}>
          {step === 'welcome' && <>
            <Text variant="headlineLarge">Welcome to BuffaGo</Text>
            <Text variant="bodyLarge">Discover, rate, and track great wings.</Text>
            <Button mode="contained" onPress={() => { setEntryPath('find_rate'); setStep('search'); }}>Find / rate wings</Button>
            <Button mode="outlined" disabled={saving} onPress={() => finish(false, 'explore')}>Explore BuffaGo</Button>
          </>}
          {step === 'search' && <>
            <Text variant="headlineMedium">Find a restaurant</Text>
            <Text variant="bodyLarge">Search by name, then choose your spot. Rating is optional.</Text>
            <TextInput label="Restaurant name" value={query} onChangeText={setQuery} autoCorrect={false} />
            <Button mode="contained" onPress={() => setWingman(true)}>Can&apos;t find it? Ask Wingman</Button>
            {loading && <ActivityIndicator accessibilityLabel="Searching restaurants" />}
            {!loading && query.trim().length >= 2 && rows.length === 0 && <Text>No matching restaurants. Try another name or ask Wingman.</Text>}
            {rows.map(row => <List.Item key={row.id} title={row.name} titleNumberOfLines={3}
              description={[row.city, row.address].filter(Boolean).join(' - ')} descriptionNumberOfLines={3}
              onPress={() => select(row).catch(() => setError('Could not select this restaurant. Please retry.'))} />)}
            <Button onPress={() => setStep('welcome')}>Back</Button>
            <Button disabled={saving} onPress={() => finish()}>Explore BuffaGo</Button>
          </>}
          {step === 'rating' && <Text>Rate {destination?.name}</Text>}
          {step === 'result' && <>
            <Text variant="headlineMedium">Nice! Your wing rating</Text><Text variant="titleLarge">{destination?.name || preview?.payload?.restaurant_name || 'Your restaurant'}</Text>
            <Text style={{ fontSize: 40, fontWeight: '800' }}>{preview?.payload?.overall} / 10</Text>
            <Text variant="bodyLarge">Saved on this device only. This preview is not a public review and has not earned rewards. It stays here after sign-up; it is not automatically published or synced.</Text>
            {photoAvailable ? <><Text variant="headlineMedium">Got a picture of those wings?</Text><Text variant="bodyLarge">Create a free account to share a Wing Shot, keep your favorites, and build your wing journey.</Text><Text variant="bodySmall">Upload availability is checked after sign-in. Wing Shots are reviewed before they appear in the gallery.</Text></> : <Text>{user && !user.is_anonymous ? 'Wing Shots are unavailable right now. You can still explore BuffaGo; your preview stays on this device.' : 'Create a free account to keep your favorites and build your wing journey. Your rating preview stays on this device.'}</Text>}

          </>}
          {!!notice && <Text accessibilityRole="alert">{notice}</Text>}
          {!!error && <Text accessibilityRole="alert" style={{ color: theme.colors.error }}>{error}</Text>}
        </ScrollView>
      </KeyboardAvoidingView>
      {step === 'result' && <View style={{ paddingHorizontal: 24, paddingBottom: 16, gap: 10 }}>
            {!photoAvailable && (!user || user.is_anonymous) && <Button mode="contained" disabled={saving} contentStyle={{ minHeight: 48 }} onPress={() => finish(true)}>Create Free Account</Button>}
            {photoAvailable && <Button mode="contained" disabled={saving} labelStyle={{ fontSize: 16 }} contentStyle={{ minHeight: 48 }} onPress={addPhoto}>{user && !user.is_anonymous ? 'Add a Wing Shot' : 'Create Account & Add a Wing Shot'}</Button>}
            <Button mode="outlined" disabled={saving} labelStyle={{ fontSize: 16 }} contentStyle={{ minHeight: 48 }} onPress={() => finish()}>Explore BuffaGo</Button>
      </View>}
      <RatingWizardDialog visible={step === 'rating'} destinationName={destination?.name}
        flowVariant={QUICK_RATING_FLOW_VARIANT} saving={saving} finalizeLabel="Save local preview"
        onDismiss={() => setStep('search')} onFinalize={save} finalizeError={error} />
      <WingmanAddDialog visible={wingman} onDismiss={() => setWingman(false)} initialRestaurant={query}
        initialStateId={state?.state_id ?? null} initialStateCode={state?.state_code ?? null}
        userId={user && !user.is_anonymous ? user.id : null}
        onPickDestination={(row, options) => select(row, options, 'wingman')}
        showCloseOnResultMessage
        manualReviewQueuedMessage="This restaurant needs manual review. You can search for another restaurant or explore BuffaGo."
        onManualReviewQueued={async (suggestion, options = {}) => {
          if (options.signal?.aborted) throw new Error('Selection cancelled.');
          const guest = !user || user.is_anonymous;
          if (guest) await AsyncStorage.setItem('buffago:onboarding:dest_suggestion', JSON.stringify({
            ...suggestion, saved_at: new Date().toISOString(),
          }));
          if (options.signal?.aborted || !mounted.current) throw new Error('Selection cancelled.');
          setNotice(guest
            ? 'Saved on this device for review submission after sign-in. Search for another restaurant or explore.'
            : 'Sent for manual review. Search for another restaurant or explore.');
        }} />
    </SafeAreaView>
  );
}
