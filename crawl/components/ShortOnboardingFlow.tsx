import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { Button, Text } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import { trackEvent } from '../lib/analytics';
import { buildExperimentMetadata, recoveryState, sanitizedErrorCode } from '../lib/onboardingExperiment';

const DONE_KEY = 'buffago:onboarding_done_v3';
const PREFS_KEY = 'buffago:onboarding:prefs';
const STATE_KEY = 'buffago:onboarding_state_v2';
const DEST_KEY = 'buffago:onboarding_dest_v1';
const VERSION = 'short_v1';

function meta(experimentUserId: string, stepName: string, extra: Record<string, any> = {}) {
  return buildExperimentMetadata({ experimentUserId, assignment: 'treatment', onboardingVersion: VERSION, stepName, ...extra } as any);
}

export default function ShortOnboardingFlow({ experimentUserId }: { experimentUserId: string }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [preference, setPreference] = useState<number | null>(null);
  const [states, setStates] = useState<any[]>([]);
  const [state, setState] = useState<any>(null);
  const [restaurants, setRestaurants] = useState<any[]>([]);
  const [restaurant, setRestaurant] = useState<any>(null);
  const [restaurantHash, setRestaurantHash] = useState<string | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [error, setError] = useState('');
  const startedAt = useMemo(() => Date.now(), []);

  useEffect(() => {
    trackEvent({ eventName: 'experiment_exposure', screen: 'onboarding', metadata: meta(experimentUserId, 'exposure') });
    trackEvent({ eventName: 'experiment_assignment', screen: 'onboarding', metadata: meta(experimentUserId, 'assignment') });
    trackEvent({ eventName: 'onboarding_started', screen: 'onboarding', metadata: meta(experimentUserId, 'preference_choice') });
    supabase.from('states').select('state_id,state_code,state_name').order('state_name').then(({ data }) => setStates(data || []));
  }, [experimentUserId]);

  useEffect(() => {
    if (!state?.state_id) return;
    supabase.from('destinations').select('id,name,address,city').eq('state_id', state.state_id).order('name').limit(100)
      .then(({ data }) => setRestaurants(data || []));
  }, [state?.state_id]);

  const choosePreference = async (value: number) => {
    setPreference(value);
    await AsyncStorage.setItem(PREFS_KEY, JSON.stringify({ sauce_pref: value, experiment: VERSION }));
    await trackEvent({ eventName: 'onboarding_step_completed', screen: 'onboarding', metadata: meta(experimentUserId, 'preference_choice', { elapsed_ms: Date.now() - startedAt }) });
    setStep(1);
  };

  const chooseRestaurant = async (value: any) => {
    setRestaurant(value);
    const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, String(value.id));
    setRestaurantHash(hash);
    await AsyncStorage.multiSet([
      [STATE_KEY, JSON.stringify(state)],
      [DEST_KEY, JSON.stringify(value)],
    ]);
    await trackEvent({ eventName: 'onboarding_step_completed', screen: 'onboarding', metadata: meta(experimentUserId, 'restaurant_selection', { restaurant_id_hash: hash, elapsed_ms: Date.now() - startedAt }) });
    setStep(2);
  };

  const finish = async () => {
    await AsyncStorage.setItem(DONE_KEY, '1');
    await trackEvent({ eventName: 'experiment_exit', screen: 'onboarding', metadata: meta(experimentUserId, 'exit', { restaurant_id_hash: restaurantHash, elapsed_ms: Date.now() - startedAt, confirmation_state: rating == null ? 'skipped' : 'local_preview_only' }) });
    router.replace('/(tabs)/home');
  };

  const saveOptionalRating = async () => {
    const submissionId = `onboarding-${experimentUserId}-${Date.now()}`;
    setError('');
    await trackEvent({ eventName: 'rating_operation_started', screen: 'onboarding', metadata: meta(experimentUserId, 'quick_rating', { restaurant_id_hash: restaurantHash, rating_mode: 'optional_overall', submission_id: submissionId, confirmation_state: 'pending' }) });
    // Guest onboarding has no server-confirmed write path. Keep the preview local
    // and never emit a confirmation claim without an authoritative response.
    try {
      await AsyncStorage.setItem('buffago:onboarding:seed_rating', JSON.stringify({ destination_id: restaurant.id, overall: rating, submission_id: submissionId, local_only: true }));
      await trackEvent({ eventName: 'rating_operation_failed', screen: 'onboarding', metadata: meta(experimentUserId, 'quick_rating', { restaurant_id_hash: restaurantHash, submission_id: submissionId, confirmation_state: 'not_submitted', error_code: 'authentication_required', correlation_id: submissionId }) });
      await trackEvent({ eventName: 'rating_recovery_state_shown', screen: 'onboarding', metadata: meta(experimentUserId, 'quick_rating', { restaurant_id_hash: restaurantHash, submission_id: submissionId, confirmation_state: recoveryState({ code: 'authentication_required' }), error_code: sanitizedErrorCode({ code: 'authentication_required' }), correlation_id: submissionId }) });
    } catch (e) {
      setError('We could not save that preview. You can continue without rating.');
      await trackEvent({ eventName: 'rating_operation_failed', screen: 'onboarding', metadata: meta(experimentUserId, 'quick_rating', { restaurant_id_hash: restaurantHash, submission_id: submissionId, error_code: sanitizedErrorCode(e), confirmation_state: 'unknown', correlation_id: submissionId }) });
    }
    await finish();
  };

  return <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, gap: 16 }}>
    {step === 0 ? <View><Text variant="headlineMedium">Make Buffago yours</Text><Text>Select one preference to get started.</Text><Button mode={preference === 1 ? 'contained' : 'outlined'} onPress={() => choosePreference(1)}>Saucy</Button><Button mode={preference === 2 ? 'contained' : 'outlined'} onPress={() => choosePreference(2)}>Dry rub</Button></View> : null}
    {step === 1 ? <View><Text variant="headlineMedium">Pick a wing spot</Text>{states.slice(0, 20).map((item) => <Button key={item.state_id} onPress={() => setState(item)} mode={state?.state_id === item.state_id ? 'contained' : 'outlined'}>{item.state_name || item.state_code}</Button>)}{state ? restaurants.slice(0, 20).map((item) => <Button key={item.id} onPress={() => chooseRestaurant(item)}>{item.name}</Button>) : null}</View> : null}
    {step === 2 ? <View><Text variant="headlineMedium">Quick rating (optional)</Text><Text>{restaurant?.name}</Text>{[1, 2, 3, 4, 5].map((value) => <Pressable key={value} onPress={() => setRating(value)}><Text style={{ padding: 12, fontWeight: rating === value ? '900' : '400' }}>{value} / 5</Text></Pressable>)}{error ? <Text>{error}</Text> : null}<Button mode="contained" onPress={rating == null ? finish : saveOptionalRating}> {rating == null ? 'Continue without rating' : 'Save preview and continue'} </Button></View> : null}
  </ScrollView>;
}
