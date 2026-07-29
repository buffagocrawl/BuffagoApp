// app/crawl/[id].jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Alert,
  StyleSheet,
  Image,
  Platform,
  Pressable,
  Linking,
  ImageBackground,
  Animated,
  Easing,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../lib/supabase.js';
import { trackEvent } from '../../lib/analytics';
import RatingWizardDialog from '../../components/RatingWizardDialog';
import RatingComparisonModal from '../../components/RatingComparisonModal';
import { WingShotFlow } from '../../components/wingShots';
import { averageBeforeSubmission } from '../../lib/ratingComparison.js';
import { useLocationCtx } from '../../providers/LocationProvider';
import { useWingShotsFeatureFlags } from '../../hooks/useWingShotsFeatureFlags';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { grantXp, XP } from '../../utils/xp';
import { useXpToast } from '../../providers/XpToastProvider';

import {
  ActivityIndicator,
  Button,
  Dialog,
  Portal,
  Text,
  FAB,
  Divider,
  useTheme,
  ProgressBar,
  Avatar,
} from 'react-native-paper';

const toStr = (v) => (Array.isArray(v) ? v[0] : v) ?? undefined;

/* ------------------------- Utility helpers ------------------------- */
const ADMIN_ID = '23898359-306a-4dd3-91f0-da66da19ccfc';

// 100 yards in meters
const RATE_RADIUS_M = 91.44;

const TILE_GAP = 12;
const stepStride = 86;

// --- Haptics (iOS + Android) ---
const HAPTIC_DEBOUNCE_MS = 900;

function makeHapticReject(refLastAt) {
  return async () => {
    const now = Date.now();
    if (refLastAt.current && now - refLastAt.current < HAPTIC_DEBOUNCE_MS) return;
    refLastAt.current = now;

    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } catch {
      // ignore
    }
  };
}

/** Clamp a score to integer 1–10 */
const toNumber = (v, def = 5) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(1, Math.min(10, Math.round(n)));
};

function distanceM(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // meters
  const toRad = (d) => (d * Math.PI) / 180;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lon2 - lon1);
  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function getFreshCoords(fallback) {
  try {
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
      maximumAge: 1000,
      timeout: 5000,
    });
    return {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracy: pos.coords.accuracy ?? null,
    };
  } catch (e) {
    console.warn('getFreshCoords failed, using fallback:', e?.message || e);
    return fallback ?? null;
  }
}

async function openExternalDirections(lat, lng, mode = 'driving') {
  try {
    if (lat == null || lng == null) return;
    const la = Number(lat);
    const lo = Number(lng);
    if (!Number.isFinite(la) || !Number.isFinite(lo)) return;

    const isIOS = Platform.OS === 'ios';
    const dirFlag = mode === 'walking' ? 'w' : 'd';

    const url = isIOS
      ? `http://maps.apple.com/?daddr=${la},${lo}&dirflg=${dirFlag}`
      : `google.navigation:q=${la},${lo}&mode=${dirFlag}`;

    await trackEvent({
      eventName: 'directions_tapped',
      screen: 'crawl',
      metadata: { mode, source: 'crawl_stop' },
    });
    await Linking.openURL(url);
  } catch (e) {
    await trackEvent({
      eventName: 'external_maps_failed',
      screen: 'crawl',
      metadata: { mode, error: e?.message || String(e) },
    });
    console.warn('openExternalDirections failed:', e?.message || e);
  }
}

function fmt2(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return Number(n).toFixed(1);
}

/** Fetch stops for a route by joining stop1_id..stop5_id to destinations. */
async function fetchRouteStops(routeId) {
  const { data, error } = await supabase
    .from('routes')
    .select(
      `
      id,
      title,
      stop1:stop1_id ( id, name, address, lat, lng ),
      stop2:stop2_id ( id, name, address, lat, lng ),
      stop3:stop3_id ( id, name, address, lat, lng ),
      stop4:stop4_id ( id, name, address, lat, lng ),
      stop5:stop5_id ( id, name, address, lat, lng )
    `
    )
    .eq('id', routeId)
    .single();

  if (error) throw error;

  const raw = [data.stop1, data.stop2, data.stop3, data.stop4, data.stop5].filter(Boolean);

  const stops = raw
    .map((d, i) => ({
      ord: i + 1,
      id: d.id,
      name: d.name,
      address: d.address ?? '',
      lat: d.lat != null ? Number(d.lat) : null,
      lng: d.lng != null ? Number(d.lng) : null,
    }))
    .filter((d) => d.lat != null && d.lng != null);

  // Default mode
  const travelMode = 'walking';

  return { title: data.title, stops, travelMode };
}

/* ------------------ Dialog header: arrow top-left ------------------ */
function DialogHeaderArrow({ title, onBack }) {
  const theme = useTheme();
  return (
    <View style={styles.dialogHeader}>
      <Pressable onPress={onBack} hitSlop={10} style={styles.dialogBackBtn}>
        <MaterialCommunityIcons name="arrow-left" size={26} color={theme.colors.primary} />
      </Pressable>

      <View style={{ flex: 1, paddingRight: 32 }}>
        <Text style={styles.dialogTitleText} numberOfLines={2}>
          {title}
        </Text>
      </View>
    </View>
  );
}

/* ------------------ Report visuals -------------------------- */
function ReportRow({ name, yours, avg, delta, metrics = [] }) {
  const theme = useTheme();
  const isDark = !!theme.dark;
  const better = delta > 0;
  const worse = delta < 0;

  const bg = better
    ? isDark
      ? '#0f2e1b'
      : '#E6F5EA'
    : worse
      ? isDark
        ? '#3a1616'
        : '#FDE7E7'
      : isDark
        ? '#2a2a2a'
        : '#EEE';

  return (
    <View style={styles.reportRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.reportName}>{name}</Text>
        <Text style={styles.reportSub}>
          You: {fmt2(yours)} • Avg: {fmt2(avg)}
        </Text>
        {metrics.length ? (
          <View style={styles.reportMetricGrid}>
            {metrics.map((metric) => (
              <Text key={metric.label} style={styles.reportMetricText}>
                {metric.label}: {fmt2(metric.yours)}/{fmt2(metric.avg)}
              </Text>
            ))}
          </View>
        ) : null}
      </View>

      <View style={[styles.pill, { backgroundColor: bg }]}>
        <Text style={[styles.pillText, { color: theme.colors.onSurface }]}>
          {better ? '▲' : worse ? '▼' : '•'} {fmt2(Math.abs(delta))}
        </Text>
      </View>
    </View>
  );
}

function MetricRow({ label, yours, avg }) {
  const theme = useTheme();
  const isDark = !!theme.dark;
  const delta = (yours ?? 0) - (avg ?? 0);

  const bg =
    delta > 0
      ? isDark
        ? '#0f2e1b'
        : '#E6F5EA'
      : delta < 0
        ? isDark
          ? '#3a1616'
          : '#FDE7E7'
        : isDark
          ? '#2a2a2a'
          : '#EEE';

  return (
    <View style={styles.metricRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.reportName}>{label}</Text>
        <Text style={styles.reportSub}>
          You: {fmt2(yours)} • Avg: {fmt2(avg)}
        </Text>
      </View>

      <View style={[styles.pill, { backgroundColor: bg }]}>
        <Text style={[styles.pillText, { color: theme.colors.onSurface }]}>
          {delta > 0 ? '▲' : delta < 0 ? '▼' : '•'} {fmt2(Math.abs(delta))}
        </Text>
      </View>
    </View>
  );
}

/* ------------------ “Step Tile” ------------------ */
function StepTile({
  ord,
  state,
  name,
  onPress,
  isStart,
  leftIcon,
  unlockHint,
  score,
  showWingUser,
  showGhostUser,
  presenceUsers = [],
  onPressPresence,
  subtitle,
}) {
  const theme = useTheme();
  const isLocked = state === 'locked';
  const isRated = state === 'rated';
  const isCurrent = state === 'current';
  const ORANGE_BG = 'rgba(255,111,0,0.18)';
  const ORANGE_BR = 'rgba(255,111,0,0.95)';
  const scale = useRef(new Animated.Value(1)).current;

  const pressIn = () => {
    Animated.spring(scale, { toValue: 0.98, useNativeDriver: true, speed: 30, bounciness: 0 }).start();
  };

  const pressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 0 }).start();
  };

  const tileBg =
    isStart || isRated
      ? 'rgba(34,197,94,0.22)'
      : isCurrent
        ? ORANGE_BG
        : 'rgba(255,255,255,0.06)';

  const border =
    isStart || isRated
      ? 'rgba(34,197,94,0.85)'
      : isCurrent
        ? ORANGE_BR
        : 'rgba(255,255,255,0.16)';

  const bob = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!showWingUser) return;

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, {
          toValue: 1,
          duration: 850,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(bob, {
          toValue: 0,
          duration: 850,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    loop.start();
    return () => loop.stop();
  }, [bob, showWingUser]);

  const wingAnimStyle = showWingUser
    ? {
        transform: [
          {
            translateY: bob.interpolate({
              inputRange: [0, 1],
              outputRange: [0, -6],
            }),
          },
          {
            rotate: bob.interpolate({
              inputRange: [0, 1],
              outputRange: ['-2deg', '2deg'],
            }),
          },
          {
            scale: bob.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 1.04],
            }),
          },
        ],
      }
    : null;

  return (
    <View style={styles.tileShell}>
      <Pressable
        onPress={onPress}
        onPressIn={() => {
          pressIn();
          if (Platform.OS === 'ios' && !isLocked) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          }
        }}
        onPressOut={pressOut}
        disabled={isLocked}
        android_ripple={isLocked ? undefined : { color: 'rgba(255,255,255,0.12)' }}
        style={{ borderRadius: 18 }}
      >
        <Animated.View
          style={[
            styles.stepTile,
            {
              backgroundColor: tileBg,
              borderColor: border,
              opacity: isLocked ? 0.55 : 1,
              shadowColor: isCurrent ? '#FF6F00' : '#000',
              shadowOpacity: isCurrent ? 0.45 : 0.18,
              shadowRadius: isCurrent ? 14 : 6,
              shadowOffset: { width: 0, height: 8 },
              elevation: isCurrent ? 8 : 2,
              transform: [{ skewX: '-6deg' }, { scale }],
            },
          ]}
        >
          {showWingUser ? (
            <Animated.Image source={WING_USER} resizeMode="contain" style={[styles.wingUser, wingAnimStyle]} />
          ) : null}

          {!showWingUser && showGhostUser ? (
            <Image source={WING_USER} resizeMode="contain" style={styles.wingUserGhost} />
          ) : null}

          <View style={styles.stepTileTopRow}>
            <View style={styles.stepTileNumWrap}>
              {leftIcon ? <Text style={styles.stepTileIcon}>{leftIcon}</Text> : <Text style={styles.stepTileNum}>{ord}</Text>}
            </View>

            <View style={styles.stepTileTextWrap}>
              <Text style={[styles.stepTileTitle, isLocked && { opacity: 0.82 }]} numberOfLines={2}>
                {isStart ? 'Start' : (name ? String(name) : `Stop ${ord}`)}
              </Text>

              <Text style={styles.stepTileSub} numberOfLines={1}>
                {isStart
                  ? (subtitle || 'Get Crawling!')
                  : isRated
                    ? `Rated${score != null && Number.isFinite(Number(score)) ? ` • ${Number(score).toFixed(0)}` : ''}`
                    : isCurrent
                      ? 'Tap to rate'
                      : 'Locked'}
              </Text>

              {isLocked && unlockHint ? (
                <Text style={styles.stepTileHint} numberOfLines={1}>
                  {unlockHint}
                </Text>
              ) : null}
            </View>
          </View>
        </Animated.View>

        <View style={styles.stepTileShadowBase} />
      </Pressable>

      {/* Presence overlay: clickable even when locked */}
      {Array.isArray(presenceUsers) && presenceUsers.length > 0 ? (
        <Pressable onPress={() => onPressPresence?.(ord, presenceUsers)} hitSlop={12} style={styles.presenceUnderNumBtn}>
          <View style={styles.presenceUnderNumRow} pointerEvents="none">
            {presenceUsers.slice(0, 3).map((u, idx) => (
              <View key={`${u.user_id}-${idx}`} style={{ marginLeft: idx === 0 ? 0 : -8 }}>
                <Avatar.Text size={18} label={(u.label || 'P').slice(0, 1).toUpperCase()} />
              </View>
            ))}
            {presenceUsers.length > 3 ? <Text style={styles.presenceMore}>+{presenceUsers.length - 3}</Text> : null}
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}

const CRAWL_BG = require('../../assets/crawl-bg.png');
const WING_USER = require('../../assets/wing-user.png');

/* ============================ Main screen ============================ */
export default function CrawlScreen() {
  const theme = useTheme();
  const isDark = !!theme.dark;
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { coords } = useLocationCtx();
  const xpToast = useXpToast();

  const pressingRef = useRef(false);
  const lastTooFarAtRef = useRef(0);
  const verifiedRatingLocationRef = useRef(null);

  const [presenceOpen, setPresenceOpen] = useState(false);
  const [presenceLoading, setPresenceLoading] = useState(false);
  const [stepMates, setStepMates] = useState([]);
  const [presenceByOrd, setPresenceByOrd] = useState(new Map());
  const [presenceOrd, setPresenceOrd] = useState(null);

  const showAwards = (awards) => {
    if (!awards?.length) return;
    if (xpToast?.showMany) xpToast.showMany(awards);
    else if (xpToast?.show) awards.forEach((a) => xpToast.show(a.amount, a.reason));
  };

  const [pendingCoinPopup, setPendingCoinPopup] = useState(false);
  const [goHomeAfterCoin, setGoHomeAfterCoin] = useState(false);

  const [reportOpen, setReportOpen] = useState(false);

  const closeReportAndMaybeShowCoin = useCallback(() => {
    if (pendingCoinPopup) {
      setPendingCoinPopup(false);
      setGoHomeAfterCoin(true);
      setReportOpen(false);

      setTimeout(() => {
        setCrawlCoinOpen(true);
      }, 250);

      return;
    }

    setReportOpen(false);
    router.replace('/home');
  }, [pendingCoinPopup, router]);

  const handlePressPresence = (ord, users) => {
    setPresenceOrd(ord);
    setStepMates(Array.isArray(users) ? users : []);
    setPresenceOpen(true);
  };

  // --- haptic rejection debounce ---
  const lastRejectHapticAtRef = useRef(0);
  const hapticReject = useMemo(() => makeHapticReject(lastRejectHapticAtRef), []);

  const MS_PER_HOUR = 60 * 60 * 1000;
  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  function computeCrawlCoinAward(startIso, endIso) {
    const s = startIso ? new Date(startIso).getTime() : null;
    const e = endIso ? new Date(endIso).getTime() : null;

    if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) {
      return { delta: 1, label: 'Over 7 days', reason: 'crawl_complete_7d_plus' };
    }

    const durMs = e - s;

    if (durMs < 24 * MS_PER_HOUR) {
      return { delta: 5, label: 'Under 24 hours', reason: 'crawl_complete_under_24h' };
    }

    if (durMs <= 7 * MS_PER_DAY) {
      return { delta: 3, label: '1–7 days', reason: 'crawl_complete_1_7_days' };
    }

    return { delta: 1, label: 'Over 7 days', reason: 'crawl_complete_7d_plus' };
  }

  const [crawl, setCrawl] = useState(null);
  const [routeMeta, setRouteMeta] = useState({ title: '', stops: [], travelMode: 'walking' });
  const [loading, setLoading] = useState(true);

  const awardCrawlCoins = useCallback(
    async ({ start_time, end_time }) => {
      try {
        const { data } = await supabase.auth.getSession();
        const uid = data?.session?.user?.id ?? null;
        if (!uid) return;

        const { delta, label, reason } = computeCrawlCoinAward(start_time, end_time);

        const { error } = await supabase.from('buffacoin_ledger').insert({
          user_id: uid,
          delta,
          reason,
          crawl_id: crawl?.crawl_id ?? null,
        });

        if (error) throw error;

        setCrawlCoinAmount(delta);
        setCrawlCoinLabel(label);
        setPendingCoinPopup(true);
      } catch (e) {
        console.warn('awardCrawlCoins failed:', e?.message || e);
      }
    },
    [crawl?.crawl_id]
  );

  // --- Leaderboard helpers ---
  const ceilDays = (startIso, endIso) => {
    const s = startIso ? new Date(startIso).getTime() : null;
    const e = endIso ? new Date(endIso).getTime() : null;
    if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return 1;
    return Math.max(1, Math.ceil((e - s) / MS_PER_DAY));
  };

  const fmtFinishDate = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isFinite(d.getTime()) ? d.toLocaleDateString() : '—';
  };

  const [lbOpen, setLbOpen] = useState(false);
  const [lbLoading, setLbLoading] = useState(false);
  const [lbRows, setLbRows] = useState([]);

  const { id: idParam, prefact, resume } = useLocalSearchParams();
  const crawlId = toStr(idParam);
  const preFact = toStr(prefact);
  const isResume = ['1', 'true', 'yes'].includes(String(toStr(resume) || '').toLowerCase());

  const initialFact = preFact && preFact.length > 0 ? preFact : 'Loading a wing fact…';
  const [fact, setFact] = useState(initialFact);

  // fun facts shown while loading (rotate every ~3s)
  const FUN_FACTS = useMemo(
    () => [
      'Classic Buffalo sauce = cayenne hot sauce + melted butter.',
      'The first Buffalo wings were popularized in Buffalo, NY.',
      'Crispy wings usually come from a dry skin + hot oil combo.',
      'Flats vs drums: the rivalry is real.',
      'Air-drying wings in the fridge helps crispiness.',
      'Blue cheese or ranch? Choose wisely.',
    ],
    []
  );

  const [session, setSession] = useState(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (alive) setSession(data.session ?? null);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, newSession) => {
      setSession(newSession ?? null);
    });
    return () => {
      alive = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  const isAdmin = session?.user?.id === ADMIN_ID;
  const isSignedIn = !!session?.user?.id;
  const { flags: wingShotFlags } = useWingShotsFeatureFlags(isSignedIn);

  // rating wizard (component owned)
  const [rateVisible, setRateVisible] = useState(false);
  const [wingShotVisible, setWingShotVisible] = useState(false);
  const [eligibleWingShotRatingId, setEligibleWingShotRatingId] = useState(null);
  const [wingShotSubmitted, setWingShotSubmitted] = useState(false);
  const postRatingAdvancedRef = useRef(false);

  // preflight proximity overlay (shows BEFORE rating modal)
  const [preflightVisible, setPreflightVisible] = useState(false);
  const [preflightMsg, setPreflightMsg] = useState('Checking distance…');

  const [activeDest, setActiveDest] = useState(null);
  const [tagOptions, setTagOptions] = useState([]);
  const [saving, setSaving] = useState(false);

  const [ratedDestIds, setRatedDestIds] = useState(new Set());
  const [ratedScores, setRatedScores] = useState(new Map()); // dest_id -> weight_score

  // report
  const [reportRows, setReportRows] = useState([]);
  const [reportBusy, setReportBusy] = useState(false);

  // drill-down
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailBusy, setDetailBusy] = useState(false);
  const [detailTitle, setDetailTitle] = useState('');
  const [detailRows, setDetailRows] = useState([]);

  // Dedicated post-rating comparison (separate from restaurant detail/summary dialogs)
  const [comparisonVisible, setComparisonVisible] = useState(false);
  const [comparisonData, setComparisonData] = useState(null);

  // crawl completion coin popup
  const [crawlCoinOpen, setCrawlCoinOpen] = useState(false);
  const [crawlCoinAmount, setCrawlCoinAmount] = useState(0);
  const [crawlCoinLabel, setCrawlCoinLabel] = useState('');

  // already-rated summary dialog
  const [summaryVisible, setSummaryVisible] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryData, setSummaryData] = useState(null);

  // Rotate facts while loading
  useEffect(() => {
    if (!loading) return;

    let alive = true;
    let idx = 0;

    const tick = () => {
      if (!alive) return;
      setFact((prev) => {
        if (prev && prev !== 'Loading a wing fact…' && prev !== initialFact) return prev;
        const next = FUN_FACTS[idx % FUN_FACTS.length];
        idx += 1;
        return next;
      });
    };

    tick();
    const t = setInterval(tick, 3000);

    return () => {
      alive = false;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, FUN_FACTS]);

  /** Load crawl + route with fun-fact delay */
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!crawlId) throw new Error('Missing crawl id');
        setLoading(true);
        const start = Date.now();

        const { data: crawlRow, error: e1 } = await supabase
          .from('crawls')
          .select('crawl_id, route_id, user_id, status, start_time, end_time')
          .eq('crawl_id', crawlId)
          .single();
        if (e1) throw e1;

        const { title, stops, travelMode } = await fetchRouteStops(crawlRow.route_id);

        const elapsed = Date.now() - start;
        const remaining = Math.max(0, 100 - elapsed);
        if (remaining) await new Promise((r) => setTimeout(r, remaining));

        if (!mounted) return;

        setFact((prev) =>
          prev && prev !== 'Loading a wing fact…'
            ? prev
            : 'Classic Buffalo sauce = cayenne pepper hot sauce + melted butter.'
        );

        setCrawl(crawlRow);
        setRouteMeta({ title, stops, travelMode });
        await trackEvent({
          eventName: isResume ? 'crawl_resumed' : 'crawl_viewed',
          screen: 'crawl',
          userId: crawlRow?.user_id ?? null,
          crawlId: crawlRow?.crawl_id ?? null,
          routeId: crawlRow?.route_id ?? null,
          metadata: {
            status: crawlRow?.status ?? null,
            total_stops: stops?.length ?? 0,
            load_duration_ms: Date.now() - start,
          },
        });
      } catch (e) {
        await trackEvent({
          eventName: 'screen_load_failed',
          screen: 'crawl',
          crawlId,
          metadata: { error: e?.message || String(e) },
        });
        Alert.alert('Error', e.message ?? String(e));
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [crawlId, isResume]);

  /** Load existing ratings (ids + scores) */
  useEffect(() => {
    (async () => {
      if (!crawl?.crawl_id) return;
      const { data: sessionRes } = await supabase.auth.getSession();
      const userId = sessionRes?.session?.user?.id ?? null;

      let q = supabase
        .from('destination_ratings')
        .select('destination_id, weight_score')
        .eq('crawl_id', crawl.crawl_id);

      q = userId ? q.eq('user_id', userId) : q.is('user_id', null);

      const { data, error } = await q;
      if (!error && Array.isArray(data)) {
        setRatedDestIds(new Set(data.map((r) => r.destination_id)));
        const m = new Map();
        for (const r of data) m.set(r.destination_id, r.weight_score != null ? Number(r.weight_score) : null);
        setRatedScores(m);
      }
    })();
  }, [crawl?.crawl_id]);

  const loadTagsForDestination = async (destinationId) => {
    const isMissingTable = (err) =>
      !!err && /does not exist|schema cache|relation .* does not exist/i.test(err.message || '');

    const loadAllTags = async () => {
      const { data, error } = await supabase
        .from('destination_tags')
        .select('id, tag')
        .order('tag', { ascending: true });
      if (error) throw error;
      setTagOptions(data || []);
    };

    try {
      const { data: mapRows, error: mapErr } = await supabase
        .from('destination_tag_map')
        .select('tag_id')
        .eq('destination_id', destinationId);

      if (mapErr) {
        if (isMissingTable(mapErr)) {
          await loadAllTags();
          return;
        }
        throw mapErr;
      }

      if (!mapRows?.length) {
        await loadAllTags();
        return;
      }

      const ids = mapRows.map((r) => r.tag_id);

      const { data: tags, error: tErr } = await supabase
        .from('destination_tags')
        .select('id, tag')
        .in('id', ids)
        .order('tag', { ascending: true });

      if (tErr) throw tErr;

      setTagOptions(tags || []);
    } catch (e) {
      console.warn('Failed loading tags:', e?.message || e);
      try {
        await loadAllTags();
      } catch {
        setTagOptions([]);
      }
    }
  };

  /** Open "already rated" summary */
  const openRatedSummary = async (dest) => {
    if (!crawl?.crawl_id || !dest?.id) return;
    try {
      setSummaryVisible(true);
      setSummaryLoading(true);
      setSummaryData(null);

      const { data: sessionRes } = await supabase.auth.getSession();
      const userId = sessionRes?.session?.user?.id ?? null;

      let q = supabase
        .from('destination_ratings')
        .select('crispiness, sauce, meat, overall, wings_eaten, weight_score, created_at')
        .eq('destination_id', dest.id)
        .eq('crawl_id', crawl.crawl_id)
        .limit(1);

      q = userId ? q.eq('user_id', userId) : q.is('user_id', null);

      const { data, error } = await q;
      if (error) throw error;

      const row = data?.[0];
      if (!row) {
        setSummaryData(null);
        return;
      }

      const crisp = toNumber(row.crispiness);
      const sauce = toNumber(row.sauce);
      const meat = toNumber(row.meat);
      const overall = toNumber(row.overall);
      const calcScore = overall * 4 + crisp * 2 + sauce * 2 + meat * 2;
      const buffScore = Number.isFinite(Number(row.weight_score)) ? Number(row.weight_score) : calcScore;

      setSummaryData({
        name: dest.name,
        created_at: row.created_at,
        crispiness: crisp,
        sauce,
        meat,
        overall,
        wings_eaten: row.wings_eaten ?? 0,
        buffaScore: buffScore,
      });
    } catch (e) {
      Alert.alert('Error', e.message ?? String(e));
      setSummaryVisible(false);
    } finally {
      setSummaryLoading(false);
    }
  };

  const totalStops = routeMeta.stops?.length ?? 0;
  const ratedCount = ratedDestIds.size;
  const hasAnyRatings = ratedCount > 0;
  const allRated = totalStops > 0 && ratedCount >= totalStops;

  const lastRatedOrd = useMemo(() => {
    const stops = routeMeta.stops || [];
    let max = null;
    for (const s of stops) {
      if (ratedDestIds.has(s.id)) max = s.ord;
    }
    return max;
  }, [routeMeta.stops, ratedDestIds]);

  /** Enforce crawl order: only the first unrated stop is clickable. */
  const nextUnlockedOrd = useMemo(() => {
    if (allRated) return null;
    const stops = routeMeta.stops || [];
    const next = stops.find((s) => !ratedDestIds.has(s.id));
    return next?.ord ?? null;
  }, [allRated, routeMeta.stops, ratedDestIds]);

  // Open wizard (wizard owns its own UI state)
  const openRating = async (dest) => {
    setActiveDest(dest);
    loadTagsForDestination(dest.id);
    await trackEvent({
      eventName: 'rating_started',
      screen: 'crawl',
      userId: session?.user?.id ?? null,
      destinationId: dest?.id ?? null,
      crawlId: crawl?.crawl_id ?? null,
      routeId: crawl?.route_id ?? null,
      metadata: { source: 'crawl_stop', stop_order: dest?.ord ?? null },
    });
    setRateVisible(true);
  };

  // Preflight: check coords + proximity BEFORE opening the rating wizard
  const preflightRating = async (dest) => {
    if (!dest) return;

    if (pressingRef.current) return;
    pressingRef.current = true;

    try {
      setPreflightMsg('Getting your location…');
      setPreflightVisible(true);

      // already-rated: skip preflight, just show summary
      if (ratedDestIds.has(dest?.id)) {
        setPreflightVisible(false);
        await openRatedSummary(dest);
        return;
      }

      if (dest?.lat == null || dest?.lng == null) {
        setPreflightVisible(false);
        Alert.alert('Missing location', 'This stop is missing coordinates.');
        return;
      }

      const fresh = await getFreshCoords(coords ?? null);
      if (!fresh?.latitude || !fresh?.longitude) {
        setPreflightVisible(false);
        Alert.alert('Location required', 'Turn on location to rate this stop.');
        return;
      }
      verifiedRatingLocationRef.current = fresh;

      if (!isAdmin) {
        setPreflightMsg('Checking your distance…');

        const dist = distanceM(fresh.latitude, fresh.longitude, dest.lat, dest.lng);
        const effectiveRateRadiusM = RATE_RADIUS_M * 2;

        if (!Number.isFinite(dist) || dist > effectiveRateRadiusM) {
          setPreflightVisible(false);

          const now = Date.now();
          if (now - lastTooFarAtRef.current < 1200) return;
          lastTooFarAtRef.current = now;

          await hapticReject();

          const miles = Number.isFinite(dist) ? (dist / 1609.34).toFixed(2) : '—';
          await trackEvent({
            eventName: 'rating_validation_failed',
            screen: 'crawl',
            userId: session?.user?.id ?? null,
            destinationId: dest?.id ?? null,
            crawlId: crawl?.crawl_id ?? null,
            routeId: crawl?.route_id ?? null,
            metadata: { reason: 'too_far', distance_miles: Number.isFinite(dist) ? dist / 1609.34 : null },
          });
          Alert.alert(
            'Still too far away',
            `You must be within .1 miles of this stop to rate it.\nCurrent: ~${miles} mi`,
            [
              { text: 'OK', style: 'cancel' },
              { text: 'Take me there', onPress: () => openExternalDirections(dest.lat, dest.lng, 'driving') },
            ]
          );
          return;
        }
      }

      setPreflightVisible(false);
      await openRating(dest);
    } finally {
      setTimeout(() => {
        pressingRef.current = false;
      }, 500);
    }
  };

  const tryPressStop = async (stop) => {
    if (!stop) return;

    if (ratedDestIds.has(stop.id)) {
      await openRatedSummary(stop);
      return;
    }

    if (nextUnlockedOrd != null && stop.ord !== nextUnlockedOrd) {
      Alert.alert('In order only', 'You must complete this crawl in order.');
      return;
    }

    await preflightRating(stop);
  };

  /** Save rating (called from wizard Finalize) */
  const saveRating = async (wizard) => {
    if (!activeDest || !crawl?.crawl_id) return;

    try {
      setSaving(true);

      const { data: sessionRes } = await supabase.auth.getSession();
      const userId = sessionRes?.session?.user?.id ?? null;

      const crisp = toNumber(wizard?.scores?.crispiness);
      const sauce = toNumber(wizard?.scores?.sauce);
      const meat = toNumber(wizard?.scores?.meat);
      const overall = toNumber(wizard?.scores?.overall);

      const buffaScore = overall * 4 + crisp * 2 + sauce * 2 + meat * 2;

      // Retain the community snapshot before the insert so the comparison is
      // against the existing crowd, not against an average containing the user.
      let priorCommunity = null;
      try {
        const { data: rows, error: snapshotError } = await supabase
          .from('destination_ratings')
          .select('id, crispiness, sauce, meat, overall')
          .eq('destination_id', activeDest.id);
        if (snapshotError) throw snapshotError;
        priorCommunity = Array.isArray(rows) ? rows : [];
      } catch (snapshotError) {
        console.warn('Unable to capture the prior restaurant rating snapshot.', snapshotError?.message || snapshotError);
      }

      const payload = {
        destination_id: activeDest.id,
        crawl_id: crawl.crawl_id,
        user_id: userId,
        crispiness: crisp,
        sauce,
        meat,
        overall,
        wings_eaten: wizard?.wingsEaten == null ? 0 : wizard.wingsEaten,
        tag_id: wizard?.selectedTagId ?? null,
        sauce_style: wizard?.sauceStyle ?? null,
        spice_level: wizard?.spiceLevel ?? null,
        would_order_again: wizard?.wouldOrderAgain == null ? null : !!wizard.wouldOrderAgain,
        flavor_vibe: Array.isArray(wizard?.flavorVibe) && wizard.flavorVibe.length ? wizard.flavorVibe : null,
      };

      let ratingMilestones = {
        firstRating: false,
        newDestination: false,
        newCity: false,
        newState: false,
        destinationCity: null,
        destinationStateId: null,
      };

      if (userId) {
        try {
          const [{ data: destProfile }, { data: priorRows }] = await Promise.all([
            supabase
              .from('destinations')
              .select('city, state_id')
              .eq('id', activeDest.id)
              .maybeSingle(),
            supabase
              .from('destination_ratings')
              .select('destination_id, destination:destination_id ( city, state_id )')
              .eq('user_id', userId),
          ]);

          const rows = Array.isArray(priorRows) ? priorRows : [];
          const destinationCity = destProfile?.city ? String(destProfile.city).trim() : null;
          const destinationStateId = destProfile?.state_id ?? null;
          const priorDestinationIds = new Set(rows.map((r) => r.destination_id).filter(Boolean));
          const priorCities = new Set(
            rows
              .map((r) => (r?.destination?.city ? String(r.destination.city).trim().toLowerCase() : null))
              .filter(Boolean)
          );
          const priorStateIds = new Set(
            rows
              .map((r) => r?.destination?.state_id)
              .filter((sid) => sid != null)
          );

          ratingMilestones = {
            firstRating: rows.length === 0,
            newDestination: !priorDestinationIds.has(activeDest.id),
            newCity: rows.length > 0 && !!destinationCity && !priorCities.has(destinationCity.toLowerCase()),
            newState: rows.length > 0 && destinationStateId != null && !priorStateIds.has(destinationStateId),
            destinationCity,
            destinationStateId,
          };
        } catch (e) {
          console.warn('[XP] milestone precheck failed', e?.message || e);
        }
      }

      let error;
      let submittedRatingId = null;
      if (userId) {
        const verifiedLocation = verifiedRatingLocationRef.current ?? coords;
        const response = await supabase.rpc('submit_validated_crawl_rating', {
          p_crawl_id: crawl.crawl_id,
          p_destination_id: activeDest.id,
          p_latitude: verifiedLocation?.latitude ?? null,
          p_longitude: verifiedLocation?.longitude ?? null,
          p_accuracy_m: verifiedLocation?.accuracy ?? null,
          p_crispiness: crisp,
          p_sauce: sauce,
          p_meat: meat,
          p_overall: overall,
          p_wings_eaten: payload.wings_eaten,
          p_tag_id: payload.tag_id,
          p_sauce_style: payload.sauce_style,
          p_spice_level: payload.spice_level,
          p_would_order_again: payload.would_order_again,
          p_flavor_vibe: payload.flavor_vibe,
        });
        const ratingResult = response.data;
        error = response.error;
        if (ratingResult?.accepted === false) throw new Error('Your rating could not be saved.');
        submittedRatingId = ratingResult?.rating_id ?? null;
      } else {
        const { error: delErr } = await supabase
          .from('destination_ratings')
          .delete()
          .eq('destination_id', activeDest.id)
          .eq('crawl_id', crawl.crawl_id)
          .is('user_id', null);
        if (delErr) throw delErr;

        const { data: insertedRating, error: insertError } = await supabase.from('destination_ratings').insert(payload).select('id').single();
        error = insertError;
        submittedRatingId = insertedRating?.id ?? null;
      }

      if (error) throw error;

      await trackEvent({
        eventName: 'rating_completed',
        screen: 'crawl',
        userId,
        destinationId: activeDest.id,
        crawlId: crawl.crawl_id,
        routeId: crawl?.route_id ?? null,
        metadata: {
          source: 'crawl_stop',
          stop_order: activeDest?.ord ?? null,
          tag_id: wizard?.selectedTagId ?? null,
          weight_score: buffaScore,
          would_order_again: wizard?.wouldOrderAgain == null ? null : !!wizard.wouldOrderAgain,
          is_guest: !userId,
        },
      });
      await trackEvent({
        eventName: 'rating_submitted',
        screen: 'crawl',
        userId,
        destinationId: activeDest.id,
        crawlId: crawl.crawl_id,
        routeId: crawl?.route_id ?? null,
        metadata: {
          source: 'crawl_stop',
          flow_step: activeDest?.ord ?? null,
          tag_id: wizard?.selectedTagId ?? null,
          weight_score: buffaScore,
          would_order_again: wizard?.wouldOrderAgain == null ? null : !!wizard.wouldOrderAgain,
          is_guest: !userId,
        },
      });
      await trackEvent({
        eventName: 'crawl_step_completed',
        screen: 'crawl',
        userId,
        destinationId: activeDest.id,
        crawlId: crawl.crawl_id,
        routeId: crawl?.route_id ?? null,
        metadata: {
          flow_step: activeDest?.ord ?? null,
          total_stops: routeMeta?.stops?.length ?? null,
          weight_score: buffaScore,
        },
      });

      let q = supabase
        .from('destination_ratings')
        .select('weight_score')
        .eq('crawl_id', crawl.crawl_id)
        .eq('destination_id', activeDest.id)
        .limit(1);

      q = userId ? q.eq('user_id', userId) : q.is('user_id', null);

      const { data: wsRow, error: wsErr } = await q;

      const savedWeightScore =
        !wsErr && wsRow?.[0]?.weight_score != null
          ? Number(wsRow[0].weight_score)
          : buffaScore;

      // Build the immutable post-submit comparison snapshot. Aggregate refresh
      // is best-effort and never blocks a successful rating.
      try {
        let community = priorCommunity;
        setComparisonData({
          destinationId: String(activeDest.id), destinationName: activeDest.name,
          userScores: Object.freeze({ overall, crispiness: crisp, sauce, meat }),
          communityScores: Object.freeze({ overall: null, crispiness: null, sauce: null, meat: null }),
          priorRatingCount: 0, comparisonStatus: 'loading',
        });
        if (!community) {
          if (!submittedRatingId) throw new Error('Rating id unavailable for a safe comparison.');
          const { data: refreshed, error: refreshError } = await supabase.from('destination_ratings').select('id, crispiness, sauce, meat, overall').eq('destination_id', activeDest.id).neq('id', submittedRatingId || '00000000-0000-0000-0000-000000000000');
          if (refreshError) throw refreshError;
          community = Array.isArray(refreshed) ? refreshed : [];
        }
        const averages = averageBeforeSubmission(community, submittedRatingId);
        setComparisonData({
          destinationId: String(activeDest.id), destinationName: activeDest.name,
          userScores: Object.freeze({ overall, crispiness: crisp, sauce, meat }),
          communityScores: Object.freeze(averages),
          priorRatingCount: community.length,
          comparisonStatus: 'ready',
        });
      } catch (comparisonError) {
        console.warn('Community comparison is temporarily unavailable.', comparisonError?.message || comparisonError);
        setComparisonData({
          destinationId: String(activeDest.id), destinationName: activeDest.name,
          userScores: Object.freeze({ overall, crispiness: crisp, sauce, meat }),
          communityScores: Object.freeze({ overall: null, crispiness: null, sauce: null, meat: null }),
          comparisonError: true,
          comparisonStatus: 'error',
          priorRatingCount: priorCommunity?.length ?? 0,
        });
      }

      setRatedDestIds((prev) => {
        const next = new Set(prev);
        next.add(activeDest.id);
        return next;
      });

      setRatedScores((prev) => {
        const next = new Map(prev);
        next.set(activeDest.id, savedWeightScore);
        return next;
      });

      // XP stays the same
      const awards = [];

      try {
        const nx = await grantXp(XP.RATE_DEST, 'Rated a destination', null, {
          source: 'rating',
          sourceScreen: 'crawl',
          idempotencyKey: `rating:${userId || 'guest'}:${activeDest.id}:${crawl?.crawl_id || 'none'}`,
          destinationId: activeDest.id,
          crawlId: crawl?.crawl_id ?? null,
          routeId: crawl?.route_id ?? null,
          metadata: {
            is_buffacoin: false,
            rating_source: 'crawl',
          },
        });
        if (nx != null) awards.push({ amount: XP.RATE_DEST, reason: 'Rated a destination' });
      } catch (e) {
        console.warn('[XP] rating grant failed', e?.message || e);
      }

      if (wizard?.selectedTagId != null) {
        try {
          const nx = await grantXp(XP.ADD_TAGS, 'Added tag', null, {
            source: 'rating_detail',
            sourceScreen: 'crawl',
            idempotencyKey: `rating_detail:tag:${userId || 'guest'}:${activeDest.id}:${crawl?.crawl_id || 'none'}`,
            destinationId: activeDest.id,
            crawlId: crawl?.crawl_id ?? null,
            routeId: crawl?.route_id ?? null,
            metadata: {
              tag_id: wizard.selectedTagId,
              rating_source: 'crawl',
            },
          });
          if (nx != null) awards.push({ amount: XP.ADD_TAGS, reason: 'Added tag' });
        } catch (e) {
          console.warn('[XP] tag grant failed', e?.message || e);
        }
      }

      if (ratingMilestones.firstRating) {
        try {
          const nx = await grantXp(XP.FIRST_RATING, 'First rating', null, {
            source: 'first_rating',
            sourceScreen: 'crawl',
            idempotencyKey: `first_rating:${userId}`,
            destinationId: activeDest.id,
            crawlId: crawl?.crawl_id ?? null,
            routeId: crawl?.route_id ?? null,
          });
          if (nx != null) awards.push({ amount: XP.FIRST_RATING, reason: 'First rating' });
        } catch (e) {
          console.warn('[XP] first-rating grant failed', e?.message || e);
        }
      }

      if (ratingMilestones.newDestination) {
        try {
          const nx = await grantXp(XP.NEW_DESTINATION, 'New restaurant', null, {
            source: 'new_destination',
            sourceScreen: 'crawl',
            idempotencyKey: `new_destination:${userId}:${activeDest.id}`,
            destinationId: activeDest.id,
            crawlId: crawl?.crawl_id ?? null,
            routeId: crawl?.route_id ?? null,
          });
          if (nx != null) awards.push({ amount: XP.NEW_DESTINATION, reason: 'New restaurant' });
        } catch (e) {
          console.warn('[XP] new-destination grant failed', e?.message || e);
        }
      }

      if (ratingMilestones.newCity) {
        try {
          const cityKey = String(ratingMilestones.destinationCity || '').trim().toLowerCase();
          const nx = await grantXp(XP.FIRST_CITY, 'New city', null, {
            source: 'new_city',
            sourceScreen: 'crawl',
            idempotencyKey: `new_city:${userId}:${cityKey}`,
            destinationId: activeDest.id,
            crawlId: crawl?.crawl_id ?? null,
            routeId: crawl?.route_id ?? null,
            metadata: {
              city: ratingMilestones.destinationCity,
              state_id: ratingMilestones.destinationStateId,
            },
          });
          if (nx != null) awards.push({ amount: XP.FIRST_CITY, reason: 'New city' });
        } catch (e) {
          console.warn('[XP] new-city grant failed', e?.message || e);
        }
      }

      if (ratingMilestones.newState) {
        try {
          const nx = await grantXp(XP.FIRST_STATE, 'New state', null, {
            source: 'new_state',
            sourceScreen: 'crawl',
            idempotencyKey: `new_state:${userId}:${ratingMilestones.destinationStateId}`,
            destinationId: activeDest.id,
            crawlId: crawl?.crawl_id ?? null,
            routeId: crawl?.route_id ?? null,
            metadata: {
              city: ratingMilestones.destinationCity,
              state_id: ratingMilestones.destinationStateId,
            },
          });
          if (nx != null) awards.push({ amount: XP.FIRST_STATE, reason: 'New state' });
        } catch (e) {
          console.warn('[XP] new-state grant failed', e?.message || e);
        }
      }

      try {
        const todayKey = `xp-daily-first-${new Date().toISOString().slice(0, 10)}`;
        const got = await AsyncStorage.getItem(todayKey);
        if (!got) {
          const dateKey = new Date().toISOString().slice(0, 10);
          const nx = await grantXp(XP.DAILY_FIRST, 'Daily first rating', null, {
            source: 'daily_first_rating',
            sourceScreen: 'crawl',
            idempotencyKey: `daily_first_rating:${userId || 'guest'}:${dateKey}`,
            destinationId: activeDest.id,
            crawlId: crawl?.crawl_id ?? null,
            routeId: crawl?.route_id ?? null,
            metadata: {
              rating_source: 'crawl',
              claim_date: dateKey,
            },
          });
          if (nx != null) {
            awards.push({ amount: XP.DAILY_FIRST, reason: 'Daily first rating' });
            await AsyncStorage.setItem(todayKey, '1');
          }
        }
      } catch (e) {
        console.warn('[XP] daily-first grant failed', e?.message || e);
      }

      if (awards.length) showAwards(awards);

      setRateVisible(false);
      const canOfferWingShot = Boolean(userId && submittedRatingId && wingShotFlags.prompt && (wingShotFlags.photo || wingShotFlags.video));
      postRatingAdvancedRef.current = false;
      setWingShotSubmitted(false);
      setEligibleWingShotRatingId(canOfferWingShot ? submittedRatingId : null);
      if (canOfferWingShot) setWingShotVisible(true);
      else setWingShotVisible(false);
      setComparisonVisible(!canOfferWingShot);

      loadPresenceAllSteps();
      loadLeaderboard();
    } catch (e) {
      await trackEvent({
        eventName: 'rating_failed',
        screen: 'crawl',
        userId: session?.user?.id ?? null,
        destinationId: activeDest?.id ?? null,
        crawlId: crawl?.crawl_id ?? null,
        routeId: crawl?.route_id ?? null,
        metadata: { source: 'crawl_stop', error: e?.message || String(e) },
      });
      await trackEvent({
        eventName: 'error_shown',
        screen: 'crawl',
        userId: session?.user?.id ?? null,
        destinationId: activeDest?.id ?? null,
        crawlId: crawl?.crawl_id ?? null,
        routeId: crawl?.route_id ?? null,
        metadata: {
          source: 'crawl_stop',
          error_message: e?.message || String(e),
        },
      });
      Alert.alert('Save failed', e.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  const buildCrawlReport = async (crawlIdArg) => {
    setReportBusy(true);
    try {
      const { data: sessionRes } = await supabase.auth.getSession();
      const userId = sessionRes?.session?.user?.id ?? null;

      let userQ = supabase
        .from('destination_ratings')
        .select(
          `
          destination_id,
          weight_score,
          crispiness,
          sauce,
          meat,
          overall,
          destinations!destination_ratings_destination_id_fkey ( name )
        `
        )
        .eq('crawl_id', crawlIdArg);

      userQ = userId ? userQ.eq('user_id', userId) : userQ.is('user_id', null);

      const { data: mine, error: eMine } = await userQ;
      if (eMine) throw eMine;

      if (!mine || mine.length === 0) {
        setReportRows([]);
        return;
      }

      const mineMap = new Map();
      for (const r of mine) if (!mineMap.has(r.destination_id)) mineMap.set(r.destination_id, r);
      const mineUnique = Array.from(mineMap.values());

      const destIds = mineUnique.map((r) => r.destination_id);

      const { data: allRatings, error: eAll } = await supabase
        .from('destination_ratings')
        .select('destination_id, weight_score, crispiness, sauce, meat, overall')
        .in('destination_id', destIds);

      if (eAll) throw eAll;

      const sums = new Map();
      const counts = new Map();
      const metricKeys = ['crispiness', 'sauce', 'meat', 'overall'];
      const metricSums = new Map();
      const metricCounts = new Map();

      for (const row of allRatings || []) {
        const id = row.destination_id;
        const val = Number(row.weight_score ?? 0);
        if (Number.isFinite(val)) {
          sums.set(id, (sums.get(id) ?? 0) + val);
          counts.set(id, (counts.get(id) ?? 0) + 1);
        }

        for (const key of metricKeys) {
          const metricValue = Number(row[key]);
          if (!Number.isFinite(metricValue)) continue;
          const sumKey = `${id}:${key}`;
          metricSums.set(sumKey, (metricSums.get(sumKey) ?? 0) + metricValue);
          metricCounts.set(sumKey, (metricCounts.get(sumKey) ?? 0) + 1);
        }
      }

      const rows = mineUnique.map((r) => {
        const name = r.destinations?.name ?? 'Unknown';
        const yours = Number(r.weight_score ?? 0);
        const total = sums.get(r.destination_id) ?? 0;
        const cnt = counts.get(r.destination_id) ?? 0;
        const avg = cnt > 0 ? total / cnt : 0;
        const metricLabels = {
          crispiness: 'Crisp',
          sauce: 'Sauce',
          meat: 'Chicken',
          overall: 'Experience',
        };
        const metrics = metricKeys.map((key) => {
          const sumKey = `${r.destination_id}:${key}`;
          const metricCount = metricCounts.get(sumKey) ?? 0;
          const metricAvg = metricCount > 0 ? metricSums.get(sumKey) / metricCount : null;
          const yoursValue = Number(r[key]);
          return {
            label: metricLabels[key],
            yours: Number.isFinite(yoursValue) ? yoursValue : null,
            avg: metricAvg,
          };
        });

        return { id: r.destination_id, name, yours, avg, delta: yours - avg, metrics };
      });

      rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
      setReportRows(rows);
    } finally {
      setReportBusy(false);
    }
  };

  const openDetail = async (destinationId, destinationName) => {
    setDetailOpen(true);
    setDetailBusy(true);
    setDetailTitle(destinationName);

    try {
      const { data: sessionRes } = await supabase.auth.getSession();
      const userId = sessionRes?.session?.user?.id ?? null;

      let myQ = supabase
        .from('destination_ratings')
        .select('crispiness, sauce, meat, overall')
        .eq('destination_id', destinationId)
        .eq('crawl_id', crawl.crawl_id)
        .limit(1);

      myQ = userId ? myQ.eq('user_id', userId) : myQ.is('user_id', null);

      const { data: mine, error: e1 } = await myQ;
      if (e1) throw e1;

      const my = mine?.[0];

      const { data: all, error: e2 } = await supabase
        .from('destination_ratings')
        .select('crispiness, sauce, meat, overall')
        .eq('destination_id', destinationId);

      if (e2) throw e2;

      const avgOf = (arr, k) => {
        const vals = (arr || []).map((r) => Number(r[k])).filter((n) => Number.isFinite(n));
        if (!vals.length) return null;
        return vals.reduce((a, b) => a + b, 0) / vals.length;
      };

      const rows = [
        { label: 'Crispiness', key: 'crispiness' },
        { label: 'Sauce', key: 'sauce' },
        { label: 'Meat', key: 'meat' },
        { label: 'Overall', key: 'overall' },
      ].map(({ label, key }) => {
        const yours = my && Number.isFinite(Number(my[key])) ? Number(my[key]) : null;
        const avg = avgOf(all, key);
        return { label, yours, avg, delta: (yours ?? 0) - (avg ?? 0) };
      });

      setDetailRows(rows);
    } catch (e) {
      Alert.alert('Error', e.message ?? String(e));
      setDetailRows([]);
    } finally {
      setDetailBusy(false);
    }
  };

  const deleteEmptyCrawlAndLeave = async () => {
    try {
      if (crawl?.crawl_id) {
        await trackEvent({
          eventName: 'crawl_abandoned',
          screen: 'crawl',
          userId: session?.user?.id ?? null,
          crawlId: crawl.crawl_id,
          routeId: crawl?.route_id ?? null,
          metadata: { reason: 'left_without_ratings' },
        });
        const { error } = await supabase.from('crawls').delete().eq('crawl_id', crawl.crawl_id);
        if (error) throw error;
      }
    } catch (e) {
      console.warn('deleteEmptyCrawlAndLeave failed:', e?.message || e);
      try {
        if (crawl?.crawl_id) {
          await supabase.from('crawls').update({ status: 'in_progress' }).eq('crawl_id', crawl.crawl_id);
        }
      } catch {}
    } finally {
      router.replace('/home');
    }
  };

  const completeCrawl = async () => {
    if (!crawl?.crawl_id) return;

    const completeBefore = crawl?.status === 'completed' || !!crawl?.end_time;

    try {
      const endIso = new Date().toISOString();

      const { error } = await supabase
        .from('crawls')
        .update({ status: 'completed', end_time: endIso })
        .eq('crawl_id', crawl.crawl_id);

      if (error) throw error;

      setCrawl((prev) => (prev ? { ...prev, status: 'completed', end_time: endIso } : prev));

      const completeAfter = true;

      if (!completeBefore && completeAfter) {
        await awardCrawlCoins({ start_time: crawl?.start_time, end_time: endIso });
      }

      await trackEvent({
        eventName: 'crawl_completed',
        screen: 'crawl',
        userId: session?.user?.id ?? null,
        crawlId: crawl.crawl_id,
        routeId: crawl?.route_id ?? null,
        metadata: {
          total_stops: routeMeta?.stops?.length ?? null,
          rated_count: ratedDestIds?.size ?? null,
          was_already_completed: completeBefore,
        },
      });

      const awards = [];
      try {
        const nx = await grantXp(XP.COMPLETE_CRAWL, 'Completed a crawl', null, {
          source: 'crawl_completed',
          sourceScreen: 'crawl',
          idempotencyKey: `crawl_completed:${session?.user?.id || 'guest'}:${crawl.crawl_id}`,
          crawlId: crawl.crawl_id,
          routeId: crawl?.route_id ?? null,
          metadata: {
            total_stops: routeMeta?.stops?.length ?? null,
            rated_count: ratedDestIds?.size ?? null,
          },
        });
        if (nx != null) awards.push({ amount: XP.COMPLETE_CRAWL, reason: 'Completed a crawl' });
      } catch (e) {
        console.warn('[XP] complete grant failed', e?.message || e);
      }

      try {
        if (crawl?.route_id) {
          const routeKey = `xp-route-first-${crawl.route_id}`;
          const seen = await AsyncStorage.getItem(routeKey);
          if (!seen) {
            const nx2 = await grantXp(XP.FIRST_TIME_ROUTE, 'First time this route', null, {
              source: 'first_route',
              sourceScreen: 'crawl',
              idempotencyKey: `first_route:${session?.user?.id || 'guest'}:${crawl.route_id}`,
              crawlId: crawl.crawl_id,
              routeId: crawl.route_id,
            });
            if (nx2 != null) {
              awards.push({ amount: XP.FIRST_TIME_ROUTE, reason: 'First time this route' });
              await AsyncStorage.setItem(routeKey, '1');
            }
          }
        }
      } catch (e) {
        console.warn('[XP] first-route grant failed', e?.message || e);
      }

      if (awards.length) showAwards(awards);

      await buildCrawlReport(crawl.crawl_id);
      setReportOpen(true);
    } catch (e) {
      await trackEvent({
        eventName: 'error_shown',
        screen: 'crawl',
        userId: session?.user?.id ?? null,
        crawlId: crawl?.crawl_id ?? null,
        routeId: crawl?.route_id ?? null,
        metadata: {
          source: 'complete_crawl',
          error_message: e?.message || String(e),
        },
      });
      Alert.alert('Error', e.message ?? String(e));
    }
  };

  const saveCrawl = async () => {
    if (!crawl?.crawl_id) return;

    try {
      const { error } = await supabase.from('crawls').update({ status: 'in_progress' }).eq('crawl_id', crawl.crawl_id);
      if (error) throw error;
      await trackEvent({
        eventName: 'crawl_saved',
        screen: 'crawl',
        userId: session?.user?.id ?? null,
        crawlId: crawl.crawl_id,
        routeId: crawl?.route_id ?? null,
        metadata: { rated_count: ratedDestIds?.size ?? null },
      });
      router.replace('/home');
    } catch (e) {
      Alert.alert('Save failed', e.message ?? String(e));
    }
  };

  const onTopLeftBack = () => {
    if (!hasAnyRatings) deleteEmptyCrawlAndLeave();
    else saveCrawl();
  };

  // Presence computation uses destination_ratings to compute max ord
  const loadPresenceAllSteps = async () => {
    if (!crawl?.route_id) return;

    setPresenceLoading(true);
    try {
      const { data: activeCrawls, error: cErr } = await supabase
        .from('socially_visible_crawls')
        .select('crawl_id, user_id')
        .eq('route_id', crawl.route_id)
        .is('end_time', null)
        .limit(500);

      if (cErr) throw cErr;

      const crawlsWithUsers = (activeCrawls || []).filter((c) => !!c.user_id && c.user_id !== ADMIN_ID);

      if (!crawlsWithUsers.length) {
        setPresenceByOrd(new Map());
        setStepMates([]);
        return;
      }

      const crawlIds = crawlsWithUsers.map((c) => c.crawl_id);

      const { data: ratings, error: rErr } = await supabase
        .from('socially_visible_destination_ratings')
        .select('crawl_id, destination_id')
        .in('crawl_id', crawlIds);

      if (rErr) throw rErr;

      const destOrdMap = new Map((routeMeta.stops || []).map((s) => [s.id, s.ord]));
      const total = routeMeta.stops?.length ?? 0;

      const maxOrdByCrawl = new Map();
      for (const row of ratings || []) {
        const ord = destOrdMap.get(row.destination_id);
        if (!ord) continue;
        const prev = maxOrdByCrawl.get(row.crawl_id) ?? 0;
        if (ord > prev) maxOrdByCrawl.set(row.crawl_id, ord);
      }

      const ordToUserIds = new Map();

      for (const c of crawlsWithUsers) {
        const maxOrd = maxOrdByCrawl.get(c.crawl_id) ?? 0;
        const stepOrd = total > 0 ? Math.min(total, Math.max(1, maxOrd)) : 1;

        if (!ordToUserIds.has(stepOrd)) ordToUserIds.set(stepOrd, new Set());
        ordToUserIds.get(stepOrd).add(c.user_id);
      }

      const myId = session?.user?.id ?? null;
      if (myId) {
        for (const set of ordToUserIds.values()) set.delete(myId);
      }

      const allIds = Array.from(
        new Set(
          Array.from(ordToUserIds.values())
            .flatMap((s) => Array.from(s))
            .filter(Boolean)
        )
      );

      if (!allIds.length) {
        setPresenceByOrd(new Map());
        setStepMates([]);
        return;
      }

      const { data: users, error: uErr } = await supabase
        .from('socially_visible_users')
        .select('user_id, username')
        .in('user_id', allIds);

      const byId = new Map();
      if (!uErr && Array.isArray(users)) {
        for (const u of users) byId.set(u.user_id, u);
      }

      const nextMap = new Map();
      for (const [ord, idSet] of ordToUserIds.entries()) {
        const clean = (v) => {
          const s = typeof v === 'string' ? v.trim() : '';
          return s.length ? s : null;
        };

        const arr = Array.from(idSet).map((id) => {
          const u = byId.get(id);
          const shortId = String(id).slice(0, 6);
          const label = clean(u?.username) || `Player ${shortId}`;
          return { user_id: id, label };
        });

        arr.sort((a, b) => (a.label || '').localeCompare(b.label || ''));
        nextMap.set(ord, arr);
      }

      setPresenceByOrd(nextMap);

      const myOrd2 = (allRated ? null : (nextUnlockedOrd ?? 1)) ?? 1;
      setStepMates(nextMap.get(myOrd2) ?? []);
    } catch (e) {
      console.warn('[Presence] load failed:', e?.message || e);
      setPresenceByOrd(new Map());
      setStepMates([]);
    } finally {
      setPresenceLoading(false);
    }
  };

  const loadLeaderboard = async () => {
    setLbLoading(true);
    try {
      const { data: rows, error } = await supabase
        .from('socially_visible_crawls')
        .select('crawl_id, user_id, start_time, end_time')
        .eq('route_id', crawl.route_id)
        .not('end_time', 'is', null)
        .not('start_time', 'is', null)
        .limit(50);

      if (error) throw error;

      const base = (rows || [])
        .filter((r) => r.user_id && r.user_id !== ADMIN_ID)
        .map((r) => ({
          user_id: r.user_id,
          days: ceilDays(r.start_time, r.end_time),
          end_time: r.end_time,
        }));

      let byId = new Map();
      const ids = Array.from(new Set(base.map((r) => r.user_id).filter(Boolean)));

      if (ids.length) {
        const { data: profs, error: pErr } = await supabase
          .from('socially_visible_users')
          .select('user_id, username')
          .in('user_id', ids);

        if (!pErr && Array.isArray(profs)) {
          byId = new Map(profs.map((p) => [p.user_id, p]));
        }
      }

      const withNames = base.map((r) => {
        const p = r.user_id ? byId.get(r.user_id) : null;
        const shortId = r.user_id ? String(r.user_id).slice(0, 6) : 'guest';

        const label =
          (p?.username && String(p.username).trim()) ||
          (p?.full_name && String(p.full_name).trim()) ||
          (r.user_id === ADMIN_ID ? 'Admin' : `Player ${shortId}`);

        return { ...r, label, avatar_url: null };
      });

      withNames.sort((a, b) => {
        if (a.days !== b.days) return a.days - b.days;
        const ta = a.end_time ? new Date(a.end_time).getTime() : 0;
        const tb = b.end_time ? new Date(b.end_time).getTime() : 0;
        return ta - tb;
      });

      setLbRows(withNames);
    } catch (e) {
      console.warn('[Leaderboard] load failed:', e?.message || e);
      setLbRows([]);
    } finally {
      setLbLoading(false);
    }
  };

  useEffect(() => {
    if (!crawl?.route_id) return;
    loadLeaderboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crawl?.route_id]);

  useEffect(() => {
    if (!crawl?.route_id || !totalStops) return;

    loadPresenceAllSteps();
    const t = setInterval(loadPresenceAllSteps, 15000);

    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crawl?.route_id, totalStops, nextUnlockedOrd, allRated]);

  const surface = theme.colors.surface;

  const stopRows = useMemo(() => {
    const stops = routeMeta.stops || [];
    return stops.map((s) => {
      const rated = ratedDestIds.has(s.id);
      const score = ratedScores.get(s.id);
      const state = rated ? 'rated' : nextUnlockedOrd != null && s.ord === nextUnlockedOrd ? 'current' : 'locked';
      return { ...s, rated, score, state };
    });
  }, [routeMeta.stops, ratedDestIds, ratedScores, nextUnlockedOrd]);

  const boardStops = useMemo(() => {
    const startState = ratedDestIds.size === 0 ? 'current' : 'rated';
    const start = {
      ord: 0,
      id: 'start',
      name: 'Start',
      state: startState,
      isStart: true,
      subtitle: routeMeta.title || 'Your Crawl',
    };

    return [start, ...(stopRows || [])];
  }, [stopRows, ratedDestIds.size, routeMeta.title]);

  const onPressBoardTile = async (tile) => {
    if (!tile) return;

    if (tile.isStart) return;

    if (tile.state === 'rated') {
      await openRatedSummary(tile);
      return;
    }

    if (tile.state === 'current') {
      await tryPressStop(tile);
      return;
    }

    Alert.alert('Locked', 'You must complete this crawl in order.');
  };

  const showCompleteFab = allRated || !isSignedIn;

  return (
    <View style={{ flex: 1 }}>
      <ImageBackground source={CRAWL_BG} resizeMode="cover" style={{ flex: 1 }}>
        <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }} />
        </View>

        {/* Header pill */}
        <View style={[styles.boardHeader, { top: insets.top + 6 }]}>
          <View style={styles.boardHeaderPill}>
            <Pressable onPress={onTopLeftBack} hitSlop={10} style={styles.headerBackBtn}>
              <MaterialCommunityIcons name="arrow-left" size={22} color="#fff" />
            </Pressable>

            <View style={styles.headerCenter} pointerEvents="none" />

            <Pressable
              onPress={() => {
                trackEvent({
                  eventName: 'leaderboard_viewed',
                  screen: 'crawl',
                  userId: session?.user?.id ?? null,
                  crawlId: crawl?.crawl_id ?? null,
                  routeId: crawl?.route_id ?? null,
                  metadata: { source: 'crawl_finishers' },
                });
                setLbOpen(true);
                loadLeaderboard();
              }}
              hitSlop={10}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: 'rgba(255,255,255,0.10)',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.14)',
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '900', fontSize: 11 }}>🏁 Finishers</Text>
            </Pressable>
          </View>
        </View>

        {/* Loader overlay */}
        {loading ? (
          <View style={styles.loadingOverlay}>
            <View style={styles.loadingCard}>
              <ActivityIndicator />
              <Text style={{ marginTop: 12, fontWeight: '900', textAlign: 'center' }}>Setting up your crawl…</Text>

              <View style={{ marginTop: 12, width: 220 }}>
                <ProgressBar indeterminate />
              </View>

              <Text style={{ marginTop: 14, opacity: 0.85, textAlign: 'center' }}>{fact}</Text>
            </View>
          </View>
        ) : null}

        {/* Centered vertical board */}
        <View style={styles.boardWrap}>
          <View style={styles.boardPanel}>
            <View
              pointerEvents="none"
              style={[
                styles.boardTrack,
                {
                  height: Math.min(560, (boardStops.length + 1) * (stepStride * 0.55)),
                },
              ]}
            />

            <View style={{ gap: TILE_GAP }}>
              {[...boardStops].reverse().map((t) => (
                <StepTile
                  key={t.id}
                  ord={t.ord}
                  name={t.name}
                  state={t.state}
                  subtitle={t.subtitle}
                  score={t.score}
                  isStart={!!t.isStart}
                  presenceUsers={!t.isStart ? (presenceByOrd.get(t.ord) ?? []) : []}
                  showWingUser={t.isStart ? lastRatedOrd == null : t.ord === lastRatedOrd}
                  showGhostUser={false}
                  unlockHint={
                    t.state === 'locked' && t.ord > 1 ? `Complete Stop ${t.ord - 1} to unlock` : null
                  }
                  onPress={() => onPressBoardTile(t)}
                  onPressPresence={handlePressPresence}
                />
              ))}
            </View>
          </View>

          {allRated ? (
            <View style={styles.centerCompleteWrap} pointerEvents="box-none">
              <Button
                mode="contained"
                onPress={completeCrawl}
                style={styles.centerCompleteBtn}
                contentStyle={{ paddingVertical: 10 }}
                labelStyle={{ fontSize: 18, fontWeight: '900' }}
              >
                Complete Crawl
              </Button>
            </View>
          ) : null}
        </View>

        {!allRated && showCompleteFab ? (
          <FAB icon="check-circle" label="Complete Crawl" onPress={completeCrawl} style={styles.fab} color="white" />
        ) : null}

        <Portal>
          {/* Preflight overlay */}
          {preflightVisible ? (
            <View style={styles.preflightOverlay}>
              <View style={styles.preflightCard}>
                <ActivityIndicator size="large" />
                <Text style={{ marginTop: 14, fontWeight: '900', textAlign: 'center' }}>{preflightMsg}</Text>
                <Text style={{ marginTop: 6, opacity: 0.75, textAlign: 'center' }}>This usually takes a second…</Text>
              </View>
            </View>
          ) : null}

          {/* Presence dialog */}
          <Dialog
            visible={presenceOpen}
            onDismiss={() => setPresenceOpen(false)}
            style={[styles.dialog, { backgroundColor: surface }]}
          >
            <DialogHeaderArrow
              title={presenceOrd != null ? `Peers on Stop ${presenceOrd}` : 'Peers'}
              onBack={() => setPresenceOpen(false)}
            />
            <Dialog.Content>
              {presenceLoading ? (
                <View style={{ alignItems: 'center', paddingVertical: 12 }}>
                  <ActivityIndicator />
                  <Text style={{ marginTop: 8 }}>Checking who’s here…</Text>
                </View>
              ) : !stepMates.length ? (
                <Text style={{ textAlign: 'center', opacity: 0.8 }}>No one else is on your step right now.</Text>
              ) : (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                {stepMates.map((u) => (
                  <Pressable
                    key={u.user_id}
                    onPress={() => {
                      setPresenceOpen(false);
                      router.push({
                        pathname: '/profile/history',
                        params: { userId: u.user_id, sourceSurface: 'crawl' },
                      });
                    }}
                    style={{ alignItems: 'center', width: 86, paddingVertical: 8, opacity: 0.95 }}
                  >
                    {u.avatar_url ? (
                      <Avatar.Image size={44} source={{ uri: u.avatar_url }} />
                    ) : (
                      <Avatar.Text size={44} label={(u.label || 'P').slice(0, 2).toUpperCase()} />
                    )}
                    <Text
                      numberOfLines={1}
                      style={{ marginTop: 6, fontWeight: '800', fontSize: 12, textAlign: 'center' }}
                    >
                      {u.label}
                    </Text>
                  </Pressable>
                ))}
                </View>
              )}
            </Dialog.Content>
          </Dialog>

          {/* Leaderboard dialog */}
          <Dialog visible={lbOpen} onDismiss={() => setLbOpen(false)} style={[styles.dialog, { backgroundColor: surface }]}>
            <DialogHeaderArrow title="Crawl Finishers" onBack={() => setLbOpen(false)} />
            <Dialog.Content>
              {lbLoading ? (
                <View style={{ alignItems: 'center', paddingVertical: 12 }}>
                  <ActivityIndicator />
                  <Text style={{ marginTop: 8 }}>Loading finishers…</Text>
                </View>
              ) : !lbRows.length ? (
                <Text style={{ textAlign: 'center', opacity: 0.8 }}>No one has finished this crawl yet.</Text>
              ) : (
                <>
                  <Text style={{ textAlign: 'center', opacity: 0.75, marginBottom: 10 }}>
                    Sorted by days (rounded up). Tie-breaker: oldest finish first.
                  </Text>

                  {lbRows.slice(0, 25).map((r, idx) => (
                    <Pressable
                      key={`${r.user_id || 'guest'}-${idx}`}
                      disabled={!r.user_id}
                      onPress={() => {
                        setLbOpen(false);
                        router.push({
                          pathname: '/profile/history',
                          params: { userId: r.user_id, sourceSurface: 'crawl' },
                        });
                      }}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingVertical: 10,
                        borderBottomWidth: idx === lbRows.length - 1 ? 0 : StyleSheet.hairlineWidth,
                        borderBottomColor: 'rgba(255,255,255,0.12)',
                      }}
                    >
                      <Text style={{ width: 28, color: theme.colors.onSurface, opacity: 0.8, fontWeight: '900' }}>
                        {idx + 1}
                      </Text>

                      {r.avatar_url ? (
                        <Avatar.Image size={28} source={{ uri: r.avatar_url }} />
                      ) : (
                        <Avatar.Text size={28} label={(r.label || 'P').slice(0, 2).toUpperCase()} />
                      )}

                      <View style={{ marginLeft: 10, flex: 1 }}>
                        <Text style={{ fontWeight: '900' }}>{r.label}</Text>
                        <Text style={{ opacity: 0.75 }}>
                          Completed in <Text style={{ fontWeight: '900' }}>{r.days} day{r.days === 1 ? '' : 's'}</Text>
                          {'  '}•{'  '}
                          Finished <Text style={{ fontWeight: '900' }}>{fmtFinishDate(r.end_time)}</Text>
                        </Text>
                      </View>
                    </Pressable>
                  ))}
                </>
              )}
            </Dialog.Content>
          </Dialog>

          {/* ✅ Rating wizard now lives ONLY in the shared component */}
          <RatingWizardDialog
            visible={rateVisible}
            destinationName={activeDest?.name ?? 'Rate this stop'}
            title={activeDest?.name ?? 'Rate this stop'}            // harmless extra prop if your component ignores it
            tagOptions={tagOptions}
            options={tagOptions}                                   // harmless extra prop if your component ignores it
            saving={saving}
            onDismiss={() => {
              if (!saving) setRateVisible(false);
            }}
            onClose={() => {
              if (!saving) setRateVisible(false);
            }}
            onFinalize={(payload) => saveRating(payload)}
            onSubmit={(payload) => saveRating(payload)}
          />

          {eligibleWingShotRatingId ? (
            <WingShotFlow
              visible={wingShotVisible}
              eligibleRatingId={eligibleWingShotRatingId}
              destinationId={activeDest?.id}
              submissionSource="rating"
              allowPhoto={wingShotFlags.photo}
              allowVideo={wingShotFlags.video}
              analyticsContext={{
                screen: 'crawl',
                userId: session?.user?.id ?? null,
                destinationId: activeDest?.id ?? null,
                crawlId: crawl?.crawl_id ?? null,
              }}
              onSubmitted={async () => {
                setWingShotSubmitted(true);
              }}
              onClose={async () => {
                if (postRatingAdvancedRef.current) return;
                postRatingAdvancedRef.current = true;
                setWingShotVisible(false);
                setEligibleWingShotRatingId(null);
                if (!wingShotSubmitted) {
                  await trackEvent({
                    eventName: 'wing_shot_prompt_skipped',
                    screen: 'crawl',
                    userId: session?.user?.id ?? null,
                    destinationId: activeDest?.id ?? null,
                    crawlId: crawl?.crawl_id ?? null,
                    metadata: { rating_remains_saved: true },
                  });
                }
                setComparisonVisible(true);
              }}
            />
          ) : null}

          {/* Crawl Report */}
          <Dialog
            visible={reportOpen}
            onDismiss={closeReportAndMaybeShowCoin}
            style={[styles.dialog, { backgroundColor: surface }]}
          >
            <DialogHeaderArrow title="Crawl Report" onBack={closeReportAndMaybeShowCoin} />
            <Dialog.Content>
              {reportBusy ? (
                <View style={{ alignItems: 'center', paddingVertical: 12 }}>
                  <ActivityIndicator />
                  <Text style={{ marginTop: 8 }}>Crunching numbers…</Text>
                </View>
              ) : reportRows.length === 0 ? (
                <Text style={{ textAlign: 'center' }}>You didn’t save any ratings this crawl.</Text>
              ) : (
                <>
                  <Text style={{ textAlign: 'center', marginBottom: 8, opacity: 0.75 }}>
                    Your rating / place average · Tap a spot to see the full comparison
                  </Text>
                  <Divider style={{ marginBottom: 8 }} />
                  {reportRows.map((r, idx) => (
                    <Pressable key={`${r.id}-${idx}`} onPress={() => openDetail(r.id, r.name)} style={{ borderRadius: 12 }}>
                      <ReportRow name={r.name} yours={r.yours} avg={r.avg} delta={r.delta} metrics={r.metrics} />
                    </Pressable>
                  ))}
                </>
              )}
            </Dialog.Content>
            <Dialog.Actions style={{ justifyContent: 'flex-end', paddingHorizontal: 8 }}>
              <Button mode="contained" onPress={closeReportAndMaybeShowCoin}>
                Go Home
              </Button>
            </Dialog.Actions>
          </Dialog>

          {/* Destination Drill-Down */}
          <Dialog
            visible={detailOpen}
            onDismiss={() => setDetailOpen(false)}
            style={[styles.dialog, { backgroundColor: surface }]}
          >
            <DialogHeaderArrow title={detailTitle || 'Details'} onBack={() => setDetailOpen(false)} />
            <Dialog.Content>
              {detailBusy ? (
                <View style={{ alignItems: 'center', paddingVertical: 12 }}>
                  <ActivityIndicator />
                  <Text style={{ marginTop: 8 }}>Loading…</Text>
                </View>
              ) : detailRows.length === 0 ? (
                <Text>Couldn’t load details.</Text>
              ) : (
                detailRows.map((row, i) => (
                  <MetricRow key={`${row.label}-${i}`} label={row.label} yours={row.yours} avg={row.avg} />
                ))
              )}
            </Dialog.Content>
          </Dialog>

          {/* Crawl completion coin popup */}
          <Dialog
            visible={crawlCoinOpen}
            onDismiss={() => {
              setCrawlCoinOpen(false);
              if (goHomeAfterCoin) {
                setGoHomeAfterCoin(false);
                router.replace('/home');
              }
            }}
            style={[styles.dialog, { backgroundColor: surface }]}
          >
            <DialogHeaderArrow title="BuffaCoins Earned!" onBack={() => setCrawlCoinOpen(false)} />
            <Dialog.Content style={{ alignItems: 'center', paddingVertical: 16 }}>
              <Text style={{ fontSize: 42 }}>🪙</Text>

              <Text style={{ marginTop: 10, fontWeight: '900', fontSize: 16, opacity: 0.85 }}>
                {crawlCoinLabel}
              </Text>

              <Text style={{ marginTop: 8, fontWeight: '900', fontSize: 42, color: '#FF6F00' }}>
                +{crawlCoinAmount}
              </Text>

              <Text style={{ marginTop: 10, opacity: 0.75, textAlign: 'center' }}>
                Nice work finishing the crawl.
              </Text>
            </Dialog.Content>

            <Dialog.Actions style={{ justifyContent: 'flex-end' }}>
              <Button
                mode="contained"
                onPress={() => {
                  setCrawlCoinOpen(false);
                  if (goHomeAfterCoin) {
                    setGoHomeAfterCoin(false);
                    router.replace('/home');
                  }
                }}
              >
                Sweet
              </Button>
            </Dialog.Actions>
          </Dialog>

          <RatingComparisonModal
            visible={comparisonVisible}
            data={comparisonData}
            onDone={() => {
              setComparisonVisible(false);
            }}
            onViewRestaurant={() => {
              setComparisonVisible(false);
              setDetailOpen(true);
            }}
          />

          {/* Already-rated summary dialog (kept as-is) */}
          <Dialog
            visible={summaryVisible}
            onDismiss={() => setSummaryVisible(false)}
            style={[styles.dialog, { backgroundColor: surface }]}
          >
            <DialogHeaderArrow title={summaryData?.name ?? 'Your Rating'} onBack={() => setSummaryVisible(false)} />
            <Dialog.Content>
              {summaryLoading ? (
                <View style={{ alignItems: 'center', paddingVertical: 12 }}>
                  <ActivityIndicator />
                </View>
              ) : !summaryData ? (
                <Text>Couldn’t load your rating.</Text>
              ) : (
                <>
                  <Text style={{ textAlign: 'center', opacity: 0.7, marginBottom: 8 }}>
                    Rated on {summaryData.created_at ? new Date(summaryData.created_at).toLocaleDateString() : '—'}
                  </Text>

                  <View style={{ alignItems: 'center', paddingVertical: 10, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.06)' }}>
                    <Text style={{ fontWeight: '800', opacity: 0.85 }}>BuffaGo Score</Text>
                    <Text style={{ fontWeight: '900', fontSize: 28, marginTop: 2, color: '#FF6F00' }}>
                      {summaryData.buffaScore != null ? Number(summaryData.buffaScore).toFixed(0) : '—'}
                    </Text>
                    <Text style={{ fontSize: 12, marginTop: 2, opacity: 0.7 }}>Weighted out of 100</Text>
                  </View>

                  <View style={{ marginTop: 12, gap: 4 }}>
                    <Text>Experience: {fmt2(summaryData.overall)}/10</Text>
                    <Text>Sauce: {fmt2(summaryData.sauce)}/10</Text>
                    <Text>Chicken: {fmt2(summaryData.meat)}/10</Text>
                    <Text>Crispiness: {fmt2(summaryData.crispiness)}/10</Text>
                    {summaryData.wings_eaten > 0 && <Text style={{ marginTop: 4 }}>Wings eaten: {summaryData.wings_eaten}</Text>}
                  </View>
                </>
              )}
            </Dialog.Content>
          </Dialog>
        </Portal>
      </ImageBackground>
    </View>
  );
}

/* ------------------------------- Styles ------------------------------ */
const styles = StyleSheet.create({
  // full-width header
  boardHeader: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 30,
    alignItems: 'stretch',
    paddingHorizontal: 10,
  },

  boardHeaderPill: {
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    borderRadius: 18,
    paddingVertical: 6,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },

  headerBackBtn: {
    width: 34,
    height: 38,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },

  headerCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },

  boardPanel: {
    paddingVertical: 18,
    paddingHorizontal: 18,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
  },

  stepTileHint: {
    color: 'rgba(255,255,255,0.92)',
    marginTop: 4,
    fontSize: 12,
    fontWeight: '800',
    opacity: 0.95,
  },

  boardWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 110,
  },

  boardTrack: {
    position: 'absolute',
    width: 2,
    borderRadius: 999,
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.16)',
    borderStyle: 'dashed',
    opacity: 0.9,
  },

  // StepTile
  stepTile: {
    width: 280,
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 16,
    paddingRight: 64,
    borderWidth: 1,
  },
  stepTileTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    transform: [{ skewX: '6deg' }],
  },
  stepTileIcon: {
    fontSize: 18,
    fontWeight: '900',
  },
  stepTileNumWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  stepTileNum: {
    color: '#fff',
    fontWeight: '900',
  },
  stepTileTextWrap: {
    flex: 1,
  },
  stepTileTitle: {
    color: '#fff',
    fontWeight: '900',
  },
  stepTileSub: {
    color: '#fff',
    opacity: 0.75,
    marginTop: 2,
  },
  stepTileShadowBase: {
    marginTop: 10,
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.35)',
    transform: [{ skewX: '6deg' }],
  },

  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 60,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  loadingCard: {
    width: '92%',
    maxWidth: 420,
    borderRadius: 18,
    paddingVertical: 18,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(0,0,0,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },

  fab: {
    position: 'absolute',
    right: 16,
    bottom: 24,
    backgroundColor: '#FF6F00',
    borderRadius: 28,
    zIndex: 40,
  },

  dialog: {
    alignSelf: 'center',
    width: '92%',
    maxWidth: 520,
    borderRadius: 16,
  },
  dialogHeader: {
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dialogBackBtn: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialogTitleText: {
    fontWeight: '900',
    fontSize: 18,
    textAlign: 'center',
  },

  tileShell: {
    position: 'relative',
  },

  presenceUnderNumBtn: {
    position: 'absolute',
    left: 16,
    top: 52,
    zIndex: 999,
    elevation: 30,
    paddingVertical: 2,
    paddingHorizontal: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    transform: [{ skewX: '-6deg' }],
  },

  presenceUnderNumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ skewX: '6deg' }],
  },

  presenceMore: {
    marginLeft: 6,
    color: '#fff',
    fontWeight: '900',
    fontSize: 11,
    opacity: 0.9,
  },

  wingUser: {
    position: 'absolute',
    right: -6,
    bottom: -8,
    width: 74,
    height: 74,
    opacity: 1,
  },

  wingUserGhost: {
    position: 'absolute',
    right: -6,
    bottom: -8,
    width: 74,
    height: 74,
    opacity: 0.12,
  },

  reportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  reportName: {
    fontWeight: '700',
  },
  reportSub: {
    opacity: 0.7,
    marginTop: 2,
  },
  reportMetricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 10,
    rowGap: 2,
    marginTop: 5,
  },
  reportMetricText: {
    fontSize: 12,
    opacity: 0.78,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    minWidth: 56,
    alignItems: 'center',
  },
  pillText: {
    fontWeight: '700',
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },

  centerCompleteWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
  },
  centerCompleteBtn: {
    borderRadius: 18,
    minWidth: 260,
    backgroundColor: '#22c55e',
  },

  preflightOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 85,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  preflightCard: {
    width: '86%',
    maxWidth: 360,
    borderRadius: 18,
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
});
