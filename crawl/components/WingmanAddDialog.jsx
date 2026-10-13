import { bounded, errorBody, wingmanError, wingmanRequest } from '../lib/wingmanAsync';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, ScrollView, Pressable, Alert, Modal, Keyboard, KeyboardAvoidingView, Platform } from 'react-native';
import { Dialog, Portal, Text, Button, TextInput, ActivityIndicator } from 'react-native-paper';
import { scheduleWingmanFocus } from '../lib/wingmanFocus';
import { canApproveWingman, formatWingmanConfidence, sameWingmanLocation, wingmanPlaceNameMatches } from '../supabase/functions/_shared/wingmanConfidence';
import { supabase } from '../lib/supabase.js';
import { WingmanService } from '../lib/Wingman/WingmanService.ts';

const formatWingmanFunctionError = wingmanError;

function canAddWingmanResult(result) {
  return canApproveWingman({ matchConfidence: result?.ai?.confidence, wingConfidence: result?.ai?.wingsProbability,
    verifiedRestaurant: result?.success === true && result?.place?.found === true && result?.ai?.verifiedPlace === true && result?.ai?.isRealRestaurant === true,
    locationStatus: result?.ai?.locationStatus, needsCity: result?.decision === 'needs_city',
    needsMoreInfo: result?.decision === 'needs_more_info', wingEvidenceStatus: result?.ai?.wingEvidenceStatus });
}

/** @param {{visible: boolean, onDismiss?: () => void, initialRestaurant?: string, initialStateId?: number|null, initialStateCode?: string|null, userId?: string|null, onPickDestination?: (destination: {id: string, name: string|null, address: string|null, city: string|null, lat?: number|null, lng?: number|null}) => void, onManualReviewQueued?: (suggestion: unknown) => void, manualReviewQueuedMessage?: string, showCloseOnResultMessage?: boolean}} props */
export default function WingmanAddDialog({
  visible,
  onDismiss,
  initialRestaurant = '',
  initialStateId = null,
  initialStateCode = null,
  userId = null,
  onPickDestination,
  onManualReviewQueued,
  manualReviewQueuedMessage = 'Wingman could not verify they have wings on their menu. This has been queued for review by the BuffaGo team.',
  showCloseOnResultMessage = false,
}) {
  const [restaurantName, setRestaurantName] = useState(initialRestaurant || '');
  const [stateId, setStateId] = useState(initialStateId ?? null);
  const [stateCode, setStateCode] = useState(initialStateCode ?? null);
  const [city, setCity] = useState('');
  const [extraInfo, setExtraInfo] = useState('');
  const [states, setStates] = useState([]);
  const [loadingStates, setLoadingStates] = useState(false);

  const [step, setStep] = useState('state'); // state | searching | city | extra | result
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [candidate, setCandidate] = useState(null);
  const searchInFlightRef = useRef(false);
  const insertInFlightRef = useRef(false);
  const verifyInFlightRef = useRef(false);
  const wasVisibleRef = useRef(false);
  const selectionInFlightRef = useRef(false);
  const lifecycle = useRef(new AbortController());
  useEffect(() => {
    lifecycle.current = new AbortController();
    if (!visible) lifecycle.current.abort();
    return () => lifecycle.current.abort();
  }, [visible]);
  // Capture a dialog generation. Late completions cannot change a reopened dialog.
  const operation = () => {
    const controller = lifecycle.current;
    const current = () => !controller.signal.aborted && lifecycle.current === controller;
    const guarded = setter => value => { if (current()) setter(value); };
    return { current, signal: controller.signal, wait: promise => bounded(promise, 45000, controller.signal),
      setLoading: guarded(setLoading), setMessage: guarded(setMessage),
      setStep: guarded(setStep), setCandidate: guarded(setCandidate) };
  };
  const dismiss = useCallback(() => {
    lifecycle.current.abort();
    setLoading(false);
    onDismiss?.();
  }, [onDismiss]);
  const nameInput = useRef(null);
  const cityInput = useRef(null);
  const extraInput = useRef(null);
  const [modalReady, setModalReady] = useState(false);
  const focusInput = useCallback(() => step === 'city' ? cityInput.current
    : step === 'extra' ? extraInput.current : step === 'state' ? nameInput.current : null, [step]);
  useEffect(() => {
    if (!visible) { setModalReady(false); return; }
    if (!modalReady || loading) return;
    return scheduleWingmanFocus(focusInput);
  }, [visible, modalReady, loading, focusInput]);

  useEffect(() => {
    const justOpened = visible && !wasVisibleRef.current;
    wasVisibleRef.current = visible;

    if (!justOpened) return;

    setRestaurantName(initialRestaurant || '');
    setStateId(initialStateId ?? null);
    setStateCode(initialStateCode ?? null);
    setCity('');
    setExtraInfo('');
    setMessage('');
    setCandidate(null);
    searchInFlightRef.current = false;
    insertInFlightRef.current = false;
    verifyInFlightRef.current = false;
    setLoading(false);
    selectionInFlightRef.current = false;
    setStep('state');
  }, [visible, initialRestaurant, initialStateId, initialStateCode]);

  useEffect(() => {
    if (!visible) return;

    let alive = true;
    (async () => {
      setLoadingStates(true);
      try {
        const { data, error } = await bounded(supabase
          .from('states')
          .select('state_id, state_code, state_name')
          .order('state_name', { ascending: true }), 15000, lifecycle.current.signal);

        if (error) throw error;
        if (alive) setStates(data || []);
      } catch (e) {
        console.warn('load states failed:', e?.message || e);
        if (alive) { setStates([]); setMessage('Could not load states. Close and reopen to retry.'); }
      } finally {
        if (alive) setLoadingStates(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [visible]);

  const selectedStateLabel = useMemo(() => {
    const match = states.find((s) => Number(s.state_id) === Number(stateId));
    return match ? `${match.state_name} (${match.state_code})` : stateCode || 'Select a state';
  }, [states, stateId, stateCode]);

  const buildRawInput = useCallback(() => {
    const parts = [restaurantName?.trim(), city?.trim(), extraInfo?.trim()].filter(Boolean);
    return parts.join(' ');
  }, [restaurantName, city, extraInfo]);

  const canSearch =
    !loading &&
    !!restaurantName.trim() &&
    !!stateId &&
    !!stateCode &&
    (step !== 'city' || !!city.trim()) &&
    (step !== 'extra' || !!extraInfo.trim());

  const findExistingDestinationCandidate = useCallback(async ({ ai, stateId: sid }) => {
    const { wait } = operation();
    const normalizedName = String(ai?.normalizedName || '').trim();
    const cityName = String(ai?.city || city || '').trim();

    if (!normalizedName || !sid) return null;

    try {
      if (ai?.existingDestinationId) {
        const { data, error } = await wait(supabase.from('destinations').select('id,name,address,city,lat,lng,state_id')
          .eq('id',ai.existingDestinationId).eq('state_id',sid).maybeSingle());
        if (error) throw error;
        return data || null;
      }
      const { data, error } = await wait(supabase.from('destinations')
        .select('id,name,address,city,lat,lng,state_id').eq('state_id',sid)
        .ilike('name',`%${normalizedName}%`).limit(25));
      if (error) throw error;
      const matches = (data || []).filter(row => wingmanPlaceNameMatches(normalizedName,row.name)
        && sameWingmanLocation(row,{city:cityName,address:ai?.address}));
      return matches.length === 1 ? matches[0] : null;
    } catch (e) {
      console.warn('findExistingDestinationCandidate failed:', e?.message || e);
      throw e;
    }
  }, [city]);

  const handleUseDestination = useCallback(async (row) => {
    if (!row?.id || selectionInFlightRef.current) return false;
    const { current, signal, wait, setLoading, setMessage, setStep } = operation();
    selectionInFlightRef.current = true;
    setLoading(true);
    try {
      await wait(Promise.resolve(onPickDestination?.(row, { signal })));
      if (!current()) return false;
      onDismiss?.();
      return true;
    } catch (error) {
      setMessage(await wingmanError(error));
      setStep('result');
      return false;
    } finally {
      setLoading(false);
      if (current()) selectionInFlightRef.current = false;
    }
  }, [onPickDestination, onDismiss]);

  const insertWingmanDestination = useCallback(async (row) => {
    const { current, signal, wait, setLoading, setMessage, setStep, setCandidate } = operation();
    if (!current() || !row?.name || !stateId) return;
    if (insertInFlightRef.current) return;

    insertInFlightRef.current = true;
    setLoading(true);
    setMessage('Wingman is adding that restaurant.');

    try {
      const { data: inserted, error: insertErr } = await wait(wingmanRequest(requestSignal => supabase.functions.invoke('wingman-intake', {
        signal: requestSignal,
        body: {
          action: 'insertDestination',
          restaurant: row.name,
          rawInput: [row.name, row.city, row.address].filter(Boolean).join(' '),
          city: row.city ?? city?.trim() ?? null,
          extraInfo: extraInfo?.trim() || null,
          stateId: Number(stateId),
          stateCode: stateCode ? String(stateCode) : null,
          destination: {
            name: row.name,
            address: row.address ?? null,
            city: row.city ?? null,
            lat: row.lat ?? null,
            lng: row.lng ?? null,
          },
        },
      }), 45000, signal));

      if (insertErr) {
        if (insertErr.context?.status === 422 && typeof insertErr.context.clone === 'function') {
          const rejected = await wait(errorBody(insertErr));
          return { reviewRequired: true, result: { ai: rejected?.result ? new WingmanService().parseAssessment(rejected.result) : null,
            place: rejected?.result ? { name: rejected.result.normalized_name, address: rejected.result.address,
              city: rejected.result.city, lat: rejected.result.lat, lng: rejected.result.lng } : null,
            decisionReason: rejected?.review_reason || 'manual_review_required' } };
        }
        throw insertErr;
      }

      const insertedRow = inserted?.destination;
      if (!insertedRow?.id) {
        setMessage('Wingman could not confirm the saved restaurant. Please retry.');
        setStep('result');
        return;
      }

      // Retain the authoritative row if local selection fails, so retry selects
      // it without another verification/creation request.
      setCandidate({ type: 'existing', row: insertedRow });
      if (await wait(handleUseDestination(insertedRow))) return insertedRow;
    } catch (e) {
      console.warn('insertWingmanDestination failed:', e);
      setMessage(await formatWingmanFunctionError(e));
      setStep('result');
    } finally {
      setLoading(false);
      if (current()) insertInFlightRef.current = false;
    }
  }, [city, extraInfo, handleUseDestination, stateCode, stateId]);

  const sendManualReview = useCallback(async (result, row) => {
    const { current, signal, wait, setLoading, setMessage, setStep, setCandidate } = operation();
    if (!current()) return;
    const suggestionPayload = {
      state_id: stateId ? Number(stateId) : null,
      restaurant_name:
        result?.suggestionInsert?.restaurantName ||
        row?.name ||
        restaurantName.trim(),
      address: result?.suggestionInsert?.address ?? result?.place?.address ?? row?.address ?? null,
    };

    if (!userId || !stateId) {
      setCandidate(null);
      if (!onManualReviewQueued) throw new Error('Sign in to submit this restaurant for review.');
      await wait(Promise.resolve(onManualReviewQueued(suggestionPayload, { signal })));
      setMessage('Saved on this device for submission after sign-in. Pick an existing restaurant to continue onboarding.');
      setStep('result');
      return;
    }

    const { error: suggestionErr } = await wait(supabase
      .from('destination_suggestions')
      .insert({
        user_id: userId,
        state_id: suggestionPayload.state_id,
        restaurant_name: suggestionPayload.restaurant_name,
        address: suggestionPayload.address,
        verification_evidence: {
          source: 'wingman',
          decisionReason: result?.decisionReason ?? null,
          ai: result?.ai ?? null,
          place: result?.place ?? null,
          submittedDetails: { name: suggestionPayload.restaurant_name, address: suggestionPayload.address, state_id: suggestionPayload.state_id, city: result?.place?.city ?? result?.ai?.city ?? row?.city ?? city?.trim() ?? null, lat: result?.place?.lat ?? result?.ai?.lat ?? row?.lat ?? null, lng: result?.place?.lng ?? result?.ai?.lng ?? row?.lng ?? null, extraInfo: extraInfo?.trim() || null },
        },
      }));

    if (suggestionErr) throw suggestionErr;

    setCandidate(null);
    setMessage(manualReviewQueuedMessage);
    setStep('result');
    await wait(Promise.resolve(onManualReviewQueued?.(suggestionPayload, { signal })));
  }, [city, extraInfo, manualReviewQueuedMessage, onManualReviewQueued, restaurantName, stateId, userId]);

  const verifyWingsAndAdd = useCallback(async (row) => {
    const { current, signal, wait, setLoading, setMessage, setStep, setCandidate } = operation();
    if (!current() || !row?.name || !stateId || !stateCode) return;
    if (verifyInFlightRef.current || insertInFlightRef.current || selectionInFlightRef.current || searchInFlightRef.current) return;

    verifyInFlightRef.current = true;
    setLoading(true);
    if (canAddWingmanResult(candidate?.result)) {
      try {
        const inserted = await insertWingmanDestination(row);
        if (inserted?.reviewRequired) await sendManualReview(inserted.result, row);
        return;
      } catch (error) {
        setMessage(await wingmanError(error));
        setStep('result');
        return;
      } finally {
        setLoading(false);
        if (current()) verifyInFlightRef.current = false;
      }
    }

    setMessage('Hold on while Wingman does a deeper dive to see if they have wings on their menu.');

    try {
      const wingman = new WingmanService();
      const result = await wait(wingman.run({
        rawInput: [row.name, row.city, row.address].filter(Boolean).join(' '),
        restaurantName: row.name,
        candidateAddress: row.address ?? null,
        city: row.city ?? city?.trim() ?? null,
        extraInfo: [
          row.address ? `Confirmed address: ${row.address}` : null,
          extraInfo?.trim() || null,
        ]
          .filter(Boolean)
          .join(' '),
        stateId: Number(stateId),
        stateCode: String(stateCode),
        userId,
        wingVerification: true,
      }));

      if (result?.error) throw new Error(result.error);
      if (String(result?.error || '').toLowerCase().includes('too many requests')) {
        setMessage('Too many requests. Give it a little time and try again.');
        setStep('result');
        return;
      }

      if (canAddWingmanResult(result)) {
        const added = await insertWingmanDestination({
          ...row,
          name: result.place?.name || result.ai?.normalizedName || row.name,
          address: result.place?.address ?? result.ai?.address ?? row.address ?? null,
          city: result.place?.city ?? result.ai?.city ?? row.city ?? null,
          lat: result.place?.lat ?? result.ai?.lat ?? row.lat ?? null,
          lng: result.place?.lng ?? result.ai?.lng ?? row.lng ?? null,
        });
        if (added?.id && current()) {
          Alert.alert(
            'Wings confirmed',
            'Wingman was able to confirm they have wings on the menu. It has been added.'
          );
        }
        if (added?.reviewRequired) await sendManualReview(added.result, row);
        return;
      }

      await sendManualReview(result, row);
    } catch (e) {
      console.warn('verifyWingsAndAdd failed:', e);
      const errorMessage = String(e?.message || e || 'Wingman could not verify wings for that restaurant.');
      setMessage(
        errorMessage.toLowerCase().includes('too many requests')
          ? 'Too many requests. Give it a little time and try again.'
          : errorMessage
      );
      setStep('result');
    } finally {
      setLoading(false);
      if (current()) verifyInFlightRef.current = false;
    }
  }, [
    city,
    candidate?.result,
    extraInfo,
    insertWingmanDestination,
    sendManualReview,
    stateCode,
    stateId,
    userId,
  ]);

  const runWingman = useCallback(async () => {
    const { current, signal, wait, setLoading, setMessage, setStep, setCandidate } = operation();
    if (searchInFlightRef.current || verifyInFlightRef.current || insertInFlightRef.current || selectionInFlightRef.current) return;

    const rawInput = buildRawInput();

    if (!restaurantName?.trim()) {
      setMessage('Enter a restaurant name first.');
      return;
    }

    if (!stateId || !stateCode) {
      setStep('state');
      setMessage('Choose a state first.');
      return;
    }

    searchInFlightRef.current = true;
    setLoading(true);
    setMessage('');
    setCandidate(null);
    setStep('searching');

    try {
      const wingman = new WingmanService({
        onStatus: setMessage,
      });

      const result = await wait(wingman.run({
        rawInput,
        restaurantName: restaurantName.trim(),
        city: city?.trim() || null,
        extraInfo: extraInfo?.trim() || null,
        stateId: Number(stateId),
        stateCode: String(stateCode),
        userId,
        deferWingVerification: true,
      }));

      const isLowConfidence =
        result?.decision === 'rejected' &&
        (result?.decisionReason === 'low_confidence_ai' ||
          result?.decisionReason === 'invalid_ai_response' ||
          result?.decisionReason === 'place_not_found');

      if (result?.error) throw new Error(result.error);
      if (String(result?.error || '').toLowerCase().includes('too many requests')) {
        setMessage('Too many requests. Give it a little time and try again.');
        setStep('result');
        return;
      }

      if (result?.decision === 'needs_city' && !city?.trim()) {
        setMessage(result.userMessage);
        setStep('city');
        return;
      }
      if (['needs_city', 'needs_more_info'].includes(result?.decision)) {
        if (!extraInfo?.trim()) {
          setMessage(result.userMessage);
          setStep('extra');
        } else {
          await sendManualReview(result, null);
        }
        return;
      }

      if (!result?.success) {
        if (!city?.trim()) {
          setMessage('Wingman needs a little more help. Do you know the town?');
          setStep('city');
          return;
        }

        if (!extraInfo?.trim()) {
          setMessage('Still not enough. Add any extra details you know.');
          setStep('extra');
          return;
        }

        await sendManualReview(result, null);
        return;
      }

      if (isLowConfidence && (city?.trim() || extraInfo?.trim())) {
        await sendManualReview(result, null);
        return;
      }

      const existingCandidate = await findExistingDestinationCandidate({
        ai: result?.ai,
        stateId: Number(stateId),
      });

      if (existingCandidate?.id) {
        setCandidate({
          type: 'existing',
          row: existingCandidate,
        });
        setMessage('Wingman found an existing BuffaGo match.');
        setStep('result');
        return;
      }

      if (result?.place?.found) {
        setCandidate({
          type: 'wingman',
          row: {
            name: result.place.name || result.ai?.normalizedName || restaurantName.trim(),
            address: result.place.address ?? result.ai?.address ?? null,
            city: result.place.city ?? result.ai?.city ?? city?.trim() ?? null,
            state_id: Number(stateId),
            lat: result.place.lat ?? result.ai?.lat ?? null,
            lng: result.place.lng ?? result.ai?.lng ?? null,
          },
          result,
        });
        setMessage('Is this the restaurant you meant?');
        setStep('result');
        return;
      }

      if (!city?.trim()) {
        setMessage('Wingman could not lock it down yet. Do you know the town?');
        setStep('city');
        return;
      }

      if (!extraInfo?.trim()) {
        setMessage('Still not enough. Add any extra details you know.');
        setStep('extra');
        return;
      }

      setMessage(result?.userMessage || 'Wingman could not validate that restaurant.');
      setStep('result');
    } catch (e) {
      console.warn('runWingman failed:', e);
      const errorMessage = String(e?.message || e || 'Wingman hit a problem. Please try again.');
      setMessage(
        errorMessage.toLowerCase().includes('too many requests')
          ? 'Too many requests. Give it a little time and try again.'
          : errorMessage
      );
      setStep('result');
    } finally {
      setLoading(false);
      if (current()) searchInFlightRef.current = false;
    }
  }, [
    buildRawInput,
    restaurantName,
    stateId,
    stateCode,
    userId,
    city,
    extraInfo,
    findExistingDestinationCandidate,
    sendManualReview,
  ]);

  const renderStateStep = () => (
    <>
      <Text style={{ textAlign: 'center', opacity: 0.8, marginBottom: 12 }}>
        Guess on the name and give the state. Don&apos;t worry, we can work out typos!
      </Text>

      <TextInput
        ref={nameInput}
        testID="wingman-restaurant-name"
        mode="outlined"
        label="Restaurant name"
        value={restaurantName}
        onChangeText={setRestaurantName}
        style={{ marginBottom: 12 }}
      />

      <Text style={{ fontWeight: '800', marginBottom: 8 }}>{selectedStateLabel}</Text>

      {loadingStates ? (
        <View style={{ paddingVertical: 18, alignItems: 'center' }}>
          <ActivityIndicator />
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {states.map((s) => {
            const selected = Number(stateId) === Number(s.state_id);
            return (
              <Pressable
                key={`wm-state-${s.state_id}`}
                onPress={() => {
                  setStateId(Number(s.state_id));
                  setStateCode(String(s.state_code));
                }}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: selected ? 'rgba(255,122,24,0.95)' : 'rgba(255,255,255,0.16)',
                  backgroundColor: selected ? 'rgba(255,122,24,0.18)' : 'rgba(255,255,255,0.03)',
                }}
              >
                <Text style={{ fontWeight: '800' }}>{s.state_code}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </>
  );

  const renderCityStep = () => (
    <>
      <TextInput
        ref={cityInput}
        testID="wingman-city"
        showSoftInputOnFocus
        mode="outlined"
        label="Town or city"
        value={city}
        onChangeText={setCity}
        style={{ marginBottom: 12 }}
      />
    </>
  );

  const renderExtraStep = () => (
    <>
      <Text style={{ textAlign: 'center', opacity: 0.8, marginBottom: 12 }}>
        Add anything else you know. Nearby road, nickname, full name, anything helpful.
      </Text>

      <TextInput
        ref={extraInput}
        testID="wingman-extra-info"
        showSoftInputOnFocus
        mode="outlined"
        label="More details"
        value={extraInfo}
        onChangeText={setExtraInfo}
        multiline
        style={{ marginBottom: 12 }}
      />
    </>
  );

  const renderResultStep = () => (
    <>
      {!!message ? (
        <View style={{ alignItems: 'center', marginBottom: 12 }}>
          <Text style={{ textAlign: 'center', opacity: 0.85 }}>
            {message}
          </Text>

          {showCloseOnResultMessage && !candidate?.row ? (
            <Button
              mode="contained"
              onPress={dismiss}
              style={{ marginTop: 14, alignSelf: 'center' }}
            >
              Close
            </Button>
          ) : null}
        </View>
      ) : null}

      {candidate?.row ? (
        <View
          style={{
            borderRadius: 14,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.14)',
            backgroundColor: 'rgba(255,255,255,0.03)',
            padding: 12,
            gap: 8,
          }}
        >
          <Text style={{ fontWeight: '900' }}>{candidate.row.name}</Text>
          <Text style={{ opacity: 0.75 }}>
            {(candidate.row.address || '').trim()}
            {candidate.row.city ? `${candidate.row.address ? ', ' : ''}${candidate.row.city}` : ''}
          </Text>
          {candidate?.result?.ai ? <>
            <Text style={{ opacity: 0.75 }}>Restaurant-match confidence: {formatWingmanConfidence(candidate.result.ai.confidence)}</Text>
            <Text style={{ opacity: 0.75 }}>Wing confidence: {formatWingmanConfidence(candidate.result.ai.wingsProbability)}</Text>
          </> : null}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
            <Button
              mode="contained"
              style={{ flex: 1 }}
              disabled={loading}
              onPress={() => {
                if (candidate.type === 'existing') {
                  return handleUseDestination(candidate.row);
                }

                return verifyWingsAndAdd(candidate.row);
              }}
            >
              Yes
            </Button>

            <Button
              mode="outlined"
              style={{ flex: 1 }}
              disabled={loading}
              onPress={() => {
                if (!city?.trim()) {
                  setStep('city');
                  return;
                }

                setMessage('Add any details that can help Wingman find the right place.');
                setStep('extra');
              }}
            >
              No
            </Button>
          </View>
        </View>
      ) : null}
    </>
  );

  return (
    <Portal>
    <Modal visible={visible} transparent animationType="fade"
      onShow={() => { Keyboard.dismiss(); setModalReady(true); }}
      onRequestClose={dismiss}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Dialog
        visible={visible}
        onDismiss={dismiss}
        style={{ borderRadius: 18, alignSelf: 'center', width: '92%', maxWidth: 520 }}
      >
        <Dialog.Title style={{ textAlign: 'center', fontWeight: '900' }}>
          Wingman
        </Dialog.Title>

        <Dialog.ScrollArea style={{ maxHeight: '70%', paddingHorizontal: 0 }}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24 }}>
          {loading ? (
            <View style={{ paddingVertical: 18, alignItems: 'center' }}>
              <ActivityIndicator />
              <Text style={{ marginTop: 10, textAlign: 'center', opacity: 0.75 }}>
                {message || 'Wingman is checking that restaurant...'}
              </Text>
            </View>
          ) : (
            <>
              {step === 'state' && renderStateStep()}
              {step === 'city' && renderCityStep()}
              {step === 'extra' && renderExtraStep()}
              {step === 'result' && renderResultStep()}

              {!!message && step !== 'result' ? (
                <Text style={{ textAlign: 'center', opacity: 0.8, marginTop: 12 }}>
                  {message}
                </Text>
              ) : null}
            </>
          )}
        </ScrollView>
        </Dialog.ScrollArea>

        <Dialog.Actions style={{ justifyContent: 'space-between' }}>
          {showCloseOnResultMessage && step === 'result' && !candidate?.row ? null : (
            <Button onPress={dismiss}>
              Close
            </Button>
          )}

          {step !== 'result' ? (
            <Button
              mode="contained"
              onPress={runWingman}
              loading={loading}
              disabled={!canSearch}
            >
              Search
            </Button>
          ) : (
            <Button
              mode="outlined"
              disabled={loading}
              onPress={() => {
                setMessage('');
                setCandidate(null);
                setStep('state');
              }}
            >
              Retry search
            </Button>
          )}
        </Dialog.Actions>
      </Dialog>
      </KeyboardAvoidingView>
    </Modal>
    </Portal>
  );
}

