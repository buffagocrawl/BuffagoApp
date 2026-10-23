import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Button, Text } from 'react-native-paper';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { confirmOnboardingRating, onboardingRatingError } from '../lib/confirmOnboardingRating';
import { WingShotComposer } from './wingShots/WingShotComposer';
import { loadGuestRatingPreview } from '../lib/guestRatingPreview';

export default function OnboardingRatingConfirmation({ context, userId, handoffId, onClose }) {
  const [receipt, setReceipt] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [score, setScore] = useState(null);
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let active = true;
    loadGuestRatingPreview(AsyncStorage).then(preview => {
      if (active && preview?.preview_id === context.previewId && preview.payload?.destination_id === context.destinationId) setScore(preview.payload.overall);
    }).catch(() => {});
    return () => { active = false; };
  }, [context.previewId, context.destinationId]);
  const confirm = async () => {
    if (busy.current) return;
    busy.current = true; setSaving(true); setError('');
    try {
      const saved = await confirmOnboardingRating({ storage: AsyncStorage, client: supabase, handoffId, userId,
        locate: async () => {
          const permission = await Location.requestForegroundPermissionsAsync();
          if (permission.status !== 'granted') throw new Error('location_permission_required');
          return Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High, maximumAge: 1000, timeout: 5000 });
        } });
      if (mounted.current) setReceipt(saved);
    } catch (e) { if (mounted.current) setError(onboardingRatingError(e)); }
    finally { busy.current = false; if (mounted.current) setSaving(false); }
  };
  if (receipt?.wing_shot_eligible === true) return <WingShotComposer source="onboarding" destinationId={context.destinationId}
    restaurantName={context.restaurantName} eligibleRatingId={receipt.rating_id} userId={userId} onClose={onClose} />;
  return <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 16 }}>
    <Text variant="headlineMedium">{receipt ? 'Your rating is saved' : 'Save your first wing rating?'}</Text>
    <Text variant="titleLarge">{context.restaurantName}</Text>
    {score !== null && <Text variant="headlineLarge">{score} / 10</Text>}
    <Text>{receipt ? `This rating is not eligible for a Wing Shot (${receipt.wing_shot_eligibility_reason || 'unverified_rating'}). You can continue to Home.` : 'Your rating is still a local preview. Confirm to publish it to your account. We will verify your location at the restaurant before opening the photo uploader.'}</Text>
    {!!error && <Text accessibilityRole="alert">{error}</Text>}
    {!receipt && <Button mode="contained" loading={saving} disabled={saving} onPress={confirm}>Confirm & Save Rating</Button>}
    <Button disabled={saving} onPress={onClose}>Continue to BuffaGo</Button>
  </View>;
}
