// components/OnboardingFlow.tsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Image, Platform, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Text,
  Button,
  TextInput,
  ActivityIndicator,
  Tooltip,
  useTheme,
} from 'react-native-paper';
import RatingWizardDialog from './RatingWizardDialog';
import WingmanAddDialog from './WingmanAddDialog';
import { supabase } from '../lib/supabase';
import { getAnalyticsSessionId, getAnonymousId, trackEvent } from '../lib/analytics';
import * as quickRating from '../lib/quickRating';
import * as onboardingStepSix from '../lib/onboardingStepSix';

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

type RatingTagOption = {
  id: number;
  tag: string;
};

type QuickRatingMetric = {
  key: keyof QuickRating;
  label: string;
};

const ONBOARDING_DONE_KEY = 'buffago:onboarding_done_v3';
const ONBOARDING_STATE_KEY = 'buffago:onboarding_state_v2';
const ONBOARDING_PREFS_KEY = 'buffago:onboarding:prefs';
const ONBOARDING_DEST_KEY = 'buffago:onboarding_dest_v1';
const ONBOARDING_SEED_RATING_KEY = 'buffago:onboarding:seed_rating';
const ONBOARDING_RESUME_STEP_KEY = 'buffago:onboarding:resume_step';
const ONBOARDING_DEST_SUGGESTION_KEY = 'buffago:onboarding:dest_suggestion';
const { QUICK_RATING_FLOW_VARIANT, QUICK_RATING_MEASUREMENT_NOTE } = quickRating;
const QUICK_RATING_METRICS: QuickRatingMetric[] = [
  { key: 'overall', label: 'Overall' },
  { key: 'sauce', label: 'Sauce / Rub' },
  { key: 'crispiness', label: 'Crispiness' },
  { key: 'meat', label: 'Chicken' },
];

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
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight, fontScale } = useWindowDimensions();

  const [step, setStep] = useState<number>(0);
  const TOTAL_STEPS = 8;
  const completedRef = useRef(false);
  const stepSixGateViewedRef = useRef(false);
  const finalScreenViewedRef = useRef(false);
  const finalCtaVisibleRef = useRef(false);
  const finalLayoutWarningRef = useRef(false);
  const finalScreenRenderStartedAtRef = useRef<number | null>(null);
  const finalPrimaryCtaRef = useRef<any>(null);
  const stepRef = useRef(0);
  const userIdRef = useRef<string | null>(null);
  const pickedStateRef = useRef<StateRow | null>(null);
  const pickedDestRef = useRef<DestRow | null>(null);

  const prefact = (params?.prefact || '').toString();
  const currentAppVersion = Constants.expoConfig?.version ?? null;
  const orientation = windowWidth > windowHeight ? 'landscape' : 'portrait';
  const stepSixVariant = useMemo(
    () =>
      onboardingStepSix.resolveStepSixVariant({
        isInternalBuild: onboardingStepSix.isInternalOrTestBuild({
          isDev: typeof __DEV__ !== 'undefined' && __DEV__,
          appOwnership: Constants.appOwnership ?? null,
          executionEnvironment: Constants.executionEnvironment ?? null,
        }),
        rolloutFlag: process.env.EXPO_PUBLIC_ONBOARDING_STEP6_TREATMENT,
      }),
    []
  );
  const stepSixCopy = useMemo(
    () => onboardingStepSix.getStepSixCopy(stepSixVariant),
    [stepSixVariant]
  );

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
  const [wingmanDisabledAfterQueue, setWingmanDisabledAfterQueue] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const [rating, setRating] = useState<QuickRating>({
    crispiness: null,
    sauce: null,
    meat: null,
    overall: null,
  });
  const [ratingTags, setRatingTags] = useState<RatingTagOption[]>([]);
  const [ratingSaving, setRatingSaving] = useState(false);
  const [ratingError, setRatingError] = useState('');

  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewRoute, setPreviewRoute] = useState<any>(null);
  const quickRatingStartedRef = useRef(false);
  const quickRatingCompletedRef = useRef(false);

  useEffect(() => {
    stepRef.current = step;
    userIdRef.current = userId;
    pickedStateRef.current = pickedState;
    pickedDestRef.current = pickedDest;
  }, [step, userId, pickedState, pickedDest]);

  const complete = async () => {
    try {
      await AsyncStorage.setItem(ONBOARDING_DONE_KEY, '1');
    } catch {}
    completedRef.current = true;
    await trackEvent({
      eventName: 'onboarding_completed',
      screen: 'onboarding',
      userId,
      stateId: pickedState?.state_id ?? null,
      destinationId: pickedDest?.id && !String(pickedDest.id).startsWith('new:') ? pickedDest.id : null,
      metadata: {
        final_step: step,
        created_account: false,
        picked_destination: !!pickedDest?.id,
      },
    });
    safeComplete();
  };

  const trackOnboardingCompletePressed = useCallback(
    async (flowType: 'account' | 'guest') => {
      await trackEvent({
        eventName: 'onboarding_complete_pressed',
        screen: 'onboarding',
        userId,
        stateId: pickedState?.state_id ?? null,
        destinationId: pickedDest?.id && !String(pickedDest.id).startsWith('new:') ? pickedDest.id : null,
        metadata: {
          flow_type: flowType,
          screen_width: Math.round(windowWidth),
          screen_height: Math.round(windowHeight),
          safe_area_inset_bottom: Math.round(insets.bottom),
          orientation,
        },
      });
    },
    [
      insets.bottom,
      orientation,
      pickedDest?.id,
      pickedState?.state_id,
      userId,
      windowHeight,
      windowWidth,
    ]
  );

  const goToLogin = async () => {
    if (step === 7) {
      await trackOnboardingCompletePressed('account');
    }
    try {
      await AsyncStorage.setItem(ONBOARDING_DONE_KEY, '1');
    } catch {}
    completedRef.current = true;
    await trackEvent({
      eventName: 'onboarding_account_prompt_selected',
      screen: 'onboarding',
      userId,
      stateId: pickedState?.state_id ?? null,
      metadata: { step },
    });
    router.push('/auth/login');
    safeComplete();
  };

  const trackStepSixTransitionEvent = useCallback(
    async (eventName: string, extra: Record<string, any> = {}) => {
      const [anonymousUserId, sessionId] = await Promise.all([getAnonymousId(), getAnalyticsSessionId()]);
      const destinationId =
        pickedDest?.id && !String(pickedDest.id).startsWith('new:') ? pickedDest.id : null;
      const metadata = onboardingStepSix.buildStepSixMetadata({
        variant: stepSixVariant,
        eventName,
        ctaLabel: stepSixCopy.ctaLabel,
        ctaDestination: onboardingStepSix.STEP_SIX_DESTINATION,
        sessionId,
        anonymousUserId,
        clientPlatform: Platform.OS,
        appVersion: currentAppVersion,
        extra,
      });

      await trackEvent({
        eventName,
        screen: 'onboarding',
        userId,
        stateId: pickedState?.state_id ?? null,
        destinationId,
        metadata,
      });

      return { anonymousUserId, sessionId };
    },
    [
      currentAppVersion,
      pickedDest?.id,
      pickedState?.state_id,
      stepSixCopy.ctaLabel,
      stepSixVariant,
      userId,
    ]
  );

  const finalScreenAnalyticsMetadata = useCallback(
    () => ({
      device_platform: Platform.OS,
      screen_width: Math.round(windowWidth),
      screen_height: Math.round(windowHeight),
      safe_area_bottom_inset: Math.round(insets.bottom),
      orientation,
      font_scale: Number(fontScale.toFixed(2)),
    }),
    [fontScale, insets.bottom, orientation, windowHeight, windowWidth]
  );

  const trackFinalLayoutWarning = useCallback(
    async (reason: string, buttonFrame: Record<string, any> | null = null) => {
      if (finalLayoutWarningRef.current) return;
      finalLayoutWarningRef.current = true;
      console.warn('[onboarding] final CTA layout warning', { reason, buttonFrame });

      await trackEvent({
        eventName: 'onboarding_layout_warning',
        screen: 'onboarding',
        userId,
        stateId: pickedState?.state_id ?? null,
        destinationId: pickedDest?.id && !String(pickedDest.id).startsWith('new:') ? pickedDest.id : null,
        metadata: {
          ...finalScreenAnalyticsMetadata(),
          reason,
          button_frame: buttonFrame,
          safe_area: {
            top: Math.round(insets.top),
            right: Math.round(insets.right),
            bottom: Math.round(insets.bottom),
            left: Math.round(insets.left),
          },
        },
      });
    },
    [
      finalScreenAnalyticsMetadata,
      insets.bottom,
      insets.left,
      insets.right,
      insets.top,
      pickedDest?.id,
      pickedState?.state_id,
      userId,
    ]
  );

  const measureFinalPrimaryCta = useCallback(() => {
    if (step !== 7) return;

    const node = finalPrimaryCtaRef.current;
    if (!node || typeof node.measureInWindow !== 'function') {
      trackFinalLayoutWarning('button_not_measurable');
      return;
    }

    requestAnimationFrame(() => {
      node.measureInWindow(async (x: number, y: number, width: number, height: number) => {
        const buttonFrame = {
          x: Math.round(x),
          y: Math.round(y),
          width: Math.round(width),
          height: Math.round(height),
        };

        if (![x, y, width, height].every((value) => Number.isFinite(value)) || width <= 0 || height <= 0) {
          await trackFinalLayoutWarning('button_measurement_invalid', buttonFrame);
          return;
        }

        const visibleViewportBottom = windowHeight - insets.bottom;
        const isVisible = y >= 0 && y + height <= visibleViewportBottom;

        if (!isVisible) {
          await trackFinalLayoutWarning('button_outside_viewport', buttonFrame);
          return;
        }

        if (finalCtaVisibleRef.current) return;
        finalCtaVisibleRef.current = true;

        await trackEvent({
          eventName: 'onboarding_cta_visible',
          screen: 'onboarding',
          userId,
          stateId: pickedState?.state_id ?? null,
          destinationId:
            pickedDest?.id && !String(pickedDest.id).startsWith('new:') ? pickedDest.id : null,
          metadata: {
            milliseconds_from_screen_render: finalScreenRenderStartedAtRef.current
              ? Date.now() - finalScreenRenderStartedAtRef.current
              : null,
            bottom_inset: Math.round(insets.bottom),
            button_y_position: Math.round(y),
            button_height: Math.round(height),
            visible_viewport_bottom: Math.round(visibleViewportBottom),
            ...finalScreenAnalyticsMetadata(),
          },
        });
      });
    });
  }, [
    finalScreenAnalyticsMetadata,
    insets.bottom,
    pickedDest?.id,
    pickedState?.state_id,
    step,
    trackFinalLayoutWarning,
    userId,
    windowHeight,
  ]);

  useEffect(() => {
    trackEvent({
      eventName: 'onboarding_started',
      screen: 'onboarding',
      userId,
      metadata: { prefact_present: !!prefact },
    });
    return () => {
      if (completedRef.current) return;
      trackEvent({
        eventName: 'onboarding_abandoned',
        screen: 'onboarding',
        userId: userIdRef.current,
        stateId: pickedStateRef.current?.state_id ?? null,
        destinationId:
          pickedDestRef.current?.id && !String(pickedDestRef.current.id).startsWith('new:')
            ? pickedDestRef.current.id
            : null,
        metadata: {
          flow_step: stepRef.current,
          total_steps: TOTAL_STEPS,
        },
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    trackEvent({
      eventName: 'onboarding_step_viewed',
      screen: 'onboarding',
      userId,
      stateId: pickedState?.state_id ?? null,
      destinationId: pickedDest?.id && !String(pickedDest.id).startsWith('new:') ? pickedDest.id : null,
      metadata: { step, total_steps: TOTAL_STEPS },
    });
  }, [step, userId, pickedState?.state_id, pickedDest?.id]);

  useEffect(() => {
    if (step !== 7) {
      finalScreenViewedRef.current = false;
      finalCtaVisibleRef.current = false;
      finalLayoutWarningRef.current = false;
      finalScreenRenderStartedAtRef.current = null;
      return;
    }

    finalScreenRenderStartedAtRef.current = Date.now();

    if (finalScreenViewedRef.current) return;
    finalScreenViewedRef.current = true;

    trackEvent({
      eventName: 'onboarding_final_screen_viewed',
      screen: 'onboarding',
      userId,
      stateId: pickedState?.state_id ?? null,
      destinationId: pickedDest?.id && !String(pickedDest.id).startsWith('new:') ? pickedDest.id : null,
      metadata: finalScreenAnalyticsMetadata(),
    });
  }, [
    finalScreenAnalyticsMetadata,
    pickedDest?.id,
    pickedState?.state_id,
    step,
    userId,
  ]);

  useEffect(() => {
    if (step !== 7 || stepSixGateViewedRef.current) return;
    let alive = true;

    (async () => {
      const pendingContext = await AsyncStorage.getItem(onboardingStepSix.STEP_SIX_CONTEXT_KEY);
      if (!alive || !pendingContext) return;

      stepSixGateViewedRef.current = true;
      await trackStepSixTransitionEvent('account_gate_viewed', {
        source_transition: 'step6_to_account_gate',
      });
    })();

    return () => {
      alive = false;
    };
  }, [step, trackStepSixTransitionEvent]);

  useEffect(() => {
    if (step !== 7) return;

    const timeout = setTimeout(() => {
      measureFinalPrimaryCta();
    }, 0);

    return () => clearTimeout(timeout);
  }, [measureFinalPrimaryCta, step]);

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
      const { data } = await supabase.auth.getSession();
      if (alive) setUserId(data?.session?.user?.id ?? null);
    })();

    return () => {
      alive = false;
    };
  }, []);

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

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const { data, error } = await supabase
          .from('destination_tags')
          .select('id, tag')
          .order('tag', { ascending: true });

        if (error) throw error;
        if (!alive) return;

        setRatingTags(
          ((data as any[]) || []).map((row) => ({
            id: Number(row.id),
            tag: String(row.tag || '').trim(),
          })).filter((row) => Number.isFinite(row.id) && row.tag)
        );
      } catch {
        if (!alive) return;
        setRatingTags([]);
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

  const quickRatingSummary = useMemo(
    () =>
      QUICK_RATING_METRICS.map(({ key, label }) => ({
        key,
        label,
        value: rating[key],
      })).filter((item) => item.value != null),
    [rating]
  );

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

  const loadRestaurantsForState = async (
    state_id: number,
    options: { clearPickedDest?: boolean } = {}
  ) => {
    const { clearPickedDest = true } = options;

    setLoadingDests(true);
    if (clearPickedDest) setPickedDest(null);
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

  useEffect(() => {
    if (step !== 3 || !pickedDest?.id) return;

    quickRatingStartedRef.current = true;
    quickRatingCompletedRef.current = false;

    trackEvent({
      eventName: 'quick_rating_started',
      screen: 'onboarding',
      userId,
      stateId: pickedState?.state_id ?? null,
      destinationId: String(pickedDest.id).startsWith('new:') ? null : pickedDest.id,
      metadata: {
        flow_variant: QUICK_RATING_FLOW_VARIANT,
        dimensions: QUICK_RATING_METRICS.map((item) => item.key),
        measurement_note: QUICK_RATING_MEASUREMENT_NOTE,
      },
    });

    return () => {
      if (!quickRatingStartedRef.current || quickRatingCompletedRef.current) return;

      trackEvent({
        eventName: 'quick_rating_abandoned',
        screen: 'onboarding',
        userId,
        stateId: pickedState?.state_id ?? null,
        destinationId: String(pickedDest.id).startsWith('new:') ? null : pickedDest.id,
        metadata: {
          flow_step: stepRef.current,
          flow_variant: QUICK_RATING_FLOW_VARIANT,
          measurement_note: QUICK_RATING_MEASUREMENT_NOTE,
          resume_available: true,
        },
      });
      quickRatingStartedRef.current = false;
    };
  }, [step, pickedDest?.id, pickedState?.state_id, userId]);

  const submitOnboardingRating = async (payload: any) => {
    try {
      const destId = pickedDest?.id ?? null;
      if (!destId) {
        setRatingError('Choose a restaurant before finishing your rating.');
        return;
      }

      setRatingError('');
      const finalScores = payload?.scores ?? {};
      const isPseudo = String(destId).startsWith('new:');

      const nextRating = {
        crispiness: asInt(finalScores.crispiness ?? 1),
        sauce: asInt(finalScores.sauce ?? 1),
        meat: asInt(finalScores.meat ?? 1),
        overall: asInt(finalScores.overall ?? 1),
      };

      setRating(nextRating);

      const seedPayload = {
        destination_id: destId,
        state_id: pickedState?.state_id ?? null,
        state_code: pickedState?.state_code ?? null,
        crispiness: nextRating.crispiness,
        sauce: nextRating.sauce,
        meat: nextRating.meat,
        overall: nextRating.overall,
        tag_id: payload?.selectedTagId ?? null,
        would_order_again: payload?.wouldOrderAgain == null ? null : Boolean(payload.wouldOrderAgain),
        sauce_style: payload?.sauceStyle ?? null,
        flavor_vibe: Array.isArray(payload?.flavorVibe) ? payload.flavorVibe : [],
        spice_level: asInt(payload?.spiceLevel ?? null),
        wings_eaten: payload?.wingsEaten == null ? null : asInt(payload.wingsEaten),
        onboarding_seed: true,
        coin_rating: true,
        local_only: isPseudo,
        created_at: new Date().toISOString(),
      };

      await AsyncStorage.setItem(ONBOARDING_SEED_RATING_KEY, JSON.stringify(seedPayload));
      await trackEvent({
        eventName: 'rating_completed',
        screen: 'onboarding',
        userId,
        stateId: pickedState?.state_id ?? null,
        destinationId: isPseudo ? null : destId,
        metadata: {
          source: 'onboarding_seed',
          local_only: isPseudo,
          tag_id: payload?.selectedTagId ?? null,
          would_order_again: payload?.wouldOrderAgain == null ? null : Boolean(payload.wouldOrderAgain),
        },
      });
      await trackEvent({
        eventName: 'rating_submitted',
        screen: 'onboarding',
        userId,
        stateId: pickedState?.state_id ?? null,
        destinationId: isPseudo ? null : destId,
        metadata: {
          source: 'onboarding_seed',
          local_only: isPseudo,
          tag_id: payload?.selectedTagId ?? null,
          would_order_again: payload?.wouldOrderAgain == null ? null : Boolean(payload.wouldOrderAgain),
        },
      });
      quickRatingCompletedRef.current = true;
      quickRatingStartedRef.current = false;
      await trackEvent({
        eventName: 'quick_rating_completed',
        screen: 'onboarding',
        userId,
        stateId: pickedState?.state_id ?? null,
        destinationId: isPseudo ? null : destId,
        metadata: {
          flow_variant: QUICK_RATING_FLOW_VARIANT,
          overall: nextRating.overall,
          sauce: nextRating.sauce,
          crispiness: nextRating.crispiness,
          meat: nextRating.meat,
          measurement_note: QUICK_RATING_MEASUREMENT_NOTE,
        },
      });
      await trackEvent({
        eventName: 'onboarding_step_completed',
        screen: 'onboarding',
        userId,
        stateId: pickedState?.state_id ?? null,
        destinationId: isPseudo ? null : destId,
        metadata: {
          step: 3,
          total_steps: TOTAL_STEPS,
          flow_variant: QUICK_RATING_FLOW_VARIANT,
          measurement_note: QUICK_RATING_MEASUREMENT_NOTE,
        },
      });
      setStep(4);
    } catch (e) {
      console.warn('submitOnboardingRating failed:', e);
      await trackEvent({
        eventName: 'rating_validation_failed',
        screen: 'onboarding',
        userId,
        stateId: pickedState?.state_id ?? null,
        metadata: { source: 'onboarding_seed', error: e instanceof Error ? e.message : String(e) },
      });
      await trackEvent({
        eventName: 'error_shown',
        screen: 'onboarding',
        userId,
        stateId: pickedState?.state_id ?? null,
        metadata: {
          source: 'onboarding_seed',
          error_message: e instanceof Error ? e.message : String(e),
        },
      });
      setRatingError('Could not save that rating. Please try again.');
    }
  };

  const pickWingmanDestination = async (row: DestRow) => {
    if (!row?.id) return;

    const dest: DestRow = {
      id: row.id,
      name: row.name ?? 'Wing Spot',
      address: row.address ?? null,
      city: row.city ?? null,
      lat: row.lat ?? null,
      lng: row.lng ?? null,
    };

    setPickedDest(dest);
    setRatingError('');
    await saveDest(dest);
    await trackEvent({
      eventName: 'onboarding_destination_selected',
      screen: 'onboarding',
      userId,
      stateId: pickedState?.state_id ?? null,
      destinationId: dest.id,
      metadata: { source: 'wingman' },
    });
    setAddOpen(false);
    setStep(3);

    if (pickedState?.state_id) {
      loadRestaurantsForState(pickedState.state_id, { clearPickedDest: false });
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

    setStep((s) => Math.max(0, s - 1));
  };

  useEffect(() => {
    if (!pickedState?.state_id) return;
    loadRestaurantsForState(pickedState.state_id);
  }, [pickedState?.state_id]);

  const pickRestaurant = useCallback(
    async (d: DestRow) => {
      setPickedDest(d);
      setRatingError('');

      if (pickedState) {
        await saveState(pickedState);
      }
      await saveDest(d);
      await trackEvent({
        eventName: 'onboarding_destination_selected',
        screen: 'onboarding',
        userId,
        stateId: pickedState?.state_id ?? null,
        destinationId: d.id,
        metadata: { source: 'restaurant_list' },
      });
      await trackEvent({
        eventName: 'restaurant_selected',
        screen: 'onboarding',
        userId,
        stateId: pickedState?.state_id ?? null,
        destinationId: d.id,
        metadata: { source_screen: 'onboarding', source: 'restaurant_list' },
      });
      await trackEvent({
        eventName: 'onboarding_step_completed',
        screen: 'onboarding',
        userId,
        stateId: pickedState?.state_id ?? null,
        destinationId: d.id,
        metadata: {
          step: 2,
          total_steps: TOTAL_STEPS,
          source: 'restaurant_list',
        },
      });

      setStep(3);
    },
    [pickedState, userId]
  );

  return (
    <SafeAreaView
      testID="onboarding.root"
      edges={['top', 'left', 'right']}
      style={[
        styles.wrap,
        {
          backgroundColor: colors.background,
          paddingBottom: step === 7 ? 0 : insets.bottom + 12,
        },
      ]}
    >
      {step !== 0 && step !== 3 ? (
        <View style={{ paddingTop: 6, flexDirection: 'row', alignItems: 'center' }}>
          <Pressable testID="onboarding.back" onPress={goBack} hitSlop={12} style={{ paddingVertical: 8, paddingHorizontal: 8 }}>
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
            testID="onboarding.next"
            mode="contained"
            onPress={() => setStep(1)}
            style={styles.primaryBtn}
            contentStyle={{ paddingVertical: 10 }}
          >
            Let’s begin
          </Button>

          <Text style={styles.tiny}>Your first wing rating takes less than a minute.</Text>

          <ProgressDots step={step} total={TOTAL_STEPS} />

          <Pressable testID="onboarding.skip" onPress={goToLogin} style={{ marginTop: 12 }}>
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
                            await trackEvent({
                              eventName: 'onboarding_state_selected',
                              screen: 'onboarding',
                              userId,
                              stateId: s.state_id,
                              metadata: {
                                state_code: s.state_code ?? null,
                                state_name: s.state_name ?? null,
                              },
                            });
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
                  <View style={{ paddingVertical: 18, paddingHorizontal: 16, alignItems: 'center' }}>
                    <Text
                      style={{
                        textAlign: 'center',
                        fontWeight: '900',
                        opacity: pickedState?.state_id ? 0.9 : 0.4,
                      }}
                    >
                      No Matches
                    </Text>
                  </View>
                ) : null}

                {pickedState?.state_id ? (
                  <View style={{ padding: 12 }}>
                    {wingmanDisabledAfterQueue ? (
                      <Tooltip
                        title="Please rate an existing BuffaGo restaurant."
                        enterTouchDelay={0}
                        leaveTouchDelay={1800}
                      >
                        <Pressable onPress={() => {}}>
                          <View pointerEvents="none">
                            <Button mode="contained" icon="robot-outline" disabled>
                              Finish Onboarding to use Wingman
                            </Button>
                          </View>
                        </Pressable>
                      </Tooltip>
                    ) : (
                      <Button
                        mode="contained"
                        icon="robot-outline"
                        onPress={() => setAddOpen(true)}
                      >
                        Add with Wingman
                      </Button>
                    )}
                  </View>
                ) : null}
              </ScrollView>
            )}
          </View>

          <ProgressDots step={step} total={TOTAL_STEPS} />

          <WingmanAddDialog
            visible={addOpen}
            onDismiss={() => setAddOpen(false)}
            initialRestaurant={destQ}
            initialStateId={pickedState?.state_id ?? null}
            initialStateCode={pickedState?.state_code ?? null}
            userId={userId}
            onPickDestination={pickWingmanDestination}
            manualReviewQueuedMessage={
              "We couldn't find anything online confirming they have wings on the menu, so we're adding it to the queue. For onboarding, please pick a BuffaGo restaurant for your first rating."
            }
            showCloseOnResultMessage
            onManualReviewQueued={async (suggestion: any) => {
              try {
                const restaurantName = String(suggestion?.restaurant_name || destQ || '').trim();
                if (!userId && restaurantName) {
                  await AsyncStorage.setItem(
                    ONBOARDING_DEST_SUGGESTION_KEY,
                    JSON.stringify({
                      state_id: suggestion?.state_id ?? pickedState?.state_id ?? null,
                      restaurant_name: restaurantName,
                      address: suggestion?.address ?? null,
                      saved_at: new Date().toISOString(),
                    })
                  );
                }
              } catch {}
              setWingmanDisabledAfterQueue(true);
              setDestQ('');
              setPickedDest(null);
            }}
          />
        </View>
      ) : null}

      {step === 3 ? (
        <View style={styles.screen}>
          <View style={styles.center}>
            <Text style={styles.title}>Quick rate your wings</Text>
            <Text style={styles.body}>
              {pickedDest?.name ? `How was ${pickedDest.name}?` : 'Rate this wing spot'}
            </Text>

            <View
              style={{
                width: '100%',
                maxWidth: 520,
                padding: 14,
                borderRadius: 18,
                backgroundColor: 'rgba(255,255,255,0.06)',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.10)',
                marginTop: 16,
              }}
            >
              <Text style={{ fontWeight: '900', textAlign: 'center', marginBottom: 8 }}>
                Fast first rating
              </Text>
              <Text style={{ textAlign: 'center', opacity: 0.82, lineHeight: 20 }}>
                Start with overall, sauce or rub, crispiness, and chicken quality. You can expand into the
                deeper review later.
              </Text>
            </View>

            <View style={{ height: 18 }} />

            <Text style={{ textAlign: 'center', opacity: 0.7 }}>
              Use the back arrow in the rating dialog if you want to return to restaurant selection.
            </Text>

            {!!ratingError ? (
              <Text style={{ textAlign: 'center', color: '#d32f2f', fontWeight: '800', marginTop: 10 }}>
                {ratingError}
              </Text>
            ) : null}

            <ProgressDots step={step} total={TOTAL_STEPS} />
          </View>

          <RatingWizardDialog
            visible={step === 3}
            destinationName={pickedDest?.name || 'Rate your wings'}
            tagOptions={ratingTags}
            saving={ratingSaving}
            flowVariant={QUICK_RATING_FLOW_VARIANT}
            onDismiss={() => {
              if (!ratingSaving) goBack();
            }}
            onFinalize={async (payload: any) => {
              setRatingSaving(true);
              try {
                await submitOnboardingRating(payload);
              } finally {
                setRatingSaving(false);
              }
            }}
            finalizeLabel="Finish rating"
          />
        </View>
      ) : null}

      {step === 4 ? (
        <View style={styles.center}>
          <Image source={require('../assets/wing-user.png')} style={styles.host} resizeMode="contain" />

          <Text style={styles.title}>Quick rating complete</Text>

          <Text style={styles.body}>
            Your first Wingdex entry is in. That gives BuffaGo an instant read on your taste so the app can
            start feeling personal right away.
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
            <Text style={{ fontWeight: '900', marginBottom: 10, textAlign: 'center' }}>
              Your quick rating payoff
            </Text>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 }}>
              {quickRatingSummary.map((item) => (
                <View
                  key={item.key}
                  style={{
                    minWidth: 108,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    borderRadius: 14,
                    backgroundColor: 'rgba(255,255,255,0.05)',
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.08)',
                  }}
                >
                  <Text style={{ fontSize: 12, opacity: 0.72, textAlign: 'center' }}>{item.label}</Text>
                  <Text style={{ fontSize: 22, fontWeight: '900', textAlign: 'center', marginTop: 4 }}>
                    {item.value}/10
                  </Text>
                </View>
              ))}
            </View>

            <View style={{ height: 12 }} />

            <Text style={{ opacity: 0.82, lineHeight: 20, textAlign: 'center' }}>
              Want more detail later? Open this restaurant again for the full review with flavor, heat, tags,
              and comeback notes.
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
              Each stop is a tile. Go to the first restaraunt. Eat. Have Fun. Rate it. Unlock the next tile! Try the next tile another day or tackle it right away. It&apos;s up to you.
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
              If trying to complete a crawl in a single day, there&apos;s no shame in splitting the smallest wing-size with a friend at each destination.
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

          <Text style={styles.title}>{stepSixCopy.title}</Text>

          <Text style={styles.body}>{stepSixCopy.body}</Text>

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
                <Text style={{ fontWeight: '900' }}>Friends & privacy</Text>
                <Text style={{ opacity: 0.82, lineHeight: 20, marginTop: 4 }}>
                  Social features are optional. Add friends by mutual approval, or opt out in Settings to hide
                  from leaderboards, feeds, friend search, and friend activity.
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

          <Text style={[styles.tiny, { maxWidth: 420, textAlign: 'center' }]}>
            {stepSixCopy.helper}
          </Text>

          <View style={{ height: 18 }} />

          <Button
            mode="contained"
            onPress={async () => {
              const { anonymousUserId, sessionId } = await trackStepSixTransitionEvent('cta_clicked', {
                source_transition: 'step6_to_account_gate',
              });

              try {
                const context = onboardingStepSix.createPendingStepSixContext({
                  variant: stepSixVariant,
                  ctaLabel: stepSixCopy.ctaLabel,
                  ctaDestination: onboardingStepSix.STEP_SIX_DESTINATION,
                  sessionId,
                  anonymousUserId,
                  clientPlatform: Platform.OS,
                  appVersion: currentAppVersion,
                });
                await AsyncStorage.setItem(
                  onboardingStepSix.STEP_SIX_CONTEXT_KEY,
                  JSON.stringify(context)
                );
              } catch {}

              setStep(7);
            }}
            style={styles.primaryBtn}
            contentStyle={{ paddingVertical: 10 }}
            labelStyle={{ fontWeight: '900' }}
          >
            {stepSixCopy.ctaLabel}
          </Button>

          <ProgressDots step={step} total={TOTAL_STEPS} />
        </View>
      ) : null}

      {step === 7 ? (
        <View style={styles.screen}>
          <ScrollView
            style={styles.flexFill}
            contentContainerStyle={[
              styles.finalStepContent,
              {
                paddingTop: 12,
                paddingBottom: 24,
              },
            ]}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.title}>Save your journey</Text>
            <Text style={styles.body}>
              Create an account to keep XP, streaks, and your full Wingdex. Or continue as a guest.
            </Text>

            <View style={{ height: 18 }} />

            <View
              style={{
                width: '100%',
                maxWidth: 520,
                padding: 14,
                borderRadius: 18,
                backgroundColor: 'rgba(255,255,255,0.06)',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.10)',
                alignSelf: 'center',
              }}
            >
              <Text style={{ fontWeight: '900', textAlign: 'center', marginBottom: 8 }}>
                Keep your progress
              </Text>
              <Text style={{ textAlign: 'center', opacity: 0.82, lineHeight: 20 }}>
                Accounts keep your XP, streaks, and full Wingdex synced. Guest mode still works if you want to
                jump in now.
              </Text>
            </View>

            <ProgressDots step={step} total={TOTAL_STEPS} />
          </ScrollView>

          <View
            style={[
              styles.finalStepFooter,
              {
                paddingBottom: insets.bottom + 16,
              },
            ]}
          >
            <View ref={finalPrimaryCtaRef} onLayout={() => measureFinalPrimaryCta()} collapsable={false}>
              <Button
                mode="contained"
                onPress={goToLogin}
                style={styles.primaryBtn}
                contentStyle={{ paddingVertical: 10 }}
              >
                Create account
              </Button>
            </View>

            <View style={{ height: 12 }} />

            <Button
              mode="outlined"
              onPress={async () => {
                await trackOnboardingCompletePressed('guest');
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
          </View>
        </View>
      ) : null}
    </SafeAreaView>
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
    paddingTop: 16,
  },
  flexFill: {
    flex: 1,
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
  finalStepContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  finalStepFooter: {
    paddingTop: 12,
    backgroundColor: 'transparent',
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
