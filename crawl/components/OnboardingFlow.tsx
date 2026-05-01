// components/OnboardingFlow.tsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  Text,
  Button,
  TextInput,
  ActivityIndicator,
  useTheme,
  Dialog,
  Portal,
} from 'react-native-paper';
import SliderRowPretty from './SliderRowPretty';
import { supabase } from '../lib/supabase';

type StateRow = {
  state_id: number;
  state_code: string | null;
  state_name: string | null;
};

type DestRow = {
  id: string;
  name: string | null;
  address: string | null;
  city: string | null;
  lat?: number | null;
  lng?: number | null;
};

type WingPrefs = {
  wing_piece: 1 | 2 | null; // 1 flats, 2 drums
  sauce_pref: 1 | 2 | null; // 1 saucy, 2 dry rub
  spicy_pref: 1 | 2 | null; // 1 yes, 2 no
  prep_pref: 1 | 2 | 3 | 4 | null; // 1 fried, 2 grilled, 3 smoked, 4 other
};

type QuickRating = {
  crispiness: number | null;
  sauce: number | null;
  meat: number | null;
  overall: number | null;
};

const ONBOARDING_DONE_KEY = 'buffago:onboarding_done_v3';
const ONBOARDING_STATE_KEY = 'buffago:onboarding_state_v2';
const ONBOARDING_PREFS_KEY = 'buffago:onboarding:prefs';
const ONBOARDING_DEST_KEY = 'buffago:onboarding_dest_v1';
const ONBOARDING_SEED_RATING_KEY = 'buffago:onboarding:seed_rating';
const ONBOARDING_RESUME_STEP_KEY = 'buffago:onboarding:resume_step';
const ONBOARDING_DEST_SUGGESTION_KEY = 'buffago:onboarding:dest_suggestion';

const safeName = (s: any) => (s == null ? '' : String(s)).trim();

function asInt(n: any) {
  const v = Number(n);
  return Number.isFinite(v) ? Math.round(v) : null;
}

function ProgressDots({ step, total }: { step: number; total: number }) {
  const dots = Array.from({ length: total }).map((_, i) => i);
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 10 }}>
      {dots.map((i) => (
        <View
          key={`dot-${i}`}
          style={{
            width: i === step ? 16 : 8,
            height: 8,
            borderRadius: 999,
            opacity: i === step ? 0.95 : 0.35,
            backgroundColor: 'rgba(255,255,255,0.9)',
          }}
        />
      ))}
    </View>
  );
}

// Same UI vibe as account preferences
function PrefTwoSide({
  title,
  value,
  left,
  right,
  onPick,
}: {
  title: string;
  value: number | null;
  left: { v: number; t: string };
  right: { v: number; t: string };
  onPick: (v: number | null) => void;
}) {
  const rowBorder = 'rgba(255,255,255,0.14)';
  const WIN_GREEN = 'rgba(46,125,50,0.95)';

  const bg = (sel: number | null, side: number) => {
    if (sel == null) return 'rgba(255,255,255,0.04)';
    return sel === side ? 'rgba(46,125,50,0.28)' : 'rgba(255,255,255,0.04)';
  };

  const border = (sel: number | null, side: number) => {
    if (sel == null) return rowBorder;
    return sel === side ? WIN_GREEN : rowBorder;
  };

  const pick = (v: number) => onPick(value === v ? null : v);

  return (
    <View style={{ marginTop: 14 }}>
      <Text style={{ fontWeight: '900', marginBottom: 8 }}>{title}</Text>

      <View style={{ borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: rowBorder }}>
        <View style={{ flexDirection: 'row' }}>
          <Pressable
            onPress={() => pick(left.v)}
            style={({ pressed }) => [
              {
                flex: 1,
                paddingVertical: 12,
                paddingHorizontal: 10,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: bg(value, left.v),
                borderRightWidth: 1,
                borderRightColor: rowBorder,
                borderColor: border(value, left.v),
                opacity: pressed ? 0.9 : 1,
              },
            ]}
          >
            <Text style={{ fontWeight: '900', opacity: 0.95 }}>{left.t}</Text>
          </Pressable>

          <Pressable
            onPress={() => pick(right.v)}
            style={({ pressed }) => [
              {
                flex: 1,
                paddingVertical: 12,
                paddingHorizontal: 10,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: bg(value, right.v),
                borderColor: border(value, right.v),
                opacity: pressed ? 0.9 : 1,
              },
            ]}
          >
            <Text style={{ fontWeight: '900', opacity: 0.95 }}>{right.t}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function PrefGrid({
  title,
  value,
  options,
  onPick,
}: {
  title: string;
  value: number | null;
  options: { v: number; t: string }[];
  onPick: (v: number | null) => void;
}) {
  const rowBorder = 'rgba(255,255,255,0.14)';
  const WIN_GREEN = 'rgba(46,125,50,0.95)';

  const pick = (v: number) => onPick(value === v ? null : v);

  return (
    <View style={{ marginTop: 14 }}>
      <Text style={{ fontWeight: '900', marginBottom: 8 }}>{title}</Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {options.map((opt) => {
          const sel = value === opt.v;
          return (
            <Pressable
              key={`opt-${opt.v}`}
              onPress={() => pick(opt.v)}
              style={({ pressed }) => [
                {
                  width: '48%',
                  borderRadius: 14,
                  paddingVertical: 12,
                  paddingHorizontal: 10,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: sel ? WIN_GREEN : rowBorder,
                  backgroundColor: sel ? 'rgba(46,125,50,0.28)' : 'rgba(255,255,255,0.04)',
                  opacity: pressed ? 0.9 : 1,
                },
              ]}
            >
              <Text style={{ fontWeight: '900', opacity: 0.95 }}>{opt.t}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/**
 * Revamped Onboarding Flow (v3)
 * 0 Welcome
 * 1 Wing Profile
 * 2 Pick state + restaurant
 * 3 Rate the restaurant (now 4 pages, one per rating)
 * 4 Celebrate
 * 5 Crawl 101
 * 6 Ready / discovery
 * 7 Create account or continue as guest
 */
export default function OnboardingFlow({ onComplete }: { onComplete?: () => void }) {
  const safeComplete = typeof onComplete === 'function' ? onComplete : () => {};
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ prefact?: string; returnStep?: string }>();

  const [step, setStep] = useState<number>(0);
  const TOTAL_STEPS = 8;

  const prefact = (params?.prefact || '').toString();

  const [prefs, setPrefs] = useState<WingPrefs>({
    wing_piece: null,
    sauce_pref: null,
    spicy_pref: null,
    prep_pref: null,
  });

  const [loadingStates, setLoadingStates] = useState(true);
  const [states, setStates] = useState<StateRow[]>([]);
  const [stateQ, setStateQ] = useState('');
  const [pickedState, setPickedState] = useState<StateRow | null>(null);
  const [statePickerOpen, setStatePickerOpen] = useState(true);

  const [loadingDests, setLoadingDests] = useState(false);
  const [dests, setDests] = useState<DestRow[]>([]);
  const [destQ, setDestQ] = useState('');
  const [pickedDest, setPickedDest] = useState<DestRow | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState('');
  const [addAddress, setAddAddress] = useState('');
  const [addSaving, setAddSaving] = useState(false);

  const [rating, setRating] = useState<QuickRating>({
    crispiness: null,
    sauce: null,
    meat: null,
    overall: null,
  });

  // NEW: step 3 is now a 4-page micro flow
  const [ratingPage, setRatingPage] = useState<number>(0);

  const RATING_PAGES = useMemo(
    () => [
      {
        key: 'sauce' as const,
        title: 'Sauce',
        blurb: 'Flavor balance, heat, and how well it clings to the wing.',
        badLabel: 'Bleh',
        goodLabel: 'Unforgettable',
      },
      {
        key: 'crispiness' as const,
        title: 'Crispiness',
        blurb: 'Crunch factor. No soggy breading. No sad skin.',
        badLabel: 'Soggy',
        goodLabel: 'Crunchy',
      },
      {
        key: 'meat' as const,
        title: 'Chicken Quality',
        blurb: 'Juicy, tender, and clean texture. The chicken itself.',
        badLabel: 'Foul',
        goodLabel: 'Five star',
      },
      {
        key: 'overall' as const,
        title: 'Overall Experience',
        blurb: 'The full vibe. Taste, aroma, presentation, and satisfaction.',
        badLabel: 'Never again',
        goodLabel: 'Back tomorrow',
      },
    ],
    []
  );

  // Reset rating page whenever we enter step 3
  useEffect(() => {
    if (step === 3) setRatingPage(0);
  }, [step]);

  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewRoute, setPreviewRoute] = useState<any>(null);

  const complete = async () => {
    try {
      await AsyncStorage.setItem(ONBOARDING_DONE_KEY, '1');
    } catch {}
    safeComplete();
  };

  const goToLogin = async () => {
    try {
      await AsyncStorage.setItem(ONBOARDING_DONE_KEY, '1');
    } catch {}
    router.push('/auth/login');
    safeComplete();
  };

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const raw = await AsyncStorage.getItem(ONBOARDING_RESUME_STEP_KEY);
        if (!raw) return;

        const n = Number(raw);
        if (!Number.isFinite(n)) return;

        if (!alive) return;
        setStep(Math.max(0, Math.min(TOTAL_STEPS - 1, n)));

        await AsyncStorage.removeItem(ONBOARDING_RESUME_STEP_KEY);
      } catch {}
    })();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const raw = params?.returnStep;
    if (!raw) return;

    const n = Number(raw);
    if (!Number.isFinite(n)) return;

    setStep(Math.max(0, Math.min(TOTAL_STEPS - 1, n)));
  }, [params?.returnStep]);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoadingStates(true);
        const { data, error } = await supabase
          .from('states')
          .select('state_id, state_code, state_name')
          .order('state_name', { ascending: true });

        if (error) throw error;
        if (!alive) return;

        setStates((data as StateRow[]) || []);
      } catch {
        if (!alive) return;
        setStates([]);
      } finally {
        if (alive) setLoadingStates(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const filteredStates = useMemo(() => {
    const needle = (stateQ || '').trim().toLowerCase();
    if (!needle) return states;

    return (states || []).filter((s) => {
      const name = (s.state_name || '').toLowerCase();
      const code = (s.state_code || '').toLowerCase();
      return name.includes(needle) || code.includes(needle);
    });
  }, [stateQ, states]);

  const filteredDests = useMemo(() => {
    const needle = (destQ || '').trim().toLowerCase();
    if (!needle) return dests;

    return (dests || []).filter((d) => {
      const name = (d.name || '').toLowerCase();
      const city = (d.city || '').toLowerCase();
      const address = (d.address || '').toLowerCase();
      return name.includes(needle) || city.includes(needle) || address.includes(needle);
    });
  }, [destQ, dests]);

  const savePrefs = async (nextPrefs: WingPrefs) => {
    try {
      await AsyncStorage.setItem(ONBOARDING_PREFS_KEY, JSON.stringify(nextPrefs));
    } catch {}
  };

  const saveState = async (st: StateRow) => {
    try {
      await AsyncStorage.setItem(
        ONBOARDING_STATE_KEY,
        JSON.stringify({
          state_id: st.state_id,
          state_code: st.state_code ?? null,
          state_name: st.state_name ?? null,
          saved_at: new Date().toISOString(),
        })
      );
    } catch {}
  };

  const saveDest = async (d: DestRow) => {
    try {
      await AsyncStorage.setItem(
        ONBOARDING_DEST_KEY,
        JSON.stringify({
          id: d.id,
          name: d.name ?? null,
          address: d.address ?? null,
          city: d.city ?? null,
          saved_at: new Date().toISOString(),
        })
      );
    } catch {}
  };

  const loadRestaurantsForState = async (state_id: number) => {
    setLoadingDests(true);
    setPickedDest(null);
    setDests([]);
    setDestQ('');

    try {
      const { data, error } = await supabase
        .from('destinations')
        .select('id, name, address, city, lat, lng')
        .eq('state_id', state_id)
        .order('name', { ascending: true })
        .limit(800);

      if (error) throw error;
      setDests((data as DestRow[]) || []);
    } catch {
      setDests([]);
    } finally {
      setLoadingDests(false);
    }
  };

  const canContinuePrefs =
    prefs.wing_piece != null &&
    prefs.sauce_pref != null &&
    prefs.spicy_pref != null &&
    prefs.prep_pref != null;

  const canSubmitRating = !!pickedDest?.id;

  const submitOnboardingRating = async () => {
    try {
      const destId = pickedDest?.id ?? null;
      if (!destId) return;

      const isPseudo = String(destId).startsWith('new:');

      const payload = {
        destination_id: destId,
        crispiness: asInt(rating.crispiness ?? 7),
        sauce: asInt(rating.sauce ?? 7),
        meat: asInt(rating.meat ?? 7),
        overall: asInt(rating.overall ?? 7),
        onboarding_seed: true,
        coin_rating: true,
        local_only: isPseudo,
        created_at: new Date().toISOString(),
      };

      await AsyncStorage.setItem(ONBOARDING_SEED_RATING_KEY, JSON.stringify(payload));
    } catch {}
  };

  const saveNewRestaurantSuggestion = async () => {
    if (!pickedState?.state_id) return;
    const name = (addName || '').trim();
    if (!name) return;

    setAddSaving(true);
    try {
      const local = {
        state_id: pickedState.state_id,
        state_code: pickedState.state_code ?? null,
        state_name: pickedState.state_name ?? null,
        restaurant_name: name,
        address: (addAddress || '').trim() || null,
        created_at: new Date().toISOString(),
      };

      await AsyncStorage.setItem(ONBOARDING_DEST_SUGGESTION_KEY, JSON.stringify(local));

      const pseudoDest: DestRow = {
        id: `new:${Date.now()}`,
        name: name,
        address: local.address,
        city: null,
      };

      setPickedDest(pseudoDest);
      await saveDest(pseudoDest);

      setAddOpen(false);
      setAddName('');
      setAddAddress('');

      setStep(3);
    } finally {
      setAddSaving(false);
    }
  };

  const loadPreviewRoute = async () => {
    if (!pickedState?.state_id) return;

    setPreviewLoading(true);
    setPreviewRoute(null);
    try {
      const { data: routes, error } = await supabase
        .from('routes')
        .select(
          `
          id, title, city,
          stop1:stop1_id ( id, name ),
          stop2:stop2_id ( id, name ),
          stop3:stop3_id ( id, name ),
          stop4:stop4_id ( id, name ),
          stop5:stop5_id ( id, name )
        `
        )
        .eq('state_id', pickedState.state_id)
        .limit(25);

      if (error) throw error;

      const list = routes || [];
      const chosen = list.length ? list[Math.floor(Math.random() * list.length)] : null;
      setPreviewRoute(chosen);
    } catch {
      setPreviewRoute(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const previewLoadedRef = useRef(false);

  useEffect(() => {
    previewLoadedRef.current = false;
    setPreviewRoute(null);
  }, [pickedState?.state_id]);

  useEffect(() => {
    if (step !== 6) return;
    if (previewLoadedRef.current) return;
    previewLoadedRef.current = true;
    loadPreviewRoute();
  }, [step]);

  const goNext = async () => {
    if (step === 1) {
      await savePrefs(prefs);
      setStep(2);
      return;
    }

    if (step === 3) {
      if (ratingPage < RATING_PAGES.length - 1) {
        setRatingPage((p) => p + 1);
        return;
      }

      await submitOnboardingRating();
      setStep(4);
      return;
    }

    if (step === 4) {
      setStep(5);
      return;
    }

    if (step === 5) {
      setStep(6);
      return;
    }

    if (step === 6) {
      setStep(7);
      return;
    }

    if (step === 7) {
      await complete();
      return;
    }

    setStep((s) => Math.min(TOTAL_STEPS - 1, s + 1));
  };

  const goBack = () => {
    if (step === 0) return;

    if (step === 3 && ratingPage > 0) {
      setRatingPage((p) => Math.max(0, p - 1));
      return;
    }

    setStep((s) => Math.max(0, s - 1));
  };

  useEffect(() => {
    if (!pickedState?.state_id) return;
    loadRestaurantsForState(pickedState.state_id);
  }, [pickedState?.state_id]);

  const pickRestaurant = useCallback(
    async (d: DestRow) => {
      setPickedDest(d);

      if (pickedState) {
        await saveState(pickedState);
      }
      await saveDest(d);

      setStep(3);
    },
    [pickedState]
  );

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]}>
      {step !== 0 ? (
        <View style={{ paddingTop: 6, flexDirection: 'row', alignItems: 'center' }}>
          <Pressable onPress={goBack} hitSlop={12} style={{ paddingVertical: 8, paddingHorizontal: 8 }}>
            <Text style={{ fontWeight: '900' }}>Back</Text>
          </Pressable>
        </View>
      ) : null}

      {step === 0 ? (
        <View style={styles.center}>
          <Image source={require('../assets/wing-user.png')} style={styles.host} resizeMode="contain" />

          <Text style={styles.title}>Welcome to BuffaGo</Text>
          <Text style={styles.body}>Rate wings. Build your Wingdex. Level up.</Text>

          {!!prefact && (
            <View
              style={{
                marginTop: 12,
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: 14,
                backgroundColor: 'rgba(255,255,255,0.06)',
              }}
            >
              <Text style={{ textAlign: 'center', opacity: 0.85 }}>{prefact}</Text>
            </View>
          )}

          <View style={{ height: 18 }} />
          <Button
            mode="contained"
            onPress={() => setStep(1)}
            style={styles.primaryBtn}
            contentStyle={{ paddingVertical: 10 }}
          >
            Let’s begin
          </Button>

          <Text style={styles.tiny}>Your first wing rating takes less than a minute.</Text>

          <ProgressDots step={step} total={TOTAL_STEPS} />

          <Pressable onPress={goToLogin} style={{ marginTop: 12 }}>
            <Text style={{ textAlign: 'center', opacity: 0.8, fontWeight: '900' }}>
              Sign in to skip
            </Text>
          </Pressable>
        </View>
      ) : null}

      {step === 1 ? (
        <View style={styles.screen}>
          <Text style={styles.title}>Wing Profile</Text>
          <Text style={styles.body}>Tap an option. Tap again to clear.</Text>

          <ScrollView style={{ marginTop: 10 }} contentContainerStyle={{ paddingBottom: 18 }}>
            <PrefTwoSide
              title="Flats or Drums"
              value={prefs.wing_piece}
              left={{ v: 1, t: 'Flats' }}
              right={{ v: 2, t: 'Drums' }}
              onPick={(v) => setPrefs((p) => ({ ...p, wing_piece: (v as any) ?? null }))}
            />

            <PrefTwoSide
              title="Saucy or Dry Rub"
              value={prefs.sauce_pref}
              left={{ v: 1, t: 'Saucy' }}
              right={{ v: 2, t: 'Dry Rub' }}
              onPick={(v) => setPrefs((p) => ({ ...p, sauce_pref: (v as any) ?? null }))}
            />

            <PrefTwoSide
              title="Spicy?"
              value={prefs.spicy_pref}
              left={{ v: 1, t: 'Yes' }}
              right={{ v: 2, t: 'No' }}
              onPick={(v) => setPrefs((p) => ({ ...p, spicy_pref: (v as any) ?? null }))}
            />

            <PrefGrid
              title="Preferred Prep"
              value={prefs.prep_pref}
              options={[
                { v: 1, t: 'Fried' },
                { v: 2, t: 'Grilled' },
                { v: 3, t: 'Smoked' },
                { v: 4, t: 'Other' },
              ]}
              onPick={(v) => setPrefs((p) => ({ ...p, prep_pref: (v as any) ?? null }))}
            />
          </ScrollView>

          <View style={styles.bottomRow}>
            <Button mode="contained" onPress={goNext} disabled={!canContinuePrefs} style={styles.primaryBtn}>
              Continue
            </Button>
          </View>

          <ProgressDots step={step} total={TOTAL_STEPS} />
        </View>
      ) : null}

      {step === 2 ? (
        <View style={styles.screen}>
          <Text style={styles.title}>Rate your first wings!</Text>
          <Text style={styles.body}>Then tap a wing spot you’ve been to.</Text>

          <View style={{ height: 12 }} />

          {!pickedState || statePickerOpen ? (
            <>
              <TextInput
                value={stateQ}
                onChangeText={setStateQ}
                mode="outlined"
                placeholder="Search states"
                style={{ marginBottom: 10 }}
              />

              <View style={styles.listWrap}>
                {loadingStates ? (
                  <View style={{ paddingVertical: 18, alignItems: 'center' }}>
                    <ActivityIndicator />
                  </View>
                ) : (
                  <ScrollView style={{ maxHeight: 240 }}>
                    {(filteredStates || []).map((s) => {
                      const name = (s.state_name || '').trim() || 'State';
                      const code = (s.state_code || '').trim();
                      const isPicked = pickedState?.state_id === s.state_id;

                      return (
                        <Pressable
                          key={`st-${s.state_id}`}
                          onPress={async () => {
                            setPickedState(s);
                            setStatePickerOpen(false);
                            setStateQ('');
                            await saveState(s);
                          }}
                          style={({ pressed }) => [
                            styles.row,
                            isPicked && styles.rowPicked,
                            pressed && { opacity: 0.9 },
                          ]}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontWeight: '900' }}>
                              {name}
                              {code ? ` (${code})` : ''}
                            </Text>
                          </View>
                          <Text style={{ fontWeight: '900', opacity: isPicked ? 1 : 0.4 }}>
                            {isPicked ? '✓' : '›'}
                          </Text>
                        </Pressable>
                      );
                    })}

                    {!filteredStates?.length ? (
                      <Text style={{ textAlign: 'center', opacity: 0.75, paddingVertical: 14 }}>
                        No matches.
                      </Text>
                    ) : null}
                  </ScrollView>
                )}
              </View>
            </>
          ) : (
            <View style={styles.listWrap}>
              <View style={[styles.row, { borderBottomWidth: 0 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '900' }}>Your state</Text>
                  <Text style={{ opacity: 0.75, marginTop: 2 }}>
                    {(pickedState.state_name || 'State').toString()}
                    {pickedState.state_code ? ` (${pickedState.state_code})` : ''}
                  </Text>
                </View>

                <Pressable onPress={() => setStatePickerOpen(true)}>
                  <Text style={{ fontWeight: '900', opacity: 0.85 }}>Change</Text>
                </Pressable>
              </View>
            </View>
          )}

          <View style={{ height: 14 }} />

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontWeight: '900' }}>Pick a restaurant</Text>
          </View>

          <View style={{ height: 10 }} />

          <TextInput
            value={destQ}
            onChangeText={setDestQ}
            mode="outlined"
            placeholder={pickedState?.state_id ? 'Search restaurants' : 'Pick a state first'}
            disabled={!pickedState?.state_id}
            style={{ marginBottom: 10 }}
          />

          <View style={styles.listWrap}>
            {!pickedState?.state_id ? (
              <View style={{ paddingVertical: 18, alignItems: 'center' }}>
                <Text style={{ opacity: 0.75, textAlign: 'center' }}>Choose a state to see restaurants.</Text>
              </View>
            ) : loadingDests ? (
              <View style={{ paddingVertical: 18, alignItems: 'center' }}>
                <ActivityIndicator />
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 320 }}>
                {(filteredDests || []).map((d) => {
                  const title = (d.name || '').trim() || 'Wing Spot';
                  const sub = (d.address ? `${d.city ? ' · ' : ''}${d.address}` : '');

                  return (
                    <Pressable
                      key={`dest-${d.id}`}
                      onPress={() => pickRestaurant(d)}
                      style={({ pressed }) => [styles.row, pressed && { opacity: 0.9 }]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: '900' }}>{title}</Text>
                        {!!sub && <Text style={{ opacity: 0.7, marginTop: 2 }}>{sub}</Text>}
                      </View>
                      <Text style={{ fontWeight: '900', opacity: 0.6 }}>›</Text>
                    </Pressable>
                  );
                })}

                {!filteredDests?.length ? (
                  <Pressable
                    onPress={() => pickedState?.state_id && setAddOpen(true)}
                    style={({ pressed }) => [
                      {
                        paddingVertical: 18,
                        paddingHorizontal: 16,
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: pressed ? 0.85 : 1,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        textAlign: 'center',
                        fontWeight: '900',
                        opacity: pickedState?.state_id ? 0.9 : 0.4,
                      }}
                    >
                      No Matches
                    </Text>
                    <Text
                      style={{
                        textAlign: 'center',
                        marginTop: 4,
                        opacity: pickedState?.state_id ? 0.75 : 0.4,
                      }}
                    >
                      Tap here to add a restaurant
                    </Text>
                  </Pressable>
                ) : null}
              </ScrollView>
            )}
          </View>

          <ProgressDots step={step} total={TOTAL_STEPS} />

          <Portal>
            <Dialog
              visible={addOpen}
              onDismiss={() => setAddOpen(false)}
              style={{ borderRadius: 18, alignSelf: 'center', width: '92%', maxWidth: 520 }}
            >
              <Dialog.Title style={{ textAlign: 'center', fontWeight: '900' }}>
                Add a restaurant
              </Dialog.Title>
              <Dialog.Content>
                <TextInput
                  value={addName}
                  onChangeText={setAddName}
                  mode="outlined"
                  placeholder="Restaurant name"
                  style={{ marginBottom: 10 }}
                />
                <TextInput
                  value={addAddress}
                  onChangeText={setAddAddress}
                  mode="outlined"
                  placeholder="Optional address"
                />
                <Text style={{ marginTop: 10, opacity: 0.7 }}>
                  This helps us expand coverage faster.
                </Text>
              </Dialog.Content>
              <Dialog.Actions style={{ justifyContent: 'space-between' }}>
                <Button onPress={() => setAddOpen(false)} disabled={addSaving}>
                  Close
                </Button>
                <Button
                  onPress={saveNewRestaurantSuggestion}
                  loading={addSaving}
                  disabled={addSaving || !addName.trim()}
                >
                  Save and rate
                </Button>
              </Dialog.Actions>
            </Dialog>
          </Portal>
        </View>
      ) : null}

      {step === 3 ? (
        <View style={styles.screen}>
          {(() => {
            const page = RATING_PAGES[ratingPage];
            const isLast = ratingPage === RATING_PAGES.length - 1;
            const value = (rating as any)[page.key] ?? 7;

            return (
              <>
                <Text style={styles.title}>Rate your wings</Text>
                <Text style={styles.body}>
                  {pickedDest?.name ? `How is ${pickedDest.name}?` : 'Rate their wings'}
                </Text>

                <View style={{ height: 10 }} />

                <View
                  style={{
                    width: '100%',
                    maxWidth: 520,
                    alignSelf: 'center',
                    padding: 14,
                    borderRadius: 18,
                    backgroundColor: 'rgba(255,255,255,0.06)',
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.10)',
                  }}
                >
                  <Text style={{ fontWeight: '900', textAlign: 'center' }}>
                    {ratingPage + 1} of {RATING_PAGES.length}
                  </Text>

                  <View style={{ height: 10 }} />

                  <Text style={{ fontSize: 20, fontWeight: '900', textAlign: 'center' }}>{page.title}</Text>

                  <Text style={{ textAlign: 'center', opacity: 0.82, marginTop: 8, lineHeight: 20 }}>
                    {page.blurb}
                  </Text>
                </View>

                <ScrollView style={{ marginTop: 10 }} contentContainerStyle={{ paddingBottom: 18 }}>
                  <SliderRowPretty
                    label={page.title}
                    value={value}
                    onChange={(v: number) =>
                      setRating((r) => ({
                        ...r,
                        [page.key]: v,
                      }))
                    }
                    description=""
                    badLabel={page.badLabel}
                    goodLabel={page.goodLabel}
                  />
                </ScrollView>

                <View style={[styles.bottomRow, { justifyContent: 'space-between' }]}>
                  <Button
                    mode="outlined"
                    onPress={() => setRatingPage((p) => Math.max(0, p - 1))}
                    disabled={ratingPage === 0}
                    style={{ flex: 1, borderRadius: 16 }}
                    contentStyle={{ paddingVertical: 10 }}
                  >
                    Back
                  </Button>

                  <View style={{ width: 10 }} />

                  <Button
                    mode="contained"
                    onPress={goNext}
                    disabled={!canSubmitRating}
                    style={[styles.primaryBtn, { flex: 1 }]}
                    contentStyle={{ paddingVertical: 10 }}
                  >
                    {isLast ? 'Finish rating' : 'Next'}
                  </Button>
                </View>

                <ProgressDots step={step} total={TOTAL_STEPS} />
                <ProgressDots step={ratingPage} total={RATING_PAGES.length} />
              </>
            );
          })()}
        </View>
      ) : null}

      {step === 4 ? (
        <View style={styles.center}>
          <Image source={require('../assets/wing-user.png')} style={styles.host} resizeMode="contain" />

          <Text style={styles.title}>That was your first Wingdex entry</Text>

          <Text style={styles.body}>
            Your ratings don’t disappear. BuffaGo saves your progress automatically, so you can build out your Wingdex. To rate more, go on a wing crawl or use buffacoins!
          </Text>

          <View style={{ height: 12 }} />

          <View
            style={{
              width: '100%',
              maxWidth: 520,
              padding: 14,
              borderRadius: 18,
              backgroundColor: 'rgba(255,255,255,0.06)',
            }}
          >
            <Text style={{ fontWeight: '900', marginBottom: 6 }}>
              Crawls are your preselected routes to follow. They're designed to help you find new local gems!
            </Text>

            <Text style={{ opacity: 0.82, lineHeight: 20 }}>
              Start a Crawl anytime. You can have more than one going at once.
            </Text>

            <View style={{ height: 10 }} />

            <Text style={{ opacity: 0.75, lineHeight: 20 }}>
              BuffaGo saves automatically, so you can stop and pick up where you left off.
            </Text>
          </View>

          <View style={{ height: 18 }} />

          <Button
            mode="contained"
            onPress={goNext}
            style={styles.primaryBtn}
            contentStyle={{ paddingVertical: 10 }}
          >
            Learn More About Crawls
          </Button>

          <ProgressDots step={step} total={TOTAL_STEPS} />
        </View>
      ) : null}

      {step === 5 ? (
        <View style={styles.center}>
          <Text style={styles.title}>A Crawl is a wing quest</Text>
          <Text style={styles.body}>Three to five stops. One journey. You earn XP as you go.</Text>

          <View style={{ height: 18 }} />

          <View
            style={{
              width: '100%',
              maxWidth: 520,
              padding: 14,
              borderRadius: 18,
              backgroundColor: 'rgba(255,255,255,0.06)',
              marginBottom: 18,
            }}
          >
            <Text style={{ fontWeight: '900', marginBottom: 6 }}>Select a crawl</Text>
            <Text style={{ opacity: 0.8 }}>
              Click the crawls tab to browse crawls near you. Select 1 that interests you and start your journey!
            </Text>
          </View>

          <View
            style={{
              width: '100%',
              maxWidth: 520,
              padding: 14,
              borderRadius: 18,
              backgroundColor: 'rgba(255,255,255,0.06)',
              marginBottom: 18,
            }}
          >
            <Text style={{ fontWeight: '900', marginBottom: 6 }}>Stepping stones</Text>
            <Text style={{ opacity: 0.8 }}>
              Each stop is a tile. Go to the first restaraunt. Eat. Have Fun. Rate it. Unlock the next tile! Try the next tile another day or tackle it right away. It's up to you.
            </Text>
          </View>

          <View
            style={{
              width: '100%',
              maxWidth: 520,
              padding: 14,
              borderRadius: 18,
              backgroundColor: 'rgba(255,255,255,0.06)',
              marginBottom: 18,
            }}
          >
            <Text style={{ fontWeight: '900', marginBottom: 6 }}>Tip</Text>
            <Text style={{ opacity: 0.8 }}>
              If trying to complete a crawl in a single day, there's no shame in splitting the smallest wing-size with a friend at each destination.
            </Text>
          </View>

          <Button
            mode="contained"
            onPress={async () => {
              await AsyncStorage.setItem(ONBOARDING_RESUME_STEP_KEY, '6');

              router.push({
                pathname: '/onboarding/crawl-preview',
                params: {
                  nextPath: '/(tabs)/home',
                },
              });
            }}
            style={styles.primaryBtn}
            contentStyle={{ paddingVertical: 10 }}
          >
            Check out a sample crawl
          </Button>

          <ProgressDots step={step} total={TOTAL_STEPS} />
        </View>
      ) : null}

      {step === 6 ? (
        <View style={styles.center}>
          <Image source={require('../assets/wing-user.png')} style={styles.host} resizeMode="contain" />

          <Text style={styles.title}>Are you ready?</Text>

          <Text style={styles.body}>
            Let's get your wing journey officialy started!
          </Text>

          <View style={{ height: 14 }} />

          <View
            style={{
              width: '100%',
              maxWidth: 520,
              padding: 14,
              borderRadius: 18,
              backgroundColor: 'rgba(255,255,255,0.06)',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.10)',
            }}
          >
            <Text style={{ fontWeight: '900', marginBottom: 10, textAlign: 'center' }}>
              Cool stuff to discover next
            </Text>

            <View style={{ gap: 12 }}>
              <View>
                <Text style={{ fontWeight: '900' }}>Leaderboards</Text>
                <Text style={{ opacity: 0.82, lineHeight: 20, marginTop: 4 }}>
                  Compete with friends and your city. See who is leveling up fastest.
                </Text>
              </View>

              <View>
                <Text style={{ fontWeight: '900' }}>Social Feed</Text>
                <Text style={{ opacity: 0.82, lineHeight: 20, marginTop: 4 }}>
                  Share wing wins, crawl completions, and discover spots other people are hyped about.
                </Text>
              </View>

              <View>
                <Text style={{ fontWeight: '900' }}>Your Journey</Text>
                <Text style={{ opacity: 0.82, lineHeight: 20, marginTop: 4 }}>
                  Your Wingdex grows over time. The more you rate, the more the app becomes yours.
                </Text>
              </View>
            </View>
          </View>

          <View style={{ height: 18 }} />

          <Button
            mode="contained"
            onPress={goNext}
            style={styles.primaryBtn}
            contentStyle={{ paddingVertical: 10 }}
            labelStyle={{ fontWeight: '900' }}
          >
            Take me to the app
          </Button>

          <ProgressDots step={step} total={TOTAL_STEPS} />
        </View>
      ) : null}

      {step === 7 ? (
        <View style={styles.center}>
          <Text style={styles.title}>Save your journey</Text>
          <Text style={styles.body}>
            Create an account to keep XP, streaks, and your full Wingdex. Or continue as a guest.
          </Text>

          <View style={{ height: 18 }} />

          <Button mode="contained" onPress={goToLogin} style={styles.primaryBtn} contentStyle={{ paddingVertical: 10 }}>
            Create account
          </Button>

          <View style={{ height: 12 }} />

          <Button
            mode="outlined"
            onPress={async () => {
              try {
                await AsyncStorage.removeItem(ONBOARDING_SEED_RATING_KEY);
                await AsyncStorage.removeItem(ONBOARDING_DEST_SUGGESTION_KEY);
              } catch {}

              await complete();
              router.replace('/(tabs)/home');
            }}
            style={styles.primaryBtn}
            contentStyle={{ paddingVertical: 10 }}
          >
            Continue as guest
          </Button>

          <ProgressDots step={step} total={TOTAL_STEPS} />
        </View>
      ) : null}
    </View>
  );
}

const styles: any = {
  wrap: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    elevation: 50,
    padding: 22,
    paddingTop: 40,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  screen: {
    flex: 1,
    paddingTop: 10,
    alignItems: 'stretch',
    justifyContent: 'flex-start',
  },
  host: {
    width: 170,
    height: 170,
    marginBottom: 8,
  },
  title: {
    textAlign: 'center',
    fontSize: 26,
    fontWeight: '900',
    marginTop: 6,
  },
  body: {
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 21,
    opacity: 0.85,
    marginTop: 10,
    maxWidth: 520,
    alignSelf: 'center',
  },
  tiny: {
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 18,
    opacity: 0.6,
    maxWidth: 420,
    marginTop: 14,
  },
  primaryBtn: {
    borderRadius: 16,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
  },
  listWrap: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  rowPicked: {
    backgroundColor: 'rgba(46, 125, 50, 0.20)',
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    gap: 10,
  },
};
