import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, ScrollView, Pressable, Alert } from 'react-native';
import { Dialog, Portal, Text, Button, TextInput, ActivityIndicator } from 'react-native-paper';
import { supabase } from '../lib/supabase.js';
import { WingmanService } from '../lib/Wingman/WingmanService.ts';

async function formatWingmanFunctionError(error) {
  const fallback = error?.message || String(error || 'Wingman could not add that restaurant.');
  const response = error?.context;

  if (!response || typeof response.clone !== 'function') return fallback;

  try {
    const body = await response.clone().json();
    if (body?.error) return body.details ? `${body.error} ${body.details}` : String(body.error);
  } catch {
    try {
      const text = await response.clone().text();
      if (text.trim()) return text.trim();
    } catch {
      return fallback;
    }
  }

  return fallback;
}

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
  const wasVisibleRef = useRef(false);

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
    setStep('state');
  }, [visible, initialRestaurant, initialStateId, initialStateCode]);

  useEffect(() => {
    if (!visible) return;

    let alive = true;
    (async () => {
      setLoadingStates(true);
      try {
        const { data, error } = await supabase
          .from('states')
          .select('state_id, state_code, state_name')
          .order('state_name', { ascending: true });

        if (error) throw error;
        if (alive) setStates(data || []);
      } catch (e) {
        console.warn('load states failed:', e?.message || e);
        if (alive) setStates([]);
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
    const normalizedName = String(ai?.normalizedName || '').trim();
    const cityName = String(ai?.city || city || '').trim();

    if (!normalizedName || !sid) return null;

    try {
      if (cityName) {
        const { data: cityMatches, error: cityErr } = await supabase
          .from('destinations')
          .select('id, name, address, city, lat, lng, state_id')
          .eq('state_id', sid)
          .ilike('name', `%${normalizedName}%`)
          .ilike('city', `%${cityName}%`)
          .limit(25);

        if (cityErr) throw cityErr;

        if (cityMatches?.length) {
          const exactish = cityMatches.find((d) => {
            const dbName = String(d?.name || '').toLowerCase();
            const dbCity = String(d?.city || '').toLowerCase();
            const base = normalizedName.toLowerCase();
            const cityLc = cityName.toLowerCase();

            return dbCity === cityLc && (
              dbName === base ||
              dbName.includes(base) ||
              base.includes(dbName)
            );
          });

          return exactish || cityMatches[0];
        }
      }

      const { data: nameMatches, error: nameErr } = await supabase
        .from('destinations')
        .select('id, name, address, city, lat, lng, state_id')
        .eq('state_id', sid)
        .ilike('name', `%${normalizedName}%`)
        .limit(25);

      if (nameErr) throw nameErr;
      if (!nameMatches?.length) return null;

      const exactish = nameMatches.find((d) => {
        const dbName = String(d?.name || '').toLowerCase();
        const base = normalizedName.toLowerCase();
        const dbCity = String(d?.city || '').toLowerCase();
        const cityLc = cityName.toLowerCase();

        if (cityName && dbCity === cityLc && dbName.includes(base)) return true;
        if (dbName === base) return true;
        if (dbName.includes(base)) return true;
        if (base.includes(dbName)) return true;
        return false;
      });

      return exactish || nameMatches[0];
    } catch (e) {
      console.warn('findExistingDestinationCandidate failed:', e?.message || e);
      return null;
    }
  }, [city]);

  const handleUseDestination = useCallback(async (row) => {
    if (!row?.id) return;
    await onPickDestination?.(row);
    onDismiss?.();
  }, [onPickDestination, onDismiss]);

  const insertWingmanDestination = useCallback(async (row) => {
    if (!row?.name || !stateId) return;

    setLoading(true);
    setMessage('Wingman is adding that restaurant.');

    try {
      const { data: inserted, error: insertErr } = await supabase.functions.invoke('wingman-intake', {
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
      });

      if (insertErr) throw insertErr;

      const insertedRow = inserted?.destination;
      if (!insertedRow?.id) {
        setMessage('Wingman added it, but could not load it back yet.');
        setStep('result');
        return;
      }

      await handleUseDestination(insertedRow);
      return insertedRow;
    } catch (e) {
      console.warn('insertWingmanDestination failed:', e);
      setMessage(await formatWingmanFunctionError(e));
      setStep('result');
    } finally {
      setLoading(false);
    }
  }, [city, extraInfo, handleUseDestination, stateCode, stateId]);

  const sendManualReview = useCallback(async (result, row) => {
    const suggestionPayload = {
      state_id: stateId ? Number(stateId) : null,
      restaurant_name:
        result?.suggestionInsert?.restaurantName ||
        row?.name ||
        restaurantName.trim(),
      address: result?.suggestionInsert?.address ?? row?.address ?? null,
    };

    if (!userId || !stateId) {
      setCandidate(null);
      setMessage(manualReviewQueuedMessage);
      setStep('result');
      onManualReviewQueued?.(suggestionPayload);
      return;
    }

    const { error: suggestionErr } = await supabase
      .from('destination_suggestions')
      .insert({
        user_id: userId,
        state_id: suggestionPayload.state_id,
        restaurant_name: suggestionPayload.restaurant_name,
        address: suggestionPayload.address,
      });

    if (suggestionErr) throw suggestionErr;

    setCandidate(null);
    setMessage(manualReviewQueuedMessage);
    setStep('result');
    onManualReviewQueued?.(suggestionPayload);
  }, [manualReviewQueuedMessage, onManualReviewQueued, restaurantName, stateId, userId]);

  const verifyWingsAndAdd = useCallback(async (row) => {
    if (!row?.name || !stateId || !stateCode) return;

    setLoading(true);
    const firstPassScore = candidate?.result?.ai?.wingsProbability ?? 0;

    if (firstPassScore >= 0.75) {
      await insertWingmanDestination(row);
      return;
    }

    setMessage('Hold on while Wingman does a deeper dive to see if they have wings on their menu.');

    try {
      const wingman = new WingmanService();
      const result = await wingman.run({
        rawInput: [row.name, row.city, row.address].filter(Boolean).join(' '),
        restaurantName: row.name,
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
      });

      const wingsProbability = result?.ai?.wingsProbability ?? 0;

      if (wingsProbability >= 0.75 && result?.place?.found) {
        const added = await insertWingmanDestination({
          ...row,
          name: result.place?.name || result.ai?.normalizedName || row.name,
          address: result.place?.address ?? result.ai?.address ?? row.address ?? null,
          city: result.place?.city ?? result.ai?.city ?? row.city ?? null,
          lat: result.place?.lat ?? result.ai?.lat ?? row.lat ?? null,
          lng: result.place?.lng ?? result.ai?.lng ?? row.lng ?? null,
        });
        if (added?.id) {
          Alert.alert(
            'Wings confirmed',
            'Wingman was able to confirm they have wings on the menu. It has been added.'
          );
        }
        return;
      }

      await sendManualReview(result, row);
    } catch (e) {
      console.warn('verifyWingsAndAdd failed:', e);
      setMessage(String(e?.message || e || 'Wingman could not verify wings for that restaurant.'));
      setStep('result');
    } finally {
      setLoading(false);
    }
  }, [
    city,
    candidate?.result?.ai?.wingsProbability,
    extraInfo,
    insertWingmanDestination,
    sendManualReview,
    stateCode,
    stateId,
    userId,
  ]);

  const runWingman = useCallback(async () => {
    if (searchInFlightRef.current) return;

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

      const result = await wingman.run({
        rawInput,
        restaurantName: restaurantName.trim(),
        city: city?.trim() || null,
        extraInfo: extraInfo?.trim() || null,
        stateId: Number(stateId),
        stateCode: String(stateCode),
        userId,
        deferWingVerification: true,
      });

      const isLowConfidence =
        result?.decision === 'rejected' &&
        (result?.decisionReason === 'low_confidence_ai' ||
          result?.decisionReason === 'invalid_ai_response' ||
          result?.decisionReason === 'place_not_found');

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

        setMessage(result?.error || result?.userMessage || 'Wingman could not figure this one out.');
        setStep('result');
        return;
      }

      if (isLowConfidence && (city?.trim() || extraInfo?.trim())) {
        setMessage(result?.userMessage || 'Wingman could not validate that restaurant.');
        setStep('result');
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
      setMessage(String(e?.message || e || 'Wingman hit a problem. Please try again.'));
      setStep('result');
    } finally {
      setLoading(false);
      searchInFlightRef.current = false;
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
  ]);

  const renderStateStep = () => (
    <>
      <Text style={{ textAlign: 'center', opacity: 0.8, marginBottom: 12 }}>
        Guess on the name and give the state. Don&apos;t worry, we can work out typos!
      </Text>

      <TextInput
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
              onPress={onDismiss}
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
          {candidate?.result?.ai?.wingsProbability != null ? (
            <Text style={{ opacity: 0.75 }}>
              Wings on Menu Confidence {Math.round(candidate.result.ai.wingsProbability * 100)}%
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
            <Button
              mode="contained"
              style={{ flex: 1 }}
              onPress={() => {
                if (candidate.type === 'existing') {
                  handleUseDestination(candidate.row);
                  return;
                }

                verifyWingsAndAdd(candidate.row);
              }}
            >
              Yes
            </Button>

            <Button
              mode="outlined"
              style={{ flex: 1 }}
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
      <Dialog
        visible={visible}
        onDismiss={loading ? undefined : onDismiss}
        style={{ borderRadius: 18, alignSelf: 'center', width: '92%', maxWidth: 520 }}
      >
        <Dialog.Title style={{ textAlign: 'center', fontWeight: '900' }}>
          Wingman
        </Dialog.Title>

        <Dialog.Content>
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
        </Dialog.Content>

        <Dialog.Actions style={{ justifyContent: 'space-between' }}>
          {showCloseOnResultMessage && step === 'result' && !candidate?.row ? null : (
            <Button onPress={onDismiss} disabled={loading}>
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
          ) : showCloseOnResultMessage && !candidate?.row ? null : (
            <Button
              mode="outlined"
              onPress={() => {
                setRestaurantName('');
                setCity('');
                setExtraInfo('');
                setMessage('');
                setCandidate(null);
                setStep('state');
              }}
            >
              Add a different restaurant
            </Button>
          )}
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

