import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, Dialog, Divider, Portal, Text, useTheme } from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocationCtx } from '../providers/LocationProvider';
import { ENABLE_SAVED_DESTINATIONS, ENABLE_WING_JURY } from '../config/features';
import { supabase } from '../lib/supabase.js';
import {
  createGuestJurySession,
  getWingJuryPhotoBatch,
  getWingJuryReveal,
  recordWingJuryVerdict,
} from '../lib/wingJuryService.js';
import { useSavedDestinations } from '../hooks/useSavedDestinations';
import { saveSavedDestinationIntent } from '../lib/savedDestinations.js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import FeedbackState from './ui/FeedbackState';
import { accountUserId, createAccountScope, lookupAccount } from '../lib/accountBoundary.js';

const VERDICTS = [
  { value: -1, label: 'Dislike', icon: 'thumb-down-outline', color: '#E57373' },
  { value: 0, label: 'Average', icon: 'minus-circle-outline', color: '#F0BE62' },
  { value: 1, label: 'Like', icon: 'thumb-up-outline', color: '#78C996' },
];

const previewWingPhotoAsset = require('../assets/wing-user.png');
const previewWingPhotoUri = typeof previewWingPhotoAsset === 'string'
  ? previewWingPhotoAsset
  : previewWingPhotoAsset?.uri || previewWingPhotoAsset?.default?.uri || previewWingPhotoAsset?.default || null;

function readableNumber(value, fallback = '0') {
  return Number.isFinite(Number(value)) ? String(Number(value)) : fallback;
}

function RevealStat({ label, value, icon }) {
  const theme = useTheme();
  return (
    <View style={styles.stat}>
      <MaterialCommunityIcons name={icon} size={20} color={theme.colors.primary} />
      <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>{label}</Text>
      <Text variant="titleMedium" style={styles.statValue}>{value}</Text>
    </View>
  );
}

export default function WingJuryGame() {
  const theme = useTheme();
  const router = useRouter();
  const { preview } = useLocalSearchParams();
  const previewMode = String(preview || '');
  const visualPreview = __DEV__ && ['blind', 'rated', 'unrated', 'guest', 'exhausted'].includes(previewMode);
  const previewGuest = previewMode === 'guest';
  const previewRated = previewMode === 'rated';
  const { coords } = useLocationCtx();
  const sessionLocation = useRef(coords ? { ...coords } : null).current;
  const guestSession = useMemo(() => createGuestJurySession(), []);
  const saved = useSavedDestinations({ client: supabase, enabled: ENABLE_SAVED_DESTINATIONS });
  const [photos, setPhotos] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [status, setStatus] = useState(visualPreview ? (previewMode === 'exhausted' ? 'FEED_EXHAUSTED' : 'READY_TO_VOTE') : (ENABLE_WING_JURY ? 'LOADING' : 'DISABLED'));
  const [error, setError] = useState(null);
  const [reveal, setReveal] = useState(null);
  const [confirmedVote, setConfirmedVote] = useState(null);
  const [imageFailed, setImageFailed] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [authPromptVisible, setAuthPromptVisible] = useState(false);
  const requestRef = useRef(0);
  const loadingRef = useRef(false);
  const loadBatchRef = useRef(null);
  const accountScope = useRef(createAccountScope()).current;
  const accountRef = useRef(undefined);
  const actionRef = useRef(null);
  const closedRef = useRef(false);
  const initializeRef = useRef(null);
  const authIntentRef = useRef(null);
  const currentPhoto = photos[0] || null;
  const currentPhotoRef = useRef(null);
  currentPhotoRef.current = currentPhoto?.submission_id || null;
  const imageEpoch = accountScope.capture();
  const previewPhoto = useMemo(() => ({
    submission_id: `visual-preview-${previewMode || 'blind'}`,
    signed_url: previewWingPhotoUri,
    media_type: 'photo',
    expires_at: '2099-01-01T00:00:00Z',
  }), [previewMode]);

  const close = useCallback(() => {
    closedRef.current = true;
    authIntentRef.current = null;
    accountScope.invalidate();
    requestRef.current += 1;
    loadingRef.current = false;
    guestSession.clear();
    if (router.canGoBack?.()) router.back();
    else router.replace('/(tabs)/home');
  }, [accountScope, guestSession, router]);

  useEffect(() => {
    let alive = true;
    let authRevision = 0;
    accountScope.activate();
    const acceptAccount = (user) => {
      if (!alive || closedRef.current) return;
      const changed = accountScope.update(user);
      accountRef.current = accountUserId(user);
      setSignedIn(Boolean(accountRef.current));
      if (!changed || visualPreview) return;
      requestRef.current += 1;
      loadingRef.current = false;
      actionRef.current = null;
      currentPhotoRef.current = null;
      guestSession.clear();
      setPhotos([]);
      setCursor(null);
      setHasMore(true);
      setReveal(null);
      setConfirmedVote(null);
      setError(null);
      setImageFailed(false);
      setAuthPromptVisible(false);
      authIntentRef.current = null;
      setStatus(ENABLE_WING_JURY ? 'LOADING' : 'DISABLED');
      // Auth listeners must return before making another Supabase auth request.
      Promise.resolve().then(() => { if (alive) void loadBatchRef.current?.({ replace: true }); });
    };
    const initialize = () => {
      const initialRevision = authRevision;
      setStatus('LOADING');
      lookupAccount(supabase).then((user) => {
        if (initialRevision === authRevision) acceptAccount(user);
      }).catch((nextError) => {
        if (alive && !closedRef.current && initialRevision === authRevision) { setError(nextError); setStatus('ERROR'); }
      });
    };
    initializeRef.current = initialize;
    initialize();
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, userSession) => {
      authRevision += 1;
      acceptAccount(userSession?.user || null);
    });
    return () => { alive = false; accountScope.dispose(); requestRef.current += 1; guestSession.clear(); subscription?.subscription?.unsubscribe?.(); };
  }, [accountScope, guestSession, visualPreview]);

  const loadBatch = useCallback(async ({ replace = false } = {}) => {
    if (!ENABLE_WING_JURY || loadingRef.current || (!hasMore && !replace)) return;
    const request = ++requestRef.current;
    const epoch = accountScope.capture();
    const isCurrent = () => accountScope.current(epoch) && request === requestRef.current;
    loadingRef.current = true;
    setError(null);
    if (replace) setStatus('LOADING');
    try {
      const result = await getWingJuryPhotoBatch({
        client: supabase,
        location: sessionLocation,
        cursor: replace ? null : cursor,
        guestSession,
        enabled: ENABLE_WING_JURY,
        limit: 12,
        expectedUserId: accountRef.current,
        isCurrent,
      });
      if (!isCurrent()) return;
      setPhotos((current) => replace ? result.photos : [...current, ...result.photos]);
      setCursor(result.nextCursor || null);
      setHasMore(Boolean(result.hasMore));
      setImageFailed(false);
      setStatus(result.photos?.length ? 'READY_TO_VOTE' : result.hasMore ? 'FEED_CONTINUE' : 'FEED_EXHAUSTED');
    } catch (nextError) {
      if (isCurrent()) {
        setError(nextError);
        setStatus('ERROR');
      }
    } finally {
      if (isCurrent()) loadingRef.current = false;
    }
  }, [accountScope, sessionLocation, cursor, guestSession, hasMore]);

  loadBatchRef.current = loadBatch;

  useEffect(() => {
    if (visualPreview) {
      if (previewMode !== 'exhausted') setPhotos([previewPhoto]);
      return;
    }
    // The verified initial identity starts the feed in the auth effect.
    return () => { requestRef.current += 1; };
  }, [previewMode, previewPhoto, visualPreview]); // The game session owns its initial feed; location changes must not reshuffle it.

  const retry = useCallback(() => {
    if (accountRef.current === undefined) { initializeRef.current?.(); return; }
    if (status === 'REVEAL_ERROR' && confirmedVote && currentPhoto) {
      if (actionRef.current) return;
      const operation = {};
      actionRef.current = operation;
      const epoch = accountScope.capture();
      const photoId = currentPhoto.submission_id;
      const isCurrent = () => accountScope.current(epoch) && currentPhotoRef.current === photoId && actionRef.current === operation;
      setStatus('REVEAL_LOADING');
      void getWingJuryReveal({
        client: supabase,
        submissionId: currentPhoto.submission_id,
        guestVerdictRegistered: confirmedVote.status === 'guest',
        enabled: ENABLE_WING_JURY,
        expectedUserId: accountRef.current,
        isCurrent,
      }).then((nextReveal) => { if (isCurrent()) { setReveal(nextReveal); setStatus('REVEALED'); } }).catch((nextError) => { if (isCurrent()) { setError(nextError); setStatus('REVEAL_ERROR'); } }).finally(() => { if (actionRef.current === operation) actionRef.current = null; });
      return;
    }
    if (currentPhoto && status === 'ERROR') { setError(null); setStatus('READY_TO_VOTE'); return; }
    void loadBatch({ replace: true });
  }, [accountScope, confirmedVote, currentPhoto, loadBatch, status]);

  const submitVote = useCallback(async (vote) => {
    if (!currentPhoto || status !== 'READY_TO_VOTE' || actionRef.current) return;
    const epoch = accountScope.capture();
    const photoId = currentPhoto.submission_id;
    const operation = {};
    const isCurrent = () => accountScope.current(epoch) && currentPhotoRef.current === photoId && actionRef.current === operation;
    actionRef.current = operation;
    setStatus('SUBMITTING');
    setError(null);
    if (visualPreview) {
      setConfirmedVote({ status: previewGuest ? 'guest' : 'authenticated', vote, submission_id: currentPhoto.submission_id });
      setReveal({
        ok: true,
        restaurant: { id: previewRated ? 'preview-rated-restaurant' : 'preview-unrated-restaurant', name: previewRated ? 'QA Rated Wing House' : 'QA Unrated Wing Kitchen', address: '123 Fixture Street', city: 'Buffalo' },
        photo_like_count: 12,
        restaurant_rating: { average_weight_score: previewRated ? 91.4 : null },
        personal_rating: previewRated ? { weight_score: 94.2 } : null,
        favorite: previewRated,
        want_to_try: !previewRated,
        save_action: previewGuest ? 'sign_in_to_save' : (previewRated ? 'favorite' : 'wantToTry'),
      });
      setStatus('REVEALED');
      actionRef.current = null;
      return;
    }
    try {
      const result = await recordWingJuryVerdict({ client: supabase, photo: currentPhoto, vote, guestSession, enabled: ENABLE_WING_JURY, expectedUserId: accountRef.current, isCurrent });
      if (!isCurrent()) return;
      setConfirmedVote(result);
      setStatus('REVEAL_LOADING');
      try {
        const nextReveal = await getWingJuryReveal({
          client: supabase,
          submissionId: currentPhoto.submission_id,
          guestVerdictRegistered: result.status === 'guest',
          enabled: ENABLE_WING_JURY,
          expectedUserId: accountRef.current,
          isCurrent,
        });
        if (!isCurrent()) return;
        setReveal(nextReveal);
        setStatus('REVEALED');
      } catch (revealError) {
        if (!isCurrent()) return;
        setError(revealError);
        setStatus('REVEAL_ERROR');
      }
    } catch (nextError) {
      if (!isCurrent()) return;
      setError(nextError);
      setStatus('ERROR');
    } finally {
      if (isCurrent() && actionRef.current === operation) actionRef.current = null;
    }
  }, [accountScope, currentPhoto, guestSession, previewGuest, previewRated, status, visualPreview]);

  const nextPhoto = useCallback(() => {
    if (!currentPhoto || status !== 'REVEALED') return;
    if (visualPreview) {
      setPhotos([]);
      setReveal(null);
      setConfirmedVote(null);
      setStatus('FEED_EXHAUSTED');
      return;
    }
    setReveal(null);
    setConfirmedVote(null);
    setImageFailed(false);
    currentPhotoRef.current = photos[1]?.submission_id || null;
    setPhotos((current) => current.slice(1));
    setStatus(photos.length > 1 ? 'READY_TO_VOTE' : hasMore ? 'LOADING' : 'FEED_EXHAUSTED');
    if (photos.length <= 1 && hasMore) void loadBatch();
  }, [currentPhoto, hasMore, loadBatch, photos, status, visualPreview]);

  const skipBrokenPhoto = useCallback(() => {
    if (actionRef.current || !['READY_TO_VOTE', 'ERROR'].includes(status)) return;
    currentPhotoRef.current = photos[1]?.submission_id || null;
    setPhotos((current) => current.slice(1));
    setImageFailed(false);
    if (photos.length <= 1) {
      setStatus(hasMore ? 'LOADING' : 'FEED_EXHAUSTED');
      if (hasMore) void loadBatch();
    }
    else setStatus('READY_TO_VOTE');
  }, [hasMore, loadBatch, photos, status]);

  const saveRestaurant = useCallback(async () => {
    const epoch = accountScope.capture();
    const isCurrent = () => accountScope.current(epoch);
    const action = reveal?.save_action;
    const destinationId = reveal?.restaurant?.id;
    if (!action || !destinationId) return;
    if (action === 'sign_in_to_save' || !signedIn || previewGuest) {
      authIntentRef.current = { destinationId, kind: 'wantToTry', saved: true, epoch };
      if (!isCurrent()) return;
      setAuthPromptVisible(true);
      return;
    }
    if (!ENABLE_SAVED_DESTINATIONS) {
      Alert.alert('Saving is not available yet', 'Saved restaurants are enabled only in the controlled local preview right now.');
      return;
    }
    const kind = action === 'favorite' ? 'favorites' : 'wantToTry';
    const savedValue = action === 'favorite' ? !reveal.favorite : !reveal.want_to_try;
    try {
      await saved.mutate({ kind, destinationId, saved: savedValue });
      if (!isCurrent()) return;
      setReveal((current) => current ? { ...current, favorite: kind === 'favorites' ? savedValue : current.favorite, want_to_try: kind === 'wantToTry' ? savedValue : current.want_to_try } : current);
    } catch (nextError) {
      if (!isCurrent()) return;
      Alert.alert('Could not update saved restaurants', nextError?.message || 'Try again shortly.');
    }
  }, [accountScope, previewGuest, reveal, saved, signedIn]);

  if (status === 'DISABLED') return <FeedbackState icon="scale-balance" title="Wing Jury is coming soon" body="This local preview is disabled until the service and database release gates are complete." actionLabel="Return Home" onAction={() => router.replace('/(tabs)/home')} />;

  if (status === 'FEED_EXHAUSTED') return (
    <View style={[styles.center, { backgroundColor: theme.colors.background }]} testID="wing-jury-exhausted">
      <MaterialCommunityIcons name="trophy-outline" size={56} color={theme.colors.primary} />
      <Text variant="headlineSmall" style={styles.centerTitle}>You&apos;ve judged every wing on the menu!</Text>
      <Text style={styles.centerBody}>Check back later for more photos to judge.</Text>
      <Button mode="contained" onPress={() => router.replace('/(tabs)/home')} contentStyle={styles.buttonContent}>Return Home</Button>
    </View>
  );

  if (status === 'FEED_CONTINUE') return (
    <View testID="wing-jury-continue">
      <FeedbackState title="More wings to discover" body="Continue looking for photos to judge." actionLabel="Continue" onAction={() => { setStatus('LOADING'); void loadBatch(); }} />
      <Button mode="text" onPress={close}>Close</Button>
    </View>
  );

  if (!currentPhoto && status === 'ERROR') return <FeedbackState title="Wing Jury is unavailable" body={error?.message || 'Try again shortly.'} actionLabel="Try Again" onAction={retry} />;

  if (!currentPhoto || status === 'LOADING') return (
    <View style={[styles.center, { backgroundColor: theme.colors.background }]} testID="wing-jury-loading">
      <ActivityIndicator size="large" color={theme.colors.primary} />
      <Text style={styles.centerBody}>Finding wings to judge…</Text>
      <Button mode="text" onPress={close}>Close</Button>
    </View>
  );

  const isRevealed = ['REVEAL_LOADING', 'REVEALED', 'REVEAL_ERROR'].includes(status);
  const revealSaveLabel = reveal?.favorite ? 'Remove from Favorites' : reveal?.want_to_try ? 'Remove from Want to Try' : reveal?.save_action === 'favorite' ? 'Add to Favorites' : 'Add to Want to Try';
  const revealedRestaurant = reveal?.restaurant || {};
  const personalRating = reveal?.personal_rating?.weight_score;
  const wingdexAverage = reveal?.restaurant_rating?.average_weight_score;

  return (
    <>
    <ScrollView style={{ backgroundColor: theme.colors.background }} contentContainerStyle={styles.screen} testID="wing-jury-screen">
      <View style={styles.headerRow}>
        <View>
          <Text variant="labelLarge" style={{ color: theme.colors.primary, letterSpacing: 1.5 }}>THE BLIND TEST</Text>
          <Text variant="headlineMedium" style={styles.title}>Wing Jury</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Close Wing Jury" onPress={close} style={styles.closeButton} hitSlop={8}>
          <MaterialCommunityIcons name="close" size={24} color={theme.colors.onSurface} />
        </Pressable>
      </View>

      <Text style={styles.prompt}>What&apos;s your verdict?</Text>
      <Card style={styles.photoCard} mode="contained">
        {imageFailed ? (
          <View style={styles.imageError} testID="wing-jury-image-error">
            <MaterialCommunityIcons name="image-off-outline" size={42} color={theme.colors.onSurfaceVariant} />
            <Text style={styles.centerBody}>This photo is unavailable.</Text>
            <Button mode="contained-tonal" onPress={skipBrokenPhoto} disabled={!['READY_TO_VOTE', 'ERROR'].includes(status)}>Skip photo</Button>
          </View>
        ) : (
          <Image
            key={currentPhoto.submission_id}
            source={{ uri: currentPhoto.signed_url }}
            style={styles.photo}
            resizeMode="cover"
            accessibilityLabel="Wing photo to judge"
            onError={() => { if (accountScope.current(imageEpoch) && currentPhotoRef.current === currentPhoto.submission_id) setImageFailed(true); }}
          />
        )}
      </Card>

      {!isRevealed && !imageFailed ? (
        <View style={styles.verdictRow} accessibilityLabel="Choose your Wing Jury verdict">
          {VERDICTS.map((verdict) => {
            const disabled = status !== 'READY_TO_VOTE';
            return (
              <Pressable
                key={verdict.value}
                testID={`wing-jury-verdict-${verdict.value}`}
                accessibilityRole="button"
                accessibilityLabel={verdict.label}
                accessibilityState={{ disabled }}
                disabled={disabled}
                onPress={() => submitVote(verdict.value)}
                style={({ pressed }) => [styles.verdict, { borderColor: verdict.color }, pressed && styles.pressed, disabled && styles.disabled]}
              >
                <MaterialCommunityIcons name={verdict.icon} size={27} color={verdict.color} />
                <Text style={[styles.verdictText, { color: verdict.color }]}>{verdict.label}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {status === 'SUBMITTING' ? <View style={styles.progressRow}><ActivityIndicator color={theme.colors.primary} /><Text>Locking in your verdict…</Text></View> : null}
      {status === 'REVEAL_LOADING' ? <View style={styles.progressRow}><ActivityIndicator color={theme.colors.primary} /><Text>Revealing the wing spot…</Text></View> : null}

      {status === 'ERROR' ? <FeedbackState compact icon="wifi-alert" title="Your verdict wasn't submitted" body={error?.message || 'The photo is still here. Try again when you are ready.'} actionLabel="Try Again" onAction={retry} /> : null}
      {status === 'REVEAL_ERROR' ? <FeedbackState compact icon="alert-circle-outline" title="Your verdict is saved" body="We could not load the restaurant reveal yet. Retry the reveal without voting again." actionLabel="Retry Reveal" onAction={retry} /> : null}

      {status === 'REVEALED' && reveal ? (
        <Card style={styles.revealCard} mode="contained" testID="wing-jury-reveal">
          <Text variant="labelLarge" style={{ color: theme.colors.primary, letterSpacing: 1.2 }}>THE REVEAL</Text>
          <Text variant="headlineSmall" style={styles.restaurantName}>{revealedRestaurant.name || 'Wing spot'}</Text>
          {(revealedRestaurant.address || revealedRestaurant.city) ? <Text style={styles.address}>{[revealedRestaurant.address, revealedRestaurant.city].filter(Boolean).join(', ')}</Text> : null}
          <Divider style={styles.divider} />
          <View style={styles.statsRow}>
            <RevealStat label="Photo Likes" value={`${readableNumber(reveal.photo_like_count)} Likes`} icon="thumb-up-outline" />
            <RevealStat label="Wingdex Average" value={wingdexAverage == null ? 'Not rated yet' : readableNumber(wingdexAverage)} icon="star-outline" />
          </View>
          {personalRating != null ? <Text style={styles.personalRating}>Your Last Rating: {readableNumber(personalRating)}</Text> : null}
          <Button mode="outlined" icon={reveal?.favorite ? 'heart' : reveal?.want_to_try ? 'bookmark-check' : 'bookmark-plus-outline'} onPress={saveRestaurant} loading={saved.isPending?.(reveal?.save_action === 'favorite' ? 'favorites' : 'wantToTry', revealedRestaurant.id)} contentStyle={styles.buttonContent} style={styles.revealAction}>{revealSaveLabel}</Button>
          <View style={styles.revealButtons}>
            <Button mode="contained" onPress={nextPhoto} contentStyle={styles.buttonContent} style={styles.revealButton}>Next Photo</Button>
            <Button mode="outlined" onPress={close} contentStyle={styles.buttonContent} style={styles.revealButton}>Close</Button>
          </View>
        </Card>
      ) : null}
    </ScrollView>
    <Portal>
      <Dialog visible={authPromptVisible} onDismiss={() => { authIntentRef.current = null; setAuthPromptVisible(false); }} testID="wing-jury-auth-prompt">
        <Dialog.Title>Save this restaurant</Dialog.Title>
        <Dialog.Content><Text>Found wings worth trying? Sign in to save this restaurant to your Want to Try list.</Text></Dialog.Content>
        <Dialog.Actions style={styles.authActions}>
          <Button mode="contained" contentStyle={styles.buttonContent} style={styles.authPrimary} onPress={async () => {
            const intent = authIntentRef.current;
            if (!intent) return;
            const isCurrent = () => !closedRef.current && accountScope.current(intent.epoch);
            const stored = await saveSavedDestinationIntent(intent, AsyncStorage, isCurrent).catch(() => false);
            if (!stored || !isCurrent()) return;
            authIntentRef.current = null;
            setAuthPromptVisible(false); router.push('/auth/login');
          }}>Sign In / Create Account</Button>
          <Button mode="text" contentStyle={styles.buttonContent} onPress={() => { authIntentRef.current = null; setAuthPromptVisible(false); }}>Not Now</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 16, paddingTop: 22, paddingBottom: 32, gap: 14 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontWeight: '900', letterSpacing: 0.3 },
  prompt: { fontSize: 18, fontWeight: '800', textAlign: 'center', marginTop: 4 },
  closeButton: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.07)' },
  photoCard: { overflow: 'hidden', borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.06)' },
  photo: { width: '100%', height: 300, backgroundColor: 'rgba(255,255,255,0.05)' },
  imageError: { height: 300, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 20 },
  verdictRow: { flexDirection: 'row', gap: 8 },
  verdict: { flex: 1, minHeight: 74, borderWidth: 1, borderRadius: 16, alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.035)' },
  verdictText: { fontWeight: '900', fontSize: 12 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.45 },
  progressRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  revealCard: { borderRadius: 20, padding: 16, backgroundColor: 'rgba(255,255,255,0.055)' },
  restaurantName: { fontWeight: '900', marginTop: 8, flexShrink: 1 },
  address: { opacity: 0.72, marginTop: 8, lineHeight: 20 },
  divider: { marginVertical: 14 },
  statsRow: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, minHeight: 86, borderRadius: 14, padding: 10, backgroundColor: 'rgba(255,255,255,0.05)', gap: 3 },
  statValue: { fontWeight: '900' },
  personalRating: { marginTop: 12, fontWeight: '800' },
  revealAction: { marginTop: 16, borderRadius: 14 },
  revealButtons: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginTop: 16 },
  revealButton: { flexGrow: 1, minWidth: 112, borderRadius: 14 },
  authActions: { flexDirection: 'column', alignItems: 'stretch', gap: 8, paddingHorizontal: 24, paddingBottom: 20 },
  authPrimary: { borderRadius: 14 },
  buttonContent: { minHeight: 44 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  centerTitle: { textAlign: 'center', fontWeight: '900' },
  centerBody: { textAlign: 'center', opacity: 0.74, lineHeight: 20 },
});
