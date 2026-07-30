// app/(tabs)/home/index.jsx
import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  StyleSheet,
  Image,
  View,
  ActivityIndicator,
  ScrollView,
  Alert,
  Pressable,
  DeviceEventEmitter,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { Text, Button, useTheme, Dialog, Portal, Avatar, TextInput } from 'react-native-paper';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, useFocusEffect, useNavigation } from 'expo-router';
import * as Crypto from 'expo-crypto';
import * as Location from 'expo-location';
import WingmanAddDialog from '../../../components/WingmanAddDialog';
import FeedbackState from '../../../components/ui/FeedbackState';
import WelcomeWizard from '../../../components/WelcomeWizard';
import { supabase } from '../../../lib/supabase.js';
import DestinationPickerWizard from '../../../components/DestinationPickerWizard';
import RatingWizardDialog from '../../../components/RatingWizardDialog';
import RatingComparisonModal from '../../../components/RatingComparisonModal';
import { WingShotFlow } from '../../../components/wingShots';
import { averageBeforeSubmission } from '../../../lib/ratingComparison.js';
import { trackEvent } from '../../../lib/analytics';
import { loadWeeklyMission } from '../../../lib/weeklyMission';
import { recordSavedRatingMission, resolvedDeviceTimezone } from '../../../lib/engagement/ratingMissionTracking.js';
import { currentWingDuelCompletion } from '../../../lib/home/monthlyWingDuel';
import {
  ENABLE_GROWTH_MISSIONS,
  ENABLE_BUFFAVERSE_HOME,
  ENABLE_BUFFAVERSE,
} from '../../../config/features';

import { useOnboardingGate } from '../../../hooks/useOnboardingGate';
import { useWingShotsFeatureFlags } from '../../../hooks/useWingShotsFeatureFlags';
import LocationGate from '../../../components/LocationGate';
import CoinRewardModal from '../../../components/CoinRewardModal';
import { useLocationCtx } from '../../../providers/LocationProvider';
import { fetchRandomFunFact } from '../../../utils/funFacts';
import { nyDateString } from '../../../utils/nyDate';
import { useLegendaryFeed } from '../../../hooks/useLegendaryFeed';
import { LegendaryHomeHero } from '../../../components/buffaverse/LegendarySurfaces';
import BuffaverseHomeCard from '../../../components/buffaverse/BuffaverseHomeCard';
import WeeklyMissionDialog from '../../../components/home/WeeklyMissionDialog';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  getSocialCommunityConfig,
  isSocialCommunityConfigured,
  openConfiguredSocialDestination,
} from '../../../lib/socialCommunity';

const SEARCH_RADIUS_M = 160934; // 100 miles
const MS_5_MIN = 30 * 1000;
const HOME_NEXT_SPOT_KEY = 'buffago:homeNextSpot';
const HOME_NEXT_SPOT_EVENT = 'buffago:home_next_spot_selected';

const BUFFAGO_ORANGE = '#FF7A18';
const clamp01 = (n) => Math.max(0, Math.min(1, Number(n) || 0));
const fmt2 = (n) => {
  if (n === null || n === undefined) return '—';
  const num = Number(n);
  return Number.isFinite(num) ? num.toFixed(2) : '—';
};

// Haversine distance (meters)
const haversine = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const metersToMiles = (m) => (Number.isFinite(Number(m)) ? Number(m) / 1609.34 : null);

const MS_24_HOURS = 24 * 60 * 60 * 1000;

const findNextUnratedStop = (stopIds, visitedSet) => {
  const ids = Array.isArray(stopIds) ? stopIds.filter(Boolean) : [];
  if (!ids.length) return { id: null, ord: 1 };

  for (let i = 0; i < ids.length; i++) {
    if (!visitedSet?.has?.(ids[i])) return { id: ids[i], ord: i + 1 };
  }
  return { id: ids[0], ord: 1 };
};

/**
 * Find user's current state via Destinations.state_id
 */
const findNearestStateAbbrev = async (coords) => {
  if (!coords?.latitude || !coords?.longitude) return null;

  const lat0 = Number(coords.latitude);
  const lng0 = Number(coords.longitude);

  const milesToDegLat = (m) => m / 69.0;
  const milesToDegLng = (m, lat) => m / (69.0 * Math.cos((lat * Math.PI) / 180));

  const radiiMiles = [25, 50, 100, 200];
  let best = null;

  for (const rMi of radiiMiles) {
    const dLat = milesToDegLat(rMi);
    const dLng = milesToDegLng(rMi, lat0);

    const { data: rows, error } = await supabase
      .from('destinations')
      .select('id, lat, lng, state_id')
      .gte('lat', lat0 - dLat)
      .lte('lat', lat0 + dLat)
      .gte('lng', lng0 - dLng)
      .lte('lng', lng0 + dLng)
      .not('state_id', 'is', null)
      .limit(250);

    if (error) {
      console.warn('nearest state destination lookup failed:', error.message || error);
      continue;
    }
    if (!rows?.length) continue;

    for (const d of rows) {
      if (d?.lat == null || d?.lng == null || d?.state_id == null) continue;
      const distPickM = haversine(lat0, lng0, Number(d.lat), Number(d   .lng)); // for “nearest to basis”
      const distDisplayM = haversine(lat0, lng0, Number(d.lat), Number(d.lng));
      
      if (!best || distPickM < best._pickDistanceM) {
        best = {
          id: d.id,
          state_id: d.state_id, // ✅ THIS is the missing piece
          lat: d.lat ?? null,
          lng: d.lng ?? null,
      
          distanceM: distDisplayM,
          _pickDistanceM: distPickM,
        };
      }
    }

    if (best?.state_id) break;
  }

  if (!best?.state_id) return null;

  const { data: st, error: stErr } = await supabase
    .from('states')
    .select('state_code')
    .eq('state_id', best.state_id)
    .limit(1);

  if (stErr) {
    console.warn('state abbrev fetch failed:', stErr.message || stErr);
    return null;
  }
  return st?.[0]?.state_code ?? null;
};

/**
 * Hydrate (title + stop1 destination) for a saved selection
 */
async function hydrateSelectedRouteFromDb(sel) {
  try {
    if (!sel?.id) return sel;

    const needsTitle = !sel?.title || sel.title === 'Selected Crawl';
    const start = sel?.startDestination || sel?.stop1 || null;
    const needsStart = !start?.id;

    if (!needsTitle && !needsStart) return sel;

    const { data, error } = await supabase
      .from('routes')
      .select(`id, title, stop1:stop1_id ( id, name, address, city, lat, lng )`)
      .eq('id', sel.id)
      .limit(1);

    if (error) {
      console.warn('hydrateSelectedRouteFromDb failed:', error.message || error);
      return sel;
    }

    const row = data?.[0];
    if (!row) return sel;

    const patched = { ...sel };

    if (needsTitle) patched.title = row.title ?? sel.title ?? 'Selected Crawl';
    if (needsStart && row.stop1) {
      patched.stop1 = row.stop1;
      patched.startDestination = row.stop1;
    }

    await AsyncStorage.setItem('buffago:selectedRoute', JSON.stringify(patched));
    return patched;
  } catch (e) {
    console.warn('hydrateSelectedRouteFromDb exception:', e?.message || e);
    return sel;
  }
}

/**
 * Small XP bar
 */
function XpPepperBar({ progress = 0, label = '' }) {
  const p = Math.max(0, Math.min(1, Number(progress) || 0));
  return (
    <View style={styles.xpOuter}>
      <View style={styles.xpVisual} pointerEvents="none">
        <View style={styles.xpBase}>
          <View style={[styles.xpFill, { width: `${p * 100}%` }]} />
          {!!label && (
            <View style={styles.xpTextOverlay}>
              <Text style={styles.xpText} numberOfLines={1}>
                {label}
              </Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

function DailyGiftPill({ claimed, claiming, onPress }) {
  if (claimed) return null;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={claiming}
      style={({ pressed }) => [
        styles.dailyPill,
        pressed && !claiming && { transform: [{ scale: 0.98 }] },
        claiming && { opacity: 0.85 },
      ]}
    >
      <Text style={styles.dailyPillEmoji}>🎁</Text>
      <Text style={styles.dailyPillText}>{claiming ? '…' : '+10 Daily XP'}</Text>
    </Pressable>
  );
}

function StatLine({ label, done, onPress, rightText, prefix }) {
  const RowWrap = onPress ? Pressable : View;

  return (
    <RowWrap
      onPress={onPress}
      style={({ pressed }) => [
        styles.statRow,
        onPress && { borderRadius: 12, paddingHorizontal: 6 },
        pressed && onPress && { opacity: 0.85 },
      ]}
    >
      <View style={{ flex: 1, position: 'relative', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1, position: 'relative', flexDirection: 'row', alignItems: 'flex-start' }}>
          {prefix ? (
            <Text style={styles.rankPrefix} numberOfLines={1}>
              {prefix}
            </Text>
          ) : null}

          <View style={{ flex: 1, position: 'relative' }}>
            <Text style={[styles.statText, done && styles.statTextDone]}>{label}</Text>

            {done ? (
              <>
                <View
                  pointerEvents="none"
                  style={[styles.redStrike, { top: '54%', transform: [{ rotate: '-4deg' }] }]}
                />
                <View
                  pointerEvents="none"
                  style={[
                    styles.redStrike,
                    { top: '60%', opacity: 0.55, transform: [{ rotate: '-2deg' }] },
                  ]}
                />
              </>
            ) : null}
          </View>
        </View>

        {!!rightText && (
          <Text style={{ fontWeight: '900', opacity: 0.85, fontSize: 12 }}>
            {rightText}
          </Text>
        )}

        {onPress ? <Text style={{ opacity: 0.4, fontWeight: '900' }}>›</Text> : null}
      </View>
    </RowWrap>
  );
}

export default function Home() {
  const tabBarHeight = useBottomTabBarHeight();
  const { colors, dark } = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const { coords, status, refreshPosition } = useLocationCtx();
  const { events: legendaryEvents } = useLegendaryFeed({ limit: 3 });
  const primaryLegendary = legendaryEvents[0] || null;

  // Coins (Battle completion reward)
  const [coinRewardOpen, setCoinRewardOpen] = useState(false);
  const [coinRewardClaiming, setCoinRewardClaiming] = useState(false);
  const COIN_REWARD_AMOUNT = 3;

  // Welcome Wizard (tutorial)
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const { loading: onboardingLoading, shouldShowIntro } = useOnboardingGate();
  const canShowWelcomeWizard = !shouldShowIntro;

  // Destination Picker Wizard
  const [destinationWizardOpen, setDestinationWizardOpen] = useState(false);

  // Restaurant Peek
  const [peekOpen, setPeekOpen] = useState(false);
  const [peekLoading, setPeekLoading] = useState(false);
  const [peek, setPeek] = useState(null);
  const [ratingComparisonVisible, setRatingComparisonVisible] = useState(false);
  const [ratingComparisonData, setRatingComparisonData] = useState(null);

  useEffect(() => {
    navigation.setOptions({ tabBarStyle: ratingComparisonVisible ? { display: 'none' } : undefined });
    return () => navigation.setOptions({ tabBarStyle: undefined });
  }, [navigation, ratingComparisonVisible]);

  // Top 50 cache
  const [top50Ids, setTop50Ids] = useState([]);
  const lastSavedStateKeyRef = useRef('');

  const [loading, setLoading] = useState(true);
  const [nearest, setNearest] = useState(null);

  const [session, setSession] = useState(null);
  const isSignedIn = !!session?.user?.id;
  const { flags: wingShotFlags } = useWingShotsFeatureFlags(isSignedIn);

  const [activeCrawl, setActiveCrawl] = useState(null);
  const [preloadedFact, setPreloadedFact] = useState('');

  const manualClosestRef = useRef(false);

  // Closest Restaurant + Picker
  const [closestLoading, setClosestLoading] = useState(false);
  const [closest, setClosest] = useState(null);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const lastRestaurantSearchStartedRef = useRef('');
  const [searchOverride, setSearchOverride] = useState(null); // { label, latitude, longitude }
  const [wingmanOpen, setWingmanOpen] = useState(false);
  const [wingmanStateCtx, setWingmanStateCtx] = useState(null);

  // Stats dialog
  const [statsOpen, setStatsOpen] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsTitle, setStatsTitle] = useState('');
  const [statsItems, setStatsItems] = useState([]);

  // Wing Fact dialog
  const [wingFactOpen, setWingFactOpen] = useState(false);
  const [wingFactLoading, setWingFactLoading] = useState(false);
  const [wingFactText, setWingFactText] = useState('');

  // Wing Battle (HOME)
  const [battleDialogOpen, setBattleDialogOpen] = useState(false);
  const [battleLoading, setBattleLoading] = useState(false);
  const [battleSaving, setBattleSaving] = useState(false);
  const [battleOptions, setBattleOptions] = useState([]); // active rows
  const [battleVotes, setBattleVotes] = useState({}); // saved map
  const [draftBattle, setDraftBattle] = useState({}); // working map
  const [wingDuelStatus, setWingDuelStatus] = useState('loading');

  // Level Title Picker
  const [titlePickerOpen, setTitlePickerOpen] = useState(false);
  const [unlockedTitles, setUnlockedTitles] = useState([]); // [{ level, title }]
  const [titleOverride, setTitleOverride] = useState(null);

  // HUD
  const [hudStats, setHudStats] = useState({
    loading: false,

    level: null,
    levelTitle: null,
    xp: null,
    xpMin: null,
    xpMax: null,
    levelPct: 0,

    stateAbbrev: null,
    stateId: null,
    stateName: null,
    stateX: null,
    stateY: null,
    stateRatedDestinationIds: [],

    usX: null,
    usY: null,
    usRatedDestinationIds: [],

    statesX: null,
    statesY: null,
    eatenStateIds: [],
  });

  // Daily Gift / Daily XP
  const [dailyGift, setDailyGift] = useState({
    claimedToday: true,
    streak: 0,
    nextResetAt: null,
    lastClaimed: null,
    loading: true,
    claiming: false,
  });

  // ---------- Home Rating Wizard ----------
  const [homeRateOpen, setHomeRateOpen] = useState(false);
  const [homeRateSaving, setHomeRateSaving] = useState(false);
  const [homeRateDest, setHomeRateDest] = useState(null); // { id, name }
  const [homeTagOptions, setHomeTagOptions] = useState([]);
  const homeRatingOperationRef = useRef(null);
  const [homeWingShotVisible, setHomeWingShotVisible] = useState(false);
  const [homeWingShotRatingId, setHomeWingShotRatingId] = useState(null);
  const [homeWingShotDestinationId, setHomeWingShotDestinationId] = useState(null);
  const [homeWingShotSubmitted, setHomeWingShotSubmitted] = useState(false);
  const homePostRatingAdvancedRef = useRef(false);

  // ---------- NEW: Rated status for the current suggested restaurant ----------
  const [homeRated, setHomeRated] = useState({
    destinationId: null,
    score: null,
    at: null,
    within24h: false,
  });
  const [missionSummary, setMissionSummary] = useState(null);
  const [missionLoading, setMissionLoading] = useState(ENABLE_GROWTH_MISSIONS);
  const [missionError, setMissionError] = useState(false);
  const missionRequestRef = useRef(0);
  const [missionDialogOpen, setMissionDialogOpen] = useState(false);
  const [missionTab, setMissionTab] = useState('active');
  const [sendToFriendOpen, setSendToFriendOpen] = useState(false);

  const openWelcomeWizard = useCallback(() => {
    setWelcomeOpen(true);
  }, []);

  const refreshMissionSummary = useCallback(async () => {
    if (!ENABLE_GROWTH_MISSIONS) return;
    if (!session?.user?.id) { setMissionSummary(null); setMissionLoading(false); return; }

    const requestId = missionRequestRef.current + 1;
    missionRequestRef.current = requestId;
    setMissionLoading(true);
    setMissionError(false);
    try {
      const summary = await loadWeeklyMission(supabase);
      if (missionRequestRef.current !== requestId) return;
      setMissionSummary(summary);
    } catch (error) {
      if (missionRequestRef.current !== requestId) return;
      console.warn('[weekly-mission] load_failed', { category: error?.category || 'backend_unavailable' });
      setMissionSummary(null);
      setMissionError(true);
    } finally { if (missionRequestRef.current === requestId) setMissionLoading(false); }
  }, [session?.user?.id]);

  useEffect(() => () => { missionRequestRef.current += 1; }, []);

  const onboardingRedirectedRef = useRef(false);
  useEffect(() => {
    if (onboardingLoading) return;
    if (!shouldShowIntro) return;
    if (onboardingRedirectedRef.current) return;

    onboardingRedirectedRef.current = true;

    router.replace({
      pathname: '/onboarding',
      params: { prefact: preloadedFact ?? '' },
    });
  }, [onboardingLoading, shouldShowIntro, router, preloadedFact]);

  const wingBattleReasonNY = (dateStr) => `wing_battle_complete:${dateStr}`;

  // Coins: award via ledger (idempotent per day)
  const awardBattleCoins = useCallback(async () => {
    if (!session?.user?.id) return;

    setCoinRewardClaiming(true);
    try {
      const uid = session.user.id;
      const today = nyDateString();
      const reason = wingBattleReasonNY(today);

      const { data: existing, error: exErr } = await supabase
        .from('buffacoin_ledger')
        .select('id, created_at')
        .eq('user_id', uid)
        .eq('reason', reason)
        .gte('created_at', `${today}T00:00:00.000Z`)
        .lte('created_at', `${today}T23:59:59.999Z`)
        .limit(1);

      if (exErr) throw exErr;

      if (existing?.length) {
        setCoinRewardOpen(true);
        return;
      }

      const { error: insErr } = await supabase
        .from('buffacoin_ledger')
        .insert({
          user_id: uid,
          delta: COIN_REWARD_AMOUNT,
          reason,
        });

      if (insErr) throw insErr;

      setCoinRewardOpen(true);
    } catch (e) {
      console.warn('awardBattleCoins failed:', e?.message || e);
    } finally {
      setCoinRewardClaiming(false);
    }
  }, [session?.user?.id, COIN_REWARD_AMOUNT]);

  /**
   * Restaurant Peek loader
   */
  const openRestaurantPeek = useCallback(async (destinationId) => {
    if (!destinationId) return;

    trackEvent({
      eventName: 'restaurant_profile_viewed',
      screen: 'home',
      userId: session?.user?.id ?? null,
      destinationId,
      metadata: { source: 'home_peek' },
    });

    setPeekOpen(true);
    setPeekLoading(true);
    setPeek(null);

    try {
      const { data: dRows, error: dErr } = await supabase
        .from('destinations')
        .select(
          `
          id, name, address, city,
          state:state_id ( state_code )
        `
        )
        .eq('id', destinationId)
        .limit(1);

      if (dErr) throw dErr;
      const d = dRows?.[0];
      if (!d) throw new Error('Restaurant not found');

      const stateCode = d?.state?.state_code ?? null;
      const addressLine =
        (d.address ? d.address : '') +
        (d.city ? `${d.address ? ', ' : ''}${d.city}` : '') +
        (stateCode ? `${(d.address || d.city) ? ', ' : ''}${stateCode}` : '');

      const pageSize = 1000;
      let from = 0;
      let all = [];

      while (true) {
        const { data: rRows, error: rErr } = await supabase
          .from('destination_ratings')
          .select('overall, crispiness, sauce, meat, weight_score, crawl_id, tag_id')
          .eq('destination_id', destinationId)
          .range(from, from + pageSize - 1);

        if (rErr) throw rErr;
        if (!rRows?.length) break;

        all = all.concat(rRows);
        if (rRows.length < pageSize) break;
        from += pageSize;

        if (from > 4000) break;
      }

      const n = all.length;

      const sum = { overall: 0, crispiness: 0, sauce: 0, meat: 0, weight: 0 };
      let cnt = { overall: 0, crispiness: 0, sauce: 0, meat: 0, weight: 0 };
      const crawls = new Set();
      const tagCounts = new Map();

      for (const r of all) {
        if (r.crawl_id) crawls.add(r.crawl_id);

        const add = (k, v) => {
          const num = Number(v);
          if (Number.isFinite(num)) {
            sum[k] += num;
            cnt[k] += 1;
          }
        };

        add('overall', r.overall);
        add('crispiness', r.crispiness);
        add('sauce', r.sauce);
        add('meat', r.meat);
        add('weight', r.weight_score);

        if (r.tag_id != null) tagCounts.set(r.tag_id, (tagCounts.get(r.tag_id) || 0) + 1);
      }

      const avg = {
        overall: cnt.overall ? sum.overall / cnt.overall : null,
        crispiness: cnt.crispiness ? sum.crispiness / cnt.crispiness : null,
        sauce: cnt.sauce ? sum.sauce / cnt.sauce : null,
        meat: cnt.meat ? sum.meat / cnt.meat : null,
        weight: cnt.weight ? sum.weight / cnt.weight : null,
      };

      let topTags = [];
      const topTagIds = Array.from(tagCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([id]) => id);

      if (topTagIds.length) {
        const getTagRows = async (field) => {
          const { data, error } = await supabase
            .from('destination_tags')
            .select(`id, ${field}`)
            .in('id', topTagIds);
          if (error) throw error;
          return data || [];
        };

        let tRows = [];
        let fieldUsed = null;

        for (const field of ['name', 'tag', 'title']) {
          try {
            tRows = await getTagRows(field);
            fieldUsed = field;
            break;
          } catch (e) {
            const msg = String(e?.message || e);
            if (
              !msg.includes('does not exist') &&
              !msg.includes('column') &&
              !msg.includes('schema cache')
            )
              throw e;
          }
        }

        if (tRows.length && fieldUsed) {
          const labelById = new Map(tRows.map((t) => [t.id, (t[fieldUsed] || '').trim()]));
          topTags = topTagIds
            .map((id) => ({
              label: labelById.get(id) || null,
              count: tagCounts.get(id) || 0,
            }))
            .filter((t) => t.label)
            .sort((a, b) => b.count - a.count);
        }
      }

      setPeek({
        id: d.id,
        name: d.name,
        addressLine: addressLine || '—',
        stateCode,
        ratingsCount: n,
        crawlsCount: crawls.size,
        avg,
        topTags,
      });
    } catch (e) {
      console.warn('openRestaurantPeek failed:', e?.message || e);
      setPeek({
        id: destinationId,
        name: 'Could not load restaurant',
        addressLine: '',
        stateCode: null,
        ratingsCount: 0,
        crawlsCount: 0,
        avg: { overall: null, crispiness: null, sauce: null, meat: null, weight: null },
        topTags: [],
      });
    } finally {
      setPeekLoading(false);
    }
  }, [session?.user?.id]);

  // Fun-fact rotator (loader only)
  const FUN_FACTS = useRef([
    'The world wing-eating record is over 500 — Molly Schuyler ate 501 wings in 30 minutes.',
    'There are over 1,500 wing-focused restaurants in the U.S.',
    'The average chicken only has two usable wings for wing night.',
    'The Scoville scale measures a wing sauce’s heat by capsaicin level.',
    'Some chefs smoke wings over applewood for sweetness.',
    'Wingette refers to the flat section of the wing.',
    'Chicken wings are a $12-billion-per-year industry in the U.S.',
    'Lemon pepper wings became iconic thanks to Atlanta hip-hop.',
    'Before 1964, restaurants often threw wings away as waste.',
    'The most expensive wings ever sold were $4,900 for 12 wings covered in foie gras and caviar.',
  ]).current;

  const [factIndex, setFactIndex] = useState(0);
  const factTimerRef = useRef(null);

  // Preload fun fact for crawl screens
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const fact = await fetchRandomFunFact();
        if (alive) setPreloadedFact(fact ?? '');
      } catch {
        if (alive) setPreloadedFact('');
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Session
  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error } = await supabase.auth.getSession();

      if (error?.message?.includes('Refresh Token')) {
        try {
          await supabase.auth.signOut();
        } catch {}
        if (active) setSession(null);
        return;
      }

      if (active) setSession(data.session ?? null);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, newSession) => {
      setSession(newSession ?? null);
    });

    return () => sub?.subscription?.unsubscribe?.();
  }, []);

  // Title preference (AsyncStorage)
  const TITLE_PREF_KEY = 'buffago:titlePref';

  const loadTitlePref = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(TITLE_PREF_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, []);

  const saveTitlePref = useCallback(async (pref) => {
    try {
      await AsyncStorage.setItem(TITLE_PREF_KEY, JSON.stringify(pref));
    } catch {}
  }, []);

  const openTitlePicker = useCallback(async () => {
    if (!isSignedIn) return;
    const curLevel = Number(hudStats.level || 0);
    if (curLevel < 2) return;

    try {
      const { data, error } = await supabase
        .from('level_thresholds')
        .select('level, level_title')
        .lte('level', curLevel)
        .order('level', { ascending: true });

      if (error) throw error;

      const list = (data || [])
        .map((r) => ({
          level: Number(r.level),
          title: (r.level_title || '').trim(),
        }))
        .filter((r) => r.level && r.title)
        .sort((a, b) => b.level - a.level);

      setUnlockedTitles(list);
      setTitlePickerOpen(true);
    } catch (e) {
      console.warn('openTitlePicker failed:', e?.message || e);
      setUnlockedTitles([]);
      setTitlePickerOpen(true);
    }
  }, [isSignedIn, hudStats.level]);

  const selectTitleOverride = useCallback(
    async (itemOrNull) => {
      const curLevel = Number(hudStats.level || 0);
      if (curLevel < 2) return;

      const pref = (await loadTitlePref()) || {};
      const nextPref = {
        lastLevelSeen: curLevel,
        override: itemOrNull ? { level: itemOrNull.level, title: itemOrNull.title } : null,
      };

      await saveTitlePref(nextPref);
      setTitleOverride(nextPref.override);
      setTitlePickerOpen(false);
    },
    [hudStats.level, loadTitlePref, saveTitlePref]
  );

  /**
   * Find Top Rated destinations (client-side aggregation) with STATE CODE
   */
  const fetchTopRatedDestinations = useCallback(async ({ limit = 50, maxRows = 20000 } = {}) => {
    const pageSize = 5000;
    let from = 0;

    const agg = new Map();

    while (from < maxRows) {
      const to = from + pageSize - 1;

      const { data, error } = await supabase
        .from('destination_ratings')
        .select(
          `
          destination_id,
          weight_score,
          destination:destination_id (
            id,
            name,
            city,
            state_id,
            state:state_id ( state_code )
          )
          `
        )
        .range(from, to);

      if (error) throw error;
      if (!data?.length) break;

      for (const r of data) {
        const id = r?.destination_id;
        if (!id) continue;

        const w = Number(r.weight_score ?? 0);

        const prev = agg.get(id) || {
          destination_id: id,
          sum: 0,
          count: 0,
          name: r?.destination?.name ?? 'Wing Spot',
          city: r?.destination?.city ?? null,
          state_code: r?.destination?.state?.state_code ?? null,
        };

        prev.sum += w;
        prev.count += 1;

        if (!prev.name && r?.destination?.name) prev.name = r.destination.name;
        if (!prev.city && r?.destination?.city) prev.city = r.destination.city;
        if (!prev.state_code && r?.destination?.state?.state_code)
          prev.state_code = r.destination.state.state_code;

        agg.set(id, prev);
      }

      if (data.length < pageSize) break;
      from += pageSize;
    }

    const list = Array.from(agg.values())
      .filter((x) => x.count > 0)
      .map((x) => ({
        destination_id: x.destination_id,
        avg: x.sum / x.count,
        count: x.count,
        name: x.name,
        city: x.city,
        state_code: x.state_code ?? null,
      }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, limit);

    return list;
  }, []);

  /**
   * Compute Home hero:
   * - selected route in AsyncStorage (preferred)
   * - else nearest route by stop1
   */
  const computePreferred = useCallback(
    async (selectedOverride) => {
      if (!coords || status !== 'granted') {
        setLoading(false);
        return;
      }

      setLoading(true);

      const selected = selectedOverride || null;

      if (selected?.id) {
        const startDest = selected.startDestination || selected.stop1 || null;

        let distanceM = null;
        if (startDest?.lat != null && startDest?.lng != null) {
          distanceM = haversine(coords.latitude, coords.longitude, Number(startDest.lat), Number(startDest.lng));
        }

        setNearest({
          routeId: selected.id ?? null,
          routeTitle: selected.title ?? 'Selected Crawl',
          destName: startDest?.name || '',
          destAddress: startDest?.address ? `${startDest.address}${startDest.city ? `, ${startDest.city}` : ''}` : '',
          distanceM,
          lat: startDest?.lat ?? null,
          lng: startDest?.lng ?? null,
        });

        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('routes')
        .select(`id, title, stop1_id, stop1:stop1_id ( id, name, address, city, lat, lng )`);

      if (error) {
        console.warn('routes/nearest fetch failed', error.message || error);
        setNearest(null);
        setLoading(false);
        return;
      }

      let closestRoute = null;
      let minDist = Infinity;

      for (const r of data || []) {
        const s1 = r.stop1;
        if (!s1 || s1.lat == null || s1.lng == null) continue;
        const dist = haversine(coords.latitude, coords.longitude, Number(s1.lat), Number(s1.lng));
        if (dist <= SEARCH_RADIUS_M && dist < minDist) {
          minDist = dist;
          closestRoute = {
            routeId: r.id,
            routeTitle: r.title ?? 'Nearby Crawl',
            destName: s1.name,
            destAddress: s1.address ? `${s1.address}${s1.city ? `, ${s1.city}` : ''}` : '',
            distanceM: dist,
            lat: s1.lat,
            lng: s1.lng,
          };
        }
      }

      setNearest(closestRoute);
      setLoading(false);
    },
    [coords, status]
  );

  const reloadPreferredFromStorage = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem('buffago:selectedRoute');
      const parsed = raw ? JSON.parse(raw) : null;
      const sel = parsed ? await hydrateSelectedRouteFromDb(parsed) : null;

      await computePreferred(sel);
    } catch (e) {
      console.warn('reloadPreferredFromStorage failed', e?.message || e);
      await computePreferred(null);
    }
  }, [computePreferred]);

  useFocusEffect(
    useCallback(() => {
      reloadPreferredFromStorage();
      return undefined;
    }, [reloadPreferredFromStorage])
  );

  useFocusEffect(
    useCallback(() => {
      void refreshMissionSummary().catch(() => {});
      return undefined;
    }, [refreshMissionSummary])
  );

  useEffect(() => {
    if (status === 'granted' && coords) reloadPreferredFromStorage();
  }, [status, coords?.latitude, coords?.longitude, reloadPreferredFromStorage]);

  useEffect(() => {
    void refreshMissionSummary().catch(() => {});
  }, [refreshMissionSummary]);


  useEffect(() => {
    if (status !== 'granted') return;
    const id = setInterval(async () => {
      await refreshPosition();
      refreshClosestDistanceOnly();
      await reloadPreferredFromStorage();
    }, MS_5_MIN);
    return () => clearInterval(id);
  }, [status, refreshPosition, refreshClosestDistanceOnly, reloadPreferredFromStorage]);

  // Refresh GPS button action: update coords, then update ONLY the distance text
  const refreshDistanceNow = useCallback(async () => {
    try {
      await refreshPosition();
      refreshClosestDistanceOnly();
    } catch (e) {
      console.warn('refreshDistanceNow failed:', e?.message || e);
    }
  }, [refreshPosition, refreshClosestDistanceOnly]);

  /**
   * Active crawl for this route (signed-in only)
   */
  const refreshActiveCrawl = useCallback(async () => {
    if (!isSignedIn || !nearest?.routeId) {
      setActiveCrawl(null);
      return;
    }

    try {
      const { data: crawls, error: crawlErr } = await supabase
        .from('crawls')
        .select('crawl_id, route_id, status')
        .eq('user_id', session.user.id)
        .eq('route_id', nearest.routeId)
        .in('status', ['active', 'in_progress'])
        .limit(1);

      if (crawlErr) {
        console.warn('active crawl fetch failed', crawlErr.message || crawlErr);
        setActiveCrawl(null);
        return;
      }

      const crawl = crawls?.[0];
      if (!crawl) {
        setActiveCrawl(null);
        return;
      }

      const { data: routeRows } = await supabase
        .from('routes')
        .select('stop1_id, stop2_id, stop3_id, stop4_id, stop5_id')
        .eq('id', nearest.routeId)
        .limit(1);

      const routeRow = routeRows?.[0] || null;
      const stopIds = routeRow
        ? [routeRow.stop1_id, routeRow.stop2_id, routeRow.stop3_id, routeRow.stop4_id, routeRow.stop5_id].filter(Boolean)
        : [];

      const totalStops = stopIds.length || 0;

      const { data: ratings } = await supabase
        .from('destination_ratings')
        .select('destination_id')
        .eq('crawl_id', crawl.crawl_id)
        .eq('user_id', session.user.id);

      const visitedSet = new Set();
      for (const r of ratings || []) if (r.destination_id) visitedSet.add(r.destination_id);

      try {
        const { id: nextId, ord: nextOrd } = findNextUnratedStop(stopIds, visitedSet);

        if (nextId) {
          const { data: dRows, error: dErr } = await supabase
            .from('destinations')
            .select('id, name, address, city, lat, lng')
            .eq('id', nextId)
            .limit(1);

          if (dErr) throw dErr;

          const nextDest = dRows?.[0] ?? null;

          if (nextDest) {
            try {
              const raw = await AsyncStorage.getItem('buffago:selectedRoute');
              const parsed = raw ? JSON.parse(raw) : null;

              if (parsed?.id === nearest.routeId) {
                const patched = {
                  ...parsed,
                  startOrd: nextOrd,
                  startDestination: {
                    id: nextDest.id,
                    name: nextDest.name,
                    address: nextDest.address,
                    city: nextDest.city,
                    lat: nextDest.lat ?? null,
                    lng: nextDest.lng ?? null,
                  },
                };
                await AsyncStorage.setItem('buffago:selectedRoute', JSON.stringify(patched));
              }
            } catch (e) {
              console.warn('selectedRoute patch failed:', e?.message || e);
            }

            const distanceM =
              nextDest.lat != null && nextDest.lng != null
                ? haversine(coords.latitude, coords.longitude, Number(nextDest.lat), Number(nextDest.lng))
                : null;

            setNearest((prev) =>
              prev
                ? {
                    ...prev,
                    destName: nextDest.name || prev.destName,
                    destAddress: nextDest.address
                      ? `${nextDest.address}${nextDest.city ? `, ${nextDest.city}` : ''}`
                      : prev.destAddress,
                    distanceM,
                    lat: nextDest.lat ?? prev.lat,
                    lng: nextDest.lng ?? prev.lng,
                  }
                : prev
            );
          }
        }
      } catch (e) {
        console.warn('next stop compute failed:', e?.message || e);
      }

      setActiveCrawl({
        crawlId: crawl.crawl_id,
        routeId: nearest.routeId,
        visitedCount: visitedSet.size,
        totalStops,
      });
    } catch (e) {
      console.warn('refreshActiveCrawl error', e?.message || e);
      setActiveCrawl(null);
    }
  }, [isSignedIn, nearest?.routeId, session?.user?.id, coords?.latitude, coords?.longitude]);

  useEffect(() => {
    refreshActiveCrawl();
  }, [refreshActiveCrawl]);

  const showFunFacts = loading || status !== 'granted' || !coords;

  useEffect(() => {
    if (showFunFacts) {
      setFactIndex((i) => (i + 1) % FUN_FACTS.length);
      if (factTimerRef.current) clearInterval(factTimerRef.current);
      factTimerRef.current = setInterval(() => setFactIndex((i) => (i + 1) % FUN_FACTS.length), 7500);
      return () => {
        if (factTimerRef.current) {
          clearInterval(factTimerRef.current);
          factTimerRef.current = null;
        }
      };
    }

    if (factTimerRef.current) {
      clearInterval(factTimerRef.current);
      factTimerRef.current = null;
    }
  }, [showFunFacts, FUN_FACTS.length]);

  // Cache current state for other screens
  const saveCurrentStateCache = useCallback(async ({ stateId, stateName, stateAbbrev }) => {
    try {
      if (!stateId && !stateName && !stateAbbrev) return;

      const key = `${stateId ?? ''}|${stateName ?? ''}|${stateAbbrev ?? ''}`;
      if (lastSavedStateKeyRef.current === key) return;
      lastSavedStateKeyRef.current = key;

      const payload = {
        state_id: stateId ?? null,
        state_name: stateName ?? null,
        state_code: stateAbbrev ?? null,
        saved_at: new Date().toISOString(),
      };

      await AsyncStorage.setItem('buffago:currentState', JSON.stringify(payload));
    } catch (e) {
      console.warn('saveCurrentStateCache failed:', e?.message || e);
    }
  }, []);

  const getWingmanStateContext = useCallback(async () => {
    if (hudStats?.stateId && hudStats?.stateAbbrev) {
      return {
        stateId: Number(hudStats.stateId),
        stateCode: String(hudStats.stateAbbrev),
      };
    }

    try {
      const raw = await AsyncStorage.getItem('buffago:currentState');
      const parsed = raw ? JSON.parse(raw) : null;

      if (parsed?.state_id && parsed?.state_code) {
        return {
          stateId: Number(parsed.state_id),
          stateCode: String(parsed.state_code),
        };
      }
    } catch (e) {
      console.warn('getWingmanStateContext failed:', e?.message || e);
    }

    return null;
  }, [hudStats?.stateId, hudStats?.stateAbbrev]);

  useEffect(() => {
    let alive = true;

    (async () => {
      const ctx = await getWingmanStateContext();
      if (alive) setWingmanStateCtx(ctx);
    })();

    return () => {
      alive = false;
    };
  }, [getWingmanStateContext, searchOpen]);

  /**
   * HUD refresh (Level + XP, Wingdex stats, top 50)
   */
  const refreshHud = useCallback(async () => {
    if (!isSignedIn || !session?.user?.id) {
      setHudStats({
        loading: false,
        level: null,
        levelTitle: null,
        xp: null,
        xpMin: null,
        xpMax: null,
        levelPct: 0,
        stateAbbrev: null,
        stateId: null,
        stateName: null,
        stateX: null,
        stateY: null,
        stateRatedDestinationIds: [],
        usX: null,
        usY: null,
        usRatedDestinationIds: [],
        statesX: null,
        statesY: null,
        eatenStateIds: [],
      });
      setTitleOverride(null);
      setTop50Ids([]);
      return;
    }

    if (status !== 'granted' || !coords) {
      setHudStats((s) => ({ ...s, loading: false }));
      return;
    }

    setHudStats((s) => ({ ...s, loading: true }));

    try {
      const top = await fetchTopRatedDestinations({ limit: 50 });
      setTop50Ids((top || []).map((d) => d.destination_id).filter(Boolean));
    } catch {
      setTop50Ids([]);
    }

    try {
      let level = null;
      let xp = null;

      const { data: lvlRows } = await supabase
        .from('user_with_level')
        .select('level, xp')
        .eq('user_id', session.user.id)
        .limit(1);

      if (lvlRows?.[0]) {
        level = lvlRows[0].level ?? null;
        xp = lvlRows[0].xp ?? null;
      }

      let levelTitle = null;
      let xpMin = null;
      let xpMax = null;
      let levelPct = 0;

      if (level != null && xp != null) {
        const { data: thRows } = await supabase
          .from('level_thresholds')
          .select('level, xp_required, level_title')
          .in('level', [Number(level), Number(level) + 1]);

        const cur = thRows?.find((r) => Number(r.level) === Number(level));
        const nxt = thRows?.find((r) => Number(r.level) === Number(level) + 1);

        xpMin = cur?.xp_required ?? null;
        xpMax = nxt?.xp_required ?? null;
        levelTitle = (cur?.level_title ?? '').trim() || null;

        if (xpMin != null && xpMax != null && Number(xpMax) > Number(xpMin)) {
          levelPct = clamp01((Number(xp) - Number(xpMin)) / (Number(xpMax) - Number(xpMin)));
        }
      }

      try {
        const pref = await loadTitlePref();
        const lastLevelSeen = pref?.lastLevelSeen ?? null;

        if (level != null && lastLevelSeen != null && Number(level) !== Number(lastLevelSeen)) {
          const nextPref = { lastLevelSeen: Number(level), override: null };
          await saveTitlePref(nextPref);
          setTitleOverride(null);
        } else if (level != null && lastLevelSeen == null) {
          const nextPref = { lastLevelSeen: Number(level), override: null };
          await saveTitlePref(nextPref);
          setTitleOverride(null);
        } else {
          if (pref?.override?.title) setTitleOverride(pref.override);
          else setTitleOverride(null);
        }
      } catch {
        setTitleOverride(null);
      }

      let usY = null;
      try {
        const { count } = await supabase.from('destinations').select('id', { count: 'exact', head: true });
        if (typeof count === 'number') usY = count;
      } catch {}

      let usX = null;
      let usRatedDestinationIds = [];
      try {
        const { data: ur } = await supabase
          .from('destination_ratings')
          .select('destination_id')
          .eq('user_id', session.user.id);

        const set = new Set();
        for (const r of ur || []) if (r?.destination_id) set.add(r.destination_id);
        usRatedDestinationIds = Array.from(set);
        usX = set.size;
      } catch {}

      let statesY = null;
      try {
        const { count } = await supabase.from('states').select('state_id', { count: 'exact', head: true });
        if (typeof count === 'number') statesY = count;
      } catch {}

      let eatenStateIds = [];
      try {
        const { data: sr } = await supabase
          .from('destination_ratings')
          .select('destination_id, destination:destination_id ( state_id )')
          .eq('user_id', session.user.id);

        const stSet = new Set();
        for (const r of sr || []) {
          const sid = r?.destination?.state_id;
          if (sid != null) stSet.add(sid);
        }
        eatenStateIds = Array.from(stSet);
      } catch {}

      const statesX = eatenStateIds.length;

      const stateAbbrev = await findNearestStateAbbrev(coords);

      if (!stateAbbrev) {
        setHudStats({
          loading: false,
          level,
          levelTitle,
          xp,
          xpMin,
          xpMax,
          levelPct,
          stateAbbrev: null,
          stateId: null,
          stateName: null,
          stateX: null,
          stateY: null,
          stateRatedDestinationIds: [],
          usX,
          usY,
          usRatedDestinationIds,
          statesX,
          statesY,
          eatenStateIds,
        });
        return;
      }

      const { data: stRows } = await supabase
        .from('states')
        .select('state_id, state_name')
        .eq('state_code', stateAbbrev)
        .limit(1);

      const stateId = stRows?.[0]?.state_id ?? null;
      const stateName = stRows?.[0]?.state_name ?? null;

      await saveCurrentStateCache({ stateId, stateName, stateAbbrev });

      if (!stateId) {
        setHudStats({
          loading: false,
          level,
          levelTitle,
          xp,
          xpMin,
          xpMax,
          levelPct,
          stateAbbrev,
          stateId: null,
          stateName,
          stateX: null,
          stateY: null,
          stateRatedDestinationIds: [],
          usX,
          usY,
          usRatedDestinationIds,
          statesX,
          statesY,
          eatenStateIds,
        });
        return;
      }

      let stateY = null;
      try {
        const { count } = await supabase
          .from('destinations')
          .select('id', { count: 'exact', head: true })
          .eq('state_id', stateId);
        if (typeof count === 'number') stateY = count;
      } catch {}

      let stateX = null;
      let stateRatedDestinationIds = [];
      try {
        const { data: rows } = await supabase
          .from('destination_ratings')
          .select('destination_id, destination:destination_id ( state_id )')
          .eq('user_id', session.user.id);

        const set = new Set();
        for (const r of rows || []) {
          if (!r?.destination_id) continue;
          if (r?.destination?.state_id === stateId) set.add(r.destination_id);
        }
        stateRatedDestinationIds = Array.from(set);
        stateX = set.size;
      } catch {}

      setHudStats({
        loading: false,
        level,
        levelTitle,
        xp,
        xpMin,
        xpMax,
        levelPct,
        stateAbbrev,
        stateId,
        stateName,
        stateX,
        stateY,
        stateRatedDestinationIds,
        usX,
        usY,
        usRatedDestinationIds,
        statesX,
        statesY,
        eatenStateIds,
      });
    } catch (e) {
      console.warn('refreshHud failed', e?.message || e);
      setHudStats((s) => ({ ...s, loading: false }));
    }
  }, [
    isSignedIn,
    session?.user?.id,
    status,
    coords?.latitude,
    coords?.longitude,
    saveCurrentStateCache,
    loadTitlePref,
    saveTitlePref,
    fetchTopRatedDestinations,
  ]);

  /* Daily Gift (Home) */
  const loadDailyStatus = useCallback(async (uid) => {
    if (!uid) {
      setDailyGift((g) => ({ ...g, loading: false, claimedToday: true }));
      return;
    }
    try {
      const { data, error } = await supabase.rpc('daily_xp_status', { p_user: uid });
      if (error) throw error;

      setDailyGift({
        claimedToday: !!data?.claimed_today,
        streak: Number(data?.streak ?? 0),
        nextResetAt: data?.next_reset_at ?? null,
        lastClaimed: null,
        loading: false,
        claiming: false,
      });
    } catch (e) {
      console.warn('daily_xp_status failed:', e?.message || e);
      setDailyGift((g) => ({ ...g, loading: false }));
    }
  }, []);

  const claimDaily = useCallback(
    async (uid) => {
      if (!uid) return;
      setDailyGift((g) => ({ ...g, claiming: true }));

      try {
        const { error } = await supabase.rpc('claim_daily_xp', { p_user: uid });
        if (error) throw error;

        await loadDailyStatus(uid);
        await refreshHud();

        setDailyGift((g) => ({
          ...g,
          claiming: false,
          claimedToday: true,
          lastClaimed: nyDateString(),
        }));
      } catch (e) {
        console.warn('claim_daily_xp failed:', e?.message || e);
        setDailyGift((g) => ({ ...g, claiming: false }));
      }
    },
    [loadDailyStatus, refreshHud]
  );

  useEffect(() => {
    refreshHud();

    if (isSignedIn && session?.user?.id) loadDailyStatus(session.user.id);
    else setDailyGift((g) => ({ ...g, loading: false, claimedToday: true }));
  }, [refreshHud, isSignedIn, session?.user?.id, loadDailyStatus]);

  /* Wing Facts (Home) */
  const loadNextWingFact = useCallback(async () => {
    setWingFactLoading(true);
    try {
      const fact = await fetchRandomFunFact();
      setWingFactText((fact ?? '').trim());
    } catch (e) {
      console.warn('loadNextWingFact failed:', e?.message || e);
      setWingFactText('');
    } finally {
      setWingFactLoading(false);
    }
  }, []);

  const openWingFacts = useCallback(async () => {
    setWingFactOpen(true);
    if (!wingFactText) await loadNextWingFact();
  }, [wingFactText, loadNextWingFact]);

  /* ---------------- Wing Battle (Home) ---------------- */

  const loadBattle = useCallback(async () => {
    if (!isSignedIn || !session?.user?.id) {
      setBattleOptions([]);
      setBattleVotes({});
      setDraftBattle({});
      setWingDuelStatus('incomplete');
      return;
    }

    setBattleLoading(true);
    setWingDuelStatus('loading');
    try {
      const { data: options, error: optErr } = await supabase
        .from('wing_battle_options_active')
        .select('id, label, left_option, right_option');

      if (optErr) throw optErr;

      const rows = options || [];
      setBattleOptions(rows);

      if (!rows.length) {
        setBattleVotes({});
        setDraftBattle({});
        return;
      }

      const battleIds = rows.map((r) => r.id).filter(Boolean);

      const { data: votes, error: voteErr } = await supabase
        .from('user_wing_battle_votes')
        .select('battle_id, choice')
        .eq('user_id', session.user.id)
        .in('battle_id', battleIds);

      if (voteErr) throw voteErr;

      const map = {};
      for (const v of votes || []) {
        if (v?.battle_id != null) map[v.battle_id] = Number(v.choice);
      }

      setBattleVotes(map);
      setDraftBattle(map);
      setWingDuelStatus(currentWingDuelCompletion(rows, map) ? 'completed' : 'incomplete');
    } catch (e) {
      console.warn('loadBattle failed:', e?.message || e);
      setBattleOptions([]);
      setBattleVotes({});
      setDraftBattle({});
      setWingDuelStatus('error');
    } finally {
      setBattleLoading(false);
    }
  }, [isSignedIn, session?.user?.id]);

  const saveBattle = useCallback(async () => {
    if (!isSignedIn || !session?.user?.id) return;

    try {
      setBattleSaving(true);

      const battleIds = (battleOptions || []).map((o) => o.id).filter(Boolean);

      const answeredBefore = battleIds.filter((id) => {
        const v = Number(battleVotes?.[id]);
        return v === 1 || v === 2;
      }).length;
      const completeBefore = battleIds.length > 0 && answeredBefore === battleIds.length;

      const payload = battleIds
        .map((battle_id) => {
          const choice = Number(draftBattle?.[battle_id]);
          return choice === 1 || choice === 2
            ? { user_id: session.user.id, battle_id, choice }
            : null;
        })
        .filter(Boolean);

      if (!payload.length) {
        await trackEvent({
          eventName: 'wing_battle_abandoned',
          screen: 'home',
          userId: session.user.id,
          metadata: { battle_count: battleIds.length, reason: 'no_votes' },
        });
        setBattleDialogOpen(false);
        return;
      }

      const { error } = await supabase
        .from('user_wing_battle_votes')
        .upsert(payload, { onConflict: 'user_id,battle_id' });

      if (error) throw error;

      const nextVotes = { ...(battleVotes || {}), ...(draftBattle || {}) };
      setBattleVotes(nextVotes);

      const answeredAfter = battleIds.filter((id) => {
        const v = Number(nextVotes?.[id]);
        return v === 1 || v === 2;
      }).length;
      const completeAfter = battleIds.length > 0 && answeredAfter === battleIds.length;
      setWingDuelStatus(completeAfter ? 'completed' : 'incomplete');

      await trackEvent({
        eventName: completeAfter ? 'wing_battle_completed' : 'wing_battle_vote_submitted',
        screen: 'home',
        userId: session.user.id,
        metadata: {
          battle_count: battleIds.length,
          answered_before: answeredBefore,
          answered_after: answeredAfter,
          newly_completed: !completeBefore && completeAfter,
        },
      });

      setBattleDialogOpen(false);

      if (!completeBefore && completeAfter) {
        await awardBattleCoins();
      }
    } catch (e) {
      await trackEvent({
        eventName: 'wing_battle_failed',
        screen: 'home',
        userId: session?.user?.id ?? null,
        metadata: { error: e?.message || String(e) },
      });
      console.warn('saveBattle failed:', e?.message || e);
      Alert.alert('Error', e?.message ?? 'Could not save your Wing Battle votes.');
    } finally {
      setBattleSaving(false);
    }
  }, [
    isSignedIn,
    session?.user?.id,
    battleOptions,
    draftBattle,
    battleVotes,
    awardBattleCoins,
  ]);

  useFocusEffect(
    useCallback(() => {
      loadBattle();
      return undefined;
    }, [loadBattle])
  );

  /**
   * Stats dialog
   */
  const openStats = useCallback(
    async (type) => {
      if (!isSignedIn || !session?.user?.id) return;

      setStatsOpen(true);
      setStatsLoading(true);
      setStatsItems([]);

      try {
        if (type === 'states') {
          setStatsTitle('STATES');

          const { data: allStates, error } = await supabase
            .from('states')
            .select('state_id, state_name')
            .order('state_name', { ascending: true });

          if (error) throw error;

          const eaten = new Set(hudStats.eatenStateIds || []);
          const items = (allStates || []).map((s) => ({ label: s.state_name, done: eaten.has(s.state_id) }));

          setStatsItems(items);
          return;
        }

        if (type === 'ct') {
          const abbrev = hudStats.stateAbbrev || 'STATE';
          setStatsTitle(`${abbrev} WINGDEX`);

          if (!hudStats.stateId) {
            setStatsItems([{ label: 'Could not determine your current state.', done: false }]);
            return;
          }

          const { data: dests, error } = await supabase
            .from('destinations')
            .select('id, name, city')
            .eq('state_id', hudStats.stateId)
            .order('name', { ascending: true })
            .limit(500);

          if (error) throw error;

          const rated = new Set(hudStats.stateRatedDestinationIds || []);
          const items = (dests || []).map((d) => ({
            label: `${d.name}${d.city ? ` — ${d.city}` : ''}`,
            done: rated.has(d.id),
            onPress: () => openRestaurantPeek(d.id),
          }));

          setStatsItems(items);
          return;
        }

        if (type === 'us_top50') {
          setStatsTitle('TOP 50 US');

          const top = await fetchTopRatedDestinations({ limit: 50 });
          const eaten = new Set(hudStats.usRatedDestinationIds || []);

          const prefixForRank = (rank) => {
            if (rank === 1) return '🥇';
            if (rank === 2) return '🥈';
            if (rank === 3) return '🥉';
            return `${rank}.`;
          };

          const items = (top || []).map((d, idx) => {
            const rank = idx + 1;
            const st = d?.state_code || null;

            return {
              prefix: prefixForRank(rank),
              label: `${d.name || 'Wing Spot'}${st ? ` — ${st}` : ''}`,
              done: eaten.has(d.destination_id),
              rightText: fmt2(d.avg),
              onPress: () => openRestaurantPeek(d.destination_id),
            };
          });

          setStatsItems(items.length ? items : [{ label: 'Not enough ratings yet — go eat wings 🔥', done: false }]);
          return;
        }

        setStatsItems([{ label: 'Unknown stats view.', done: false }]);
      } catch (e) {
        console.warn('openStats failed', e?.message || e);
        setStatsItems([{ label: 'Failed to load. Try again.', done: false }]);
      } finally {
        setStatsLoading(false);
      }
    },
    [
      isSignedIn,
      session?.user?.id,
      hudStats.eatenStateIds,
      hudStats.stateAbbrev,
      hudStats.stateId,
      hudStats.stateRatedDestinationIds,
      hudStats.usRatedDestinationIds,
      fetchTopRatedDestinations,
      openRestaurantPeek,
    ]
  );

  const xpBarLabel = hudStats.xp != null && hudStats.xpMax != null ? `XP ${hudStats.xp}/${hudStats.xpMax}` : '';
  const shownTitle = titleOverride?.title || hudStats.levelTitle;
  const titleIsClickable = isSignedIn && Number(hudStats.level || 0) >= 2;

  const statePct = useMemo(() => {
    const x = Number(hudStats.stateX);
    const y = Number(hudStats.stateY);
    return y > 0 && Number.isFinite(x) ? clamp01(x / y) : 0;
  }, [hudStats.stateX, hudStats.stateY]);

  const statesPct = useMemo(() => {
    const x = Number(hudStats.statesX);
    const y = Number(hudStats.statesY);
    return y > 0 && Number.isFinite(x) ? clamp01(x / y) : 0;
  }, [hudStats.statesX, hudStats.statesY]);

  const top50X = useMemo(() => {
    if (!top50Ids.length) return 0;
    const eaten = new Set(hudStats.usRatedDestinationIds || []);
    return top50Ids.filter((id) => eaten.has(id)).length;
  }, [top50Ids, hudStats.usRatedDestinationIds]);

  const top50Pct = useMemo(() => clamp01(top50X / 50), [top50X]);

  const hudBarColor = '#2E7D32';
  const hudBaseBg = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';

  // Closest Restaurant logic
  const getBasisCoords = useCallback(() => {
    if (searchOverride?.latitude != null && searchOverride?.longitude != null) {
      return { latitude: Number(searchOverride.latitude), longitude: Number(searchOverride.longitude) };
    }
    if (coords?.latitude != null && coords?.longitude != null) {
      return { latitude: Number(coords.latitude), longitude: Number(coords.longitude) };
    }
    return null;
  }, [coords?.latitude, coords?.longitude, searchOverride?.latitude, searchOverride?.longitude]);

  const applyHomeNextSpot = useCallback(
    async (spot) => {
      if (!spot?.id) return;

      const lat = spot?.lat != null ? Number(spot.lat) : null;
      const lng = spot?.lng != null ? Number(spot.lng) : null;
      const userLat = coords?.latitude != null ? Number(coords.latitude) : null;
      const userLng = coords?.longitude != null ? Number(coords.longitude) : null;
      const distM =
        userLat != null && userLng != null && lat != null && lng != null
          ? haversine(userLat, userLng, lat, lng)
          : null;

      manualClosestRef.current = true;
      setClosest({
        id: spot.id,
        name: spot.name ?? 'Wing Spot',
        address: spot.address ?? null,
        city: spot.city ?? null,
        lat,
        lng,
        distanceM: distM,
      });

      setSearchOverride(
        lat != null && lng != null
          ? {
              label: `${spot.name ?? 'Wing Spot'}${spot.city ? `, ${spot.city}` : ''}`,
              latitude: lat,
              longitude: lng,
            }
          : null
      );

      await trackEvent({
        eventName: 'restaurant_selected',
        screen: 'home',
        userId: session?.user?.id ?? null,
        destinationId: spot.id,
        metadata: {
          source_screen: 'ratings',
          source: spot.source ?? 'wingdex_detail',
          distance_from_user: distM,
          distance_miles: distM != null ? metersToMiles(distM) : null,
        },
      });
    },
    [coords?.latitude, coords?.longitude, session?.user?.id]
  );

  const loadHomeNextSpot = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(HOME_NEXT_SPOT_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed?.id) await applyHomeNextSpot(parsed);
    } catch (e) {
      console.warn('loadHomeNextSpot failed:', e?.message || e);
    }
  }, [applyHomeNextSpot]);

  useFocusEffect(
    useCallback(() => {
      loadHomeNextSpot();
      return undefined;
    }, [loadHomeNextSpot])
  );

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(HOME_NEXT_SPOT_EVENT, applyHomeNextSpot);
    return () => sub.remove();
  }, [applyHomeNextSpot]);

  // Only refresh the distance text for the current closest card.
  const refreshClosestDistanceOnly = useCallback(() => {
    try {
      if (status !== 'granted') return;
  
      const userLat = coords?.latitude != null ? Number(coords.latitude) : null;
      const userLng = coords?.longitude != null ? Number(coords.longitude) : null;
      if (userLat == null || userLng == null) return;
  
      const destLat = closest?.lat != null ? Number(closest.lat) : null;
      const destLng = closest?.lng != null ? Number(closest.lng) : null;
      if (destLat == null || destLng == null) return;
  
      const distDisplayM = haversine(userLat, userLng, destLat, destLng);
  
      setClosest((prev) => {
        if (!prev) return prev;
        return { ...prev, distanceM: distDisplayM };
      });
    } catch (e) {
      console.warn('refreshClosestDistanceOnly failed:', e?.message || e);
    }
  }, [status, coords?.latitude, coords?.longitude, closest?.lat, closest?.lng]);

  const refreshClosest = useCallback(async () => {
  if (status !== 'granted') return;

  const basis = getBasisCoords();
  if (manualClosestRef.current) return;

  if (!basis) {
    setClosest(null);
    return;
  }

  setClosestLoading(true);
  try {
    const lat0 = basis.latitude;
    const lng0 = basis.longitude;

    const userLat = coords?.latitude != null ? Number(coords.latitude) : null;
    const userLng = coords?.longitude != null ? Number(coords.longitude) : null;

    const milesToDegLat = (m) => m / 69.0;
    const milesToDegLng = (m, lat) => m / (69.0 * Math.cos((lat * Math.PI) / 180));

    const radiiMiles = [10, 25, 50, 100, 200];
    let best = null;

    for (const rMi of radiiMiles) {
      const dLat = milesToDegLat(rMi);
      const dLng = milesToDegLng(rMi, lat0);

      const { data: rows, error } = await supabase
        .from('destinations')
        .select('id, name, address, city, state_id, lat, lng')
        .gte('lat', lat0 - dLat)
        .lte('lat', lat0 + dLat)
        .gte('lng', lng0 - dLng)
        .lte('lng', lng0 + dLng)
        .limit(500);

      if (error) {
        console.warn('closest destinations lookup failed:', error.message || error);
        break;
      }

      const pool = rows || [];
      if (!pool.length) continue;

      for (const d of pool) {
        if (d?.lat == null || d?.lng == null) continue;

        const distPickM = haversine(lat0, lng0, Number(d.lat), Number(d.lng));

        const distDisplayM =
          userLat != null && userLng != null
            ? haversine(userLat, userLng, Number(d.lat), Number(d.lng))
            : null;

        if (!best || distPickM < best._pickDistanceM) {
          best = {
            id: d.id,
            name: d.name ?? 'Wing Spot',
            address: d.address ?? null,
            city: d.city ?? null,
            lat: d.lat ?? null,
            lng: d.lng ?? null,
            distanceM: distDisplayM,
            _pickDistanceM: distPickM,
          };
        }
      }

      if (best) break;
    }

    if (best?._pickDistanceM != null) {
      const { _pickDistanceM, ...clean } = best;
      best = clean;
    }

    setClosest(best);
  } catch (e) {
    console.warn('refreshClosest failed:', e?.message || e);
    setClosest(null);
  } finally {
    setClosestLoading(false);
  }
}, [status, getBasisCoords, coords?.latitude, coords?.longitude]);

  useEffect(() => {
    if (status !== 'granted') return;
  
    // If nothing selected yet, pick one on first grant
    if (!closest?.id) {
      refreshClosest();
      return;
    }
  
    // If searchOverride changes, it's ok to re-pick
    refreshClosest();
  }, [status, searchOverride?.latitude, searchOverride?.longitude, refreshClosest, closest?.id]);
  
  useEffect(() => {
  if (status !== 'granted') return;
  refreshClosestDistanceOnly();
  }, [status, coords?.latitude, coords?.longitude, refreshClosestDistanceOnly]);

  const openDirections = useCallback(async () => {
    if (!closest?.lat || !closest?.lng) return;
    const lat = Number(closest.lat);
    const lng = Number(closest.lng);
    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${lat},${lng}`)}`;
    try {
      await trackEvent({
        eventName: 'directions_tapped',
        screen: 'home',
        userId: session?.user?.id ?? null,
        destinationId: closest?.id ?? null,
        metadata: {
          source: 'closest_restaurant_card',
          distance_miles: closest?.distanceM != null ? metersToMiles(closest.distanceM) : null,
          map_provider: 'google_maps_url',
        },
      });
      await Linking.openURL(url);
    } catch (e) {
      await trackEvent({
        eventName: 'external_maps_failed',
        screen: 'home',
        userId: session?.user?.id ?? null,
        destinationId: closest?.id ?? null,
        metadata: { error: e?.message || String(e) },
      });
      console.warn('openDirections failed:', e?.message || e);
    }
  }, [closest?.lat, closest?.lng, closest?.id, closest?.distanceM, session?.user?.id]);

  // ---------- load tags for wizard ----------
  const loadHomeTagOptions = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('destination_tags')
        .select('id, tag')
        .order('tag', { ascending: true })
        .limit(500);

      if (error) throw error;

      const opts = (data || [])
        .map((r) => {
          const id = r?.id;
          const label = String(r?.tag ?? '').trim();
          if (!id || !label) return null;
          return { id, label };
        })
        .filter(Boolean);

      setHomeTagOptions(opts);
    } catch (e) {
      console.warn('loadHomeTagOptions failed:', e?.message || e);
      setHomeTagOptions([]);
    }
  }, []);

  // ---------- NEW: Guest cache helpers for home "already rated" ----------
  const guestHomeRatedKey = useCallback((destId) => `buffago:homeRated:${destId}`, []);
  const loadGuestHomeRated = useCallback(
    async (destId) => {
      if (!destId) return null;
      try {
        const raw = await AsyncStorage.getItem(guestHomeRatedKey(destId));
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    },
    [guestHomeRatedKey]
  );

  const saveGuestHomeRated = useCallback(
    async (destId, score) => {
      if (!destId) return;
      try {
        await AsyncStorage.setItem(
          guestHomeRatedKey(destId),
          JSON.stringify({
            destinationId: destId,
            score: score ?? null,
            at: new Date().toISOString(),
          })
        );
      } catch {}
    },
    [guestHomeRatedKey]
  );

  // ---------- NEW: Refresh "already rated" for the current suggested restaurant ----------
  const refreshHomeRatedForClosest = useCallback(async () => {
  const destId = closest?.id;
  if (!destId) {
    setHomeRated({ destinationId: null, score: null, at: null, within24h: false });
    return;
  }

  const cutoffIso = new Date(Date.now() - MS_24_HOURS).toISOString();

  // Signed in: query latest rating in last 24h with is_buffacoin = false
  if (session?.user?.id) {
    try {
      // Try with is_buffacoin filter first. If column does not exist, retry without it.
      let q = supabase
        .from('destination_ratings')
        .select('id, weight_score, created_at')
        .eq('user_id', session.user.id)
        .eq('destination_id', destId)
        .gte('created_at', cutoffIso)
        .order('created_at', { ascending: false })
        .limit(1);

      // If your column name is different, swap it here.
      q = q.eq('is_buffacoin', false);

      let { data, error } = await q;

      if (error) {
        const msg = String(error?.message || '');
        const looksLikeMissingColumn =
          msg.includes('column') || msg.includes('does not exist') || msg.includes('schema cache');

        if (looksLikeMissingColumn) {
          // Retry without the is_buffacoin filter
          const retry = await supabase
            .from('destination_ratings')
            .select('id, weight_score, created_at')
            .eq('user_id', session.user.id)
            .eq('destination_id', destId)
            .gte('created_at', cutoffIso)
            .order('created_at', { ascending: false })
            .limit(1);

          data = retry.data;
          error = retry.error;
        }
      }

      if (error) throw error;

      const row = data?.[0] ?? null;
      if (!row) {
        setHomeRated({ destinationId: destId, score: null, at: null, within24h: false });
        return;
      }

      setHomeRated({
        destinationId: destId,
        score: row.weight_score != null ? Number(row.weight_score) : null,
        at: row.created_at ?? null,
        within24h: true,
      });
      return;
    } catch (e) {
      console.warn('refreshHomeRatedForClosest failed:', e?.message || e);
      setHomeRated({ destinationId: destId, score: null, at: null, within24h: false });
      return;
    }
  }

  // Guest: local cache check within 24h
  const cached = await loadGuestHomeRated(destId);
  const atMs = cached?.at ? Date.parse(cached.at) : NaN;
  const within24h = Number.isFinite(atMs) ? Date.now() - atMs < MS_24_HOURS : false;

  setHomeRated({
    destinationId: destId,
    score: cached?.score != null ? Number(cached.score) : null,
    at: cached?.at ?? null,
    within24h,
  });
}, [closest?.id, session?.user?.id, loadGuestHomeRated]);

  useEffect(() => {
    refreshHomeRatedForClosest();
  }, [refreshHomeRatedForClosest]);

  const alreadyRatedThis =
  homeRated?.destinationId === closest?.id && !!homeRated?.within24h;

  const openSendToFriend = useCallback(async () => {
    if (!closest?.id) {
      return;
    }

    await trackEvent({
      eventName: 'feature_entry',
      screen: 'home',
      userId: session?.user?.id ?? null,
      destinationId: closest.id,
      metadata: { feature_name: 'send_restaurant_to_friend', source: 'home_next_place' },
    });
    setSendToFriendOpen(true);
  }, [closest?.id, session?.user?.id]);

  // ---------- open wizard from Home ----------
  const openHomeRatingWizard = useCallback(async () => {
    if (!closest?.id) return;

    trackEvent({
      eventName: 'primary_cta_clicked',
      screen: 'home',
      userId: session?.user?.id ?? null,
      destinationId: closest?.id ?? null,
      metadata: { cta_name: 'rate_closest_spot', source_screen: 'home' },
    });

    if (alreadyRatedThis) {
      trackEvent({
        eventName: 'rating_validation_failed',
        screen: 'home',
        userId: session?.user?.id ?? null,
        destinationId: closest?.id ?? null,
        metadata: { reason: 'already_rated_recently' },
      });
      Alert.alert(
        'Already rated',
        `You rated this spot ${fmt2(homeRated?.score)}.`
      );
      return;
    }

    const ADMIN_ID = '23898359-306a-4dd3-91f0-da66da19ccfc';
    const isAdmin = session?.user?.id === ADMIN_ID;
    
    const milesAway = closest?.distanceM != null ? metersToMiles(closest.distanceM) : null;
    
    if (!isAdmin && (milesAway == null || milesAway > 0.1)) {
      trackEvent({
        eventName: 'rating_validation_failed',
        screen: 'home',
        userId: session?.user?.id ?? null,
        destinationId: closest?.id ?? null,
        metadata: { reason: 'too_far', distance_miles: milesAway },
      });
      Alert.alert(
        'Not close enough',
        'You must be within 0.1 miles to rate this spot. Or head to the Wingdex if you have Buffacoins!'
      );
      return;
    }

    setHomeRateDest({ id: closest.id, name: closest.name || 'Wing Spot' });
    homeRatingOperationRef.current = Crypto.randomUUID();
    if (!homeTagOptions?.length) await loadHomeTagOptions();
    await trackEvent({
      eventName: 'rating_started',
      screen: 'home',
      userId: session?.user?.id ?? null,
      destinationId: closest.id,
      metadata: { source: 'closest_restaurant_card', distance_miles: milesAway },
    });
    setHomeRateOpen(true);
  }, [
    closest?.id,
    closest?.name,
    closest?.distanceM,
    homeTagOptions?.length,
    loadHomeTagOptions,
    alreadyRatedThis,
    homeRated?.score,
    session?.user?.id,
  ]);

  // ---------- save rating from Home wizard ----------
  const saveHomeRating = useCallback(
    async (payload) => {
      if (!homeRateDest?.id) return;

      const destId = homeRateDest.id;
      const destinationName = homeRateDest.name || 'Restaurant';
      const uid = session?.user?.id ?? null;
      let crawlId = Crypto.randomUUID();

      const scores = payload?.scores || payload || {};
      const crispiness = Number(scores.crispiness ?? scores.crunch ?? scores.crunchFactor ?? scores.crunch_factor);
      const sauce = Number(scores.sauce ?? scores.sauceFactor ?? scores.sauce_factor);
      const meat = Number(scores.meat ?? scores.meatiness ?? scores.meat_factor);
      const overall = Number(scores.overall ?? scores.total ?? scores.score);

      let priorCommunity = null;
      try {
        const { data: priorRows, error: priorError } = await supabase
          .from('destination_ratings')
          .select('id, crispiness, sauce, meat, overall')
          .eq('destination_id', destId);
        if (priorError) throw priorError;
        priorCommunity = Array.isArray(priorRows) ? priorRows : [];
      } catch (snapshotError) {
        console.warn('Unable to capture the prior restaurant rating snapshot.', snapshotError?.message || snapshotError);
      }

      const weightScore =
        [crispiness, sauce, meat, overall].every((n) => Number.isFinite(n))
          ? (crispiness * 2) + (sauce * 2) + (meat * 2) + (overall * 4)
          : null;

      const tagId =
        payload?.selectedTagId ??
        payload?.selected_tag_id ??
        payload?.tag_id ??
        payload?.tagId ??
        payload?.tag?.id ??
        null;

      const wouldOrderAgain =
        payload?.wouldOrderAgain == null ? null : Boolean(payload.wouldOrderAgain);

      const wingsEatenRaw =
        payload?.wingsEaten ??
        payload?.wings_eaten ??
        payload?.wings ??
        null;

      const wingsEaten =
        wingsEatenRaw == null || wingsEatenRaw === ''
          ? 0
          : Math.max(0, Math.round(Number(wingsEatenRaw) || 0));

      const sauceStyleRaw =
        payload?.sauceStyle ??
        payload?.sauce_style ??
        null;

      const sauceStyle = [1, 2, 3].includes(Number(sauceStyleRaw))
        ? Number(sauceStyleRaw)
        : null;

      const spiceLevelRaw =
        payload?.spiceLevel ??
        payload?.spice_level ??
        null;

      const spiceLevel = Number.isFinite(Number(spiceLevelRaw))
        ? Math.max(1, Math.min(10, Math.round(Number(spiceLevelRaw))))
        : null;

      const flavorVibeRaw =
        payload?.flavorVibe ??
        payload?.flavor_vibe ??
        [];

      const flavorVibe = Array.isArray(flavorVibeRaw)
        ? [...new Set(
            flavorVibeRaw
              .map((v) => Number(v))
              .filter((v) => Number.isInteger(v) && v >= 1 && v <= 6)
          )].slice(0, 2)
        : [];

      setHomeRateSaving(true);
      try {
      let submittedRatingId = null;
      if (uid) {
          let verifiedCoords = coords;
          let verifiedAccuracy = null;
          try {
            const position = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.High,
              maximumAge: 1000,
              timeout: 5000,
            });
            verifiedCoords = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            };
            verifiedAccuracy = position.coords.accuracy ?? null;
          } catch {
            // The server still verifies the last foreground location. If it is
            // absent or outside the radius, the rating fails closed.
          }
          const operationId = homeRatingOperationRef.current ?? Crypto.randomUUID();
          homeRatingOperationRef.current = operationId;
          const { data, error } = await supabase.rpc('submit_validated_restaurant_rating', {
            p_operation_id: operationId,
            p_destination_id: destId,
            p_latitude: verifiedCoords?.latitude ?? null,
            p_longitude: verifiedCoords?.longitude ?? null,
            p_accuracy_m: verifiedAccuracy,
            p_crispiness: Number.isFinite(crispiness) ? crispiness : null,
            p_sauce: Number.isFinite(sauce) ? sauce : null,
            p_meat: Number.isFinite(meat) ? meat : null,
            p_overall: Number.isFinite(overall) ? overall : null,
            p_wings_eaten: wingsEaten,
            p_tag_id: tagId,
            p_sauce_style: sauceStyle,
            p_flavor_vibe: flavorVibe.length ? flavorVibe : null,
            p_spice_level: spiceLevel,
            p_would_order_again: wouldOrderAgain,
          });
          if (error) throw error;
          crawlId = data?.crawl_id ?? crawlId;
          submittedRatingId = data?.rating_id ?? null;
        } else {
          // Guest ratings remain supported; Wing Shots still require authentication.
          const now = new Date().toISOString();
          const { error: crawlErr } = await supabase.from('crawls').insert({
            crawl_id: crawlId,
            route_id: null,
            is_solo: true,
            user_id: null,
            status: 'completed',
            start_time: now,
            end_time: now,
          });
          if (crawlErr) throw crawlErr;

          const { data: insertedRating, error: ratingErr } = await supabase.from('destination_ratings').insert({
            crawl_id: crawlId,
            destination_id: destId,
            user_id: null,
            crispiness: Number.isFinite(crispiness) ? crispiness : null,
            sauce: Number.isFinite(sauce) ? sauce : null,
            meat: Number.isFinite(meat) ? meat : null,
            overall: Number.isFinite(overall) ? overall : null,
            tag_id: tagId,
            wings_eaten: wingsEaten,
            sauce_style: sauceStyle,
            flavor_vibe: flavorVibe.length ? flavorVibe : null,
            spice_level: spiceLevel,
            would_order_again: wouldOrderAgain,
          }).select('id').single();
          if (ratingErr) throw ratingErr;
          submittedRatingId = insertedRating?.id ?? null;
        }

        // This is a post-commit side effect. It is intentionally contained so
        // an engagement outage can never turn a saved rating into Save failed.
        await recordSavedRatingMission({
          supabase,
          userId: uid,
          submittedRatingId,
          timezone: resolvedDeviceTimezone(),
          refreshMissionSummary,
          onDiagnostic: async (diagnostic) => {
            await trackEvent({
              eventName: 'qualifying_action_failed', screen: 'home', userId: uid,
              destinationId: destId, crawlId, metadata: diagnostic,
            });
          },
        });

        await trackEvent({
          eventName: 'rating_completed',
          screen: 'home',
          userId: uid,
          destinationId: destId,
          crawlId,
          metadata: {
            source: 'closest_restaurant_card',
            tag_id: tagId,
            weight_score: weightScore,
            would_order_again: wouldOrderAgain,
            is_guest: !uid,
          },
        });
        await trackEvent({
          eventName: 'recommendation_adopted',
          screen: 'home',
          userId: uid,
          destinationId: destId,
          crawlId,
          metadata: {
            recommendation_surface: 'home_next_place',
            source: 'closest_restaurant_card',
            weight_score: weightScore,
          },
        });
        await trackEvent({
          eventName: 'rating_submitted',
          screen: 'home',
          userId: uid,
          destinationId: destId,
          crawlId,
          metadata: {
            source: 'closest_restaurant_card',
            tag_id: tagId,
            weight_score: weightScore,
            would_order_again: wouldOrderAgain,
            is_guest: !uid,
          },
        });

        // ---------- NEW: immediately reflect "already rated" on Home ----------
        const displayScore = Number.isFinite(Number(weightScore)) ? Number(weightScore) : null;

        setHomeRated({
          destinationId: destId,
          score: displayScore,
          at: new Date().toISOString(),
        });

        if (!session?.user?.id) {
          await saveGuestHomeRated(destId, displayScore);
        }

        await refreshHomeRatedForClosest();

        setHomeRateOpen(false);

        let community = priorCommunity;
        setRatingComparisonData(Object.freeze({
          destinationId: String(destId), destinationName,
          userScores: Object.freeze({ overall, crispiness, sauce, meat }),
          communityScores: Object.freeze({ overall: null, crispiness: null, sauce: null, meat: null }),
          priorRatingCount: 0, comparisonStatus: 'loading',
        }));
        try {
          if (!community) {
            if (!submittedRatingId) throw new Error('Rating id unavailable for a safe comparison.');
            const { data: refreshed, error: refreshError } = await supabase.from('destination_ratings').select('id, crispiness, sauce, meat, overall').eq('destination_id', destId).neq('id', submittedRatingId || '00000000-0000-0000-0000-000000000000');
            if (refreshError) throw refreshError;
            community = Array.isArray(refreshed) ? refreshed : [];
          }
          const communityScores = averageBeforeSubmission(community, submittedRatingId);
          setRatingComparisonData(Object.freeze({
            destinationId: String(destId), destinationName,
            userScores: Object.freeze({ overall, crispiness, sauce, meat }),
            communityScores: Object.freeze(communityScores), priorRatingCount: community.length, comparisonStatus: 'ready',
          }));
        } catch (comparisonError) {
          console.warn('Community comparison is temporarily unavailable.', comparisonError?.message || comparisonError);
          setRatingComparisonData(Object.freeze({
            destinationId: String(destId), destinationName,
            userScores: Object.freeze({ overall, crispiness, sauce, meat }),
            communityScores: Object.freeze({ overall: null, crispiness: null, sauce: null, meat: null }),
            comparisonError: true,
            comparisonStatus: 'error',
            priorRatingCount: priorCommunity?.length ?? 0,
          }));
        }
        const canOfferWingShot = Boolean(uid && submittedRatingId && wingShotFlags.prompt && (wingShotFlags.photo || wingShotFlags.video));
        homePostRatingAdvancedRef.current = false;
        setHomeWingShotSubmitted(false);
        setHomeWingShotRatingId(canOfferWingShot ? submittedRatingId : null);
        setHomeWingShotDestinationId(canOfferWingShot ? destId : null);
        if (canOfferWingShot) setHomeWingShotVisible(true);
        else setHomeWingShotVisible(false);
        setRatingComparisonVisible(!canOfferWingShot);

        if (session?.user?.id) await refreshHud();

      } catch (e) {
        await trackEvent({
          eventName: 'rating_failed',
          screen: 'home',
          userId: uid,
          destinationId: destId,
          crawlId,
          metadata: { source: 'closest_restaurant_card', error: e?.message || String(e) },
        });
        await trackEvent({
          eventName: 'error_shown',
          screen: 'home',
          userId: uid,
          destinationId: destId,
          crawlId,
          metadata: {
            source: 'closest_restaurant_card',
            error_message: e?.message || String(e),
          },
        });
        console.warn('saveHomeRating failed:', e?.message || e);
        Alert.alert('Error', e?.message ?? 'Could not save your rating.');
      } finally {
        setHomeRateSaving(false);
      }
    },
    [
      homeRateDest?.id,
      session?.user?.id,
      coords?.latitude,
      coords?.longitude,
      wingShotFlags.prompt,
      wingShotFlags.photo,
      wingShotFlags.video,
      refreshHud,
      refreshMissionSummary,
      openRestaurantPeek,
      saveGuestHomeRated,
      refreshHomeRatedForClosest,
    ]
  );

  const runSearch = useCallback(async (q) => {
    const text = (q || '').trim();
    if (!text) {
      setSearchResults([]);
      return;
    }

    setSearchLoading(true);
    try {
      if (lastRestaurantSearchStartedRef.current !== text) {
        lastRestaurantSearchStartedRef.current = text;
        await trackEvent({
          eventName: 'restaurant_search_started',
          screen: 'home',
          userId: session?.user?.id ?? null,
          metadata: {
            source: 'home_swap_spot',
            query_length: text.length,
          },
        });
      }

      const { data, error } = await supabase
        .from('destinations')
        .select('id, name, address, city, lat, lng')
        .or(`name.ilike.%${text}%,city.ilike.%${text}%,address.ilike.%${text}%`)
        .limit(20);

      if (error) throw error;

      await trackEvent({
        eventName: (data || []).length ? 'restaurant_search_results_viewed' : 'restaurant_search_empty',
        screen: 'home',
        userId: session?.user?.id ?? null,
        metadata: {
          source: 'home_swap_spot',
          query_length: text.length,
          result_count: (data || []).length,
        },
      });
      if (!(data || []).length) {
        await trackEvent({
          eventName: 'empty_state_shown',
          screen: 'home',
          userId: session?.user?.id ?? null,
          metadata: {
            state: 'restaurant_search_empty',
            source: 'home_swap_spot',
            query_length: text.length,
          },
        });
      }

      setSearchResults(
        (data || []).map((d) => ({
          id: d.id,
          name: d.name ?? 'Wing Spot',
          address: d.address ?? '',
          city: d.city ?? '',
          lat: d.lat,
          lng: d.lng,
        }))
      );
    } catch (e) {
      await trackEvent({
        eventName: 'restaurant_search_failed',
        screen: 'home',
        userId: session?.user?.id ?? null,
        metadata: { source: 'home_swap_spot', query_length: text.length, error: e?.message || String(e) },
      });
      await trackEvent({
        eventName: 'error_shown',
        screen: 'home',
        userId: session?.user?.id ?? null,
        metadata: {
          source: 'home_swap_spot',
          error_message: e?.message || String(e),
        },
      });
      console.warn('runSearch failed:', e?.message || e);
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    const t = setTimeout(() => runSearch(searchText), 250);
    return () => clearTimeout(t);
  }, [searchText, runSearch]);

  const closeRestaurantSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchText('');
    setSearchResults([]);
  }, []);

  const pickSearchResult = useCallback(
    async (row) => {
      if (!row?.id) return;
  
      const lat = row?.lat != null ? Number(row.lat) : null;
      const lng = row?.lng != null ? Number(row.lng) : null;
  
      // 1) Immediately lock the Home card to the picked restaurant
      const distM =
        coords?.latitude != null && coords?.longitude != null && lat != null && lng != null
          ? haversine(Number(coords.latitude), Number(coords.longitude), lat, lng)
          : null;
  
      manualClosestRef.current = true;
      await trackEvent({
        eventName: 'restaurant_search_result_selected',
        screen: 'home',
        userId: session?.user?.id ?? null,
        destinationId: row.id,
        metadata: {
          source: 'home_swap_spot',
          distance_miles: distM != null ? metersToMiles(distM) : null,
        },
      });
      await trackEvent({
        eventName: 'restaurant_selected',
        screen: 'home',
        userId: session?.user?.id ?? null,
        destinationId: row.id,
        metadata: {
          source_screen: 'home',
          source: 'home_swap_spot',
          distance_from_user: distM,
          distance_miles: distM != null ? metersToMiles(distM) : null,
        },
      });

      setClosest({
        id: row.id,
        name: row.name ?? 'Wing Spot',
        address: row.address ?? null,
        city: row.city ?? null,
        lat,
        lng,
        distanceM: distM,
      });
  
      // 2) Optional: keep override for suggestion logic only
      // If you want suggestions to be based around the picked town spot, keep this.
      // If you do not want that, delete this block.
      setSearchOverride(
        lat != null && lng != null
          ? {
              label: `${row.name}${row.city ? `, ${row.city}` : ''}`,
              latitude: lat,
              longitude: lng,
            }
          : null
      );
  
      closeRestaurantSearch();
    },
    [closeRestaurantSearch, coords?.latitude, coords?.longitude, session?.user?.id]
  );

  const openMissionAction = useCallback(async (mission) => {
    if (!mission) return;
    await trackEvent({ eventName: 'mission_next_action_selected', screen: 'home', userId: session?.user?.id ?? null, metadata: { source: 'weekly_mission_dialog', action_key: mission.key } });
    setMissionDialogOpen(false);
    if (mission.key === 'ratings' || mission.key === 'wingdex') { router.push('/(tabs)/ratings'); return; }
    if (mission.key === 'referrals') { router.push('/referrals'); return; }
    if (mission.key === 'crawl') router.push('/(tabs)/journey');
  }, [router, session?.user?.id]);

  const changeMissionTab = useCallback(async (nextTab) => {
    setMissionTab(nextTab);
    await trackEvent({ eventName: nextTab === 'rewards' ? 'mission_reward_viewed' : 'mission_tab_changed', screen: 'home', userId: session?.user?.id ?? null, metadata: { source: 'weekly_mission_dialog', tab: nextTab } });
  }, [session?.user?.id]);

  const openSocialProfile = useCallback(async (platform) => {
    try {
      await openConfiguredSocialDestination(platform);
    } catch (_error) {
      const label = getSocialCommunityConfig(platform).label;
      Alert.alert('Link unavailable', `We could not open BuffaGo's ${label} page. Please try again shortly.`);
    }
  }, []);

  if (onboardingLoading) {
    return (
      <LocationGate>
        <SafeAreaView
          style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}
        >
          <ActivityIndicator />
          <Text style={{ marginTop: 12, opacity: 0.75 }}>Loading BuffaGo…</Text>
        </SafeAreaView>
      </LocationGate>
    );
  }

  if (shouldShowIntro) {
    return (
      <LocationGate>
        <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator />
        </SafeAreaView>
      </LocationGate>
    );
  }

  return (
    <LocationGate>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: tabBarHeight + 12 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={styles.socialActions}>
              {[
                { platform: 'instagram', icon: 'instagram' },
                { platform: 'facebook', icon: 'facebook' },
              ].map(({ platform, icon }) => {
                const config = getSocialCommunityConfig(platform);
                const enabled = isSocialCommunityConfigured(platform);
                return (
                  <Pressable
                    key={platform}
                    accessibilityRole="link"
                    accessibilityLabel={`Open BuffaGo on ${config.label}`}
                    accessibilityState={{ disabled: !enabled }}
                    disabled={!enabled}
                    onPress={() => openSocialProfile(platform)}
                    style={({ pressed }) => [
                      styles.circleButton,
                      !enabled && styles.socialButtonDisabled,
                      pressed && enabled && styles.circleButtonPressed,
                    ]}
                    testID={`home-social-${platform}`}
                    hitSlop={12}
                  >
                    <MaterialCommunityIcons name={icon} size={11} color={BUFFAGO_ORANGE} />
                  </Pressable>
                );
              })}
            </View>

            <Image
              source={require('../../../assets/images/buffago-logo.png')}
              resizeMode="contain"
              style={styles.logo}
              pointerEvents="none"
            />

            <View style={styles.rightCluster}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open Help"
                onPress={canShowWelcomeWizard ? openWelcomeWizard : undefined}
                disabled={!canShowWelcomeWizard}
                style={[styles.circleButton, !canShowWelcomeWizard && { opacity: 0.3 }]}
                hitSlop={12}
              >
                <MaterialCommunityIcons name="help-circle-outline" size={11} color={BUFFAGO_ORANGE} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={isSignedIn ? 'Open profile' : 'Sign in'}
                onPress={() => router.push(isSignedIn ? '/user' : '/auth/login')}
                style={styles.circleButton}
                hitSlop={12}
              >
                {isSignedIn && session?.user?.user_metadata?.avatar_url ? (
                  <Avatar.Image size={15} source={{ uri: session.user.user_metadata.avatar_url }} />
                ) : (
                  <Avatar.Icon
                    size={15}
                    icon={isSignedIn ? 'account-circle' : 'login'}
                    color={BUFFAGO_ORANGE}
                    style={styles.avatarIcon}
                  />
                )}
              </Pressable>
            </View>
          </View>

          <LegendaryHomeHero
            event={primaryLegendary}
            onOpenMission={() => openRestaurantPeek(primaryLegendary?.restaurantId)}
            onRate={() => {
              trackEvent({
                eventName: 'legendary_cta_clicked',
                screen: 'home',
                userId: session?.user?.id ?? null,
                destinationId: primaryLegendary?.restaurantId ?? null,
                metadata: {
                  event_instance_id: primaryLegendary?.eventInstanceId ?? null,
                  cta_name: 'rate_wings_to_finish',
                },
              });
              router.push('/(tabs)/ratings');
            }}
          />

          {isSignedIn && ENABLE_BUFFAVERSE && ENABLE_BUFFAVERSE_HOME ? (
            <BuffaverseHomeCard
              level={hudStats.level}
              title={shownTitle || hudStats.levelTitle}
              xp={hudStats.xp}
              objective="Rate your next restaurant to keep your journey moving."
              onPress={() => router.push('/(tabs)/journey')}
            />
          ) : null}

          {/* Signed-in: Level row */}
          {isSignedIn ? (
            <View style={styles.levelRow}>
              <View style={styles.levelHeaderRow}>
                <Pressable
                  onPress={titleIsClickable ? openTitlePicker : undefined}
                  disabled={!titleIsClickable}
                  style={({ pressed }) => [
                    styles.titlePressable,
                    pressed && titleIsClickable && { transform: [{ scale: 0.99 }] },
                    !titleIsClickable && { opacity: 0.95 },
                  ]}
                >
                  <Text style={styles.levelLine} numberOfLines={1}>
                    Lvl {hudStats.level ?? '—'}
                    {shownTitle ? ` • ${shownTitle}` : ''}
                  </Text>

                  {titleIsClickable ? <Text style={styles.titleHint}>Tap to see unlocked titles</Text> : null}
                </Pressable>
              </View>

              <View style={{ marginTop: 10, width: '100%' }}>
                <View style={styles.xpRow}>
                  <View style={{ flex: 1 }}>
                    <XpPepperBar progress={hudStats.levelPct ?? 0} label={xpBarLabel} />
                  </View>

                  <DailyGiftPill
                    claimed={!!dailyGift.claimedToday}
                    claiming={!!dailyGift.claiming}
                    onPress={() => claimDaily(session.user.id)}
                  />
                </View>
                <Text style={styles.levelSub}> </Text>
              </View>
            </View>
          ) : null}

          {/* Tiles */}
          {isSignedIn && (
            <View style={styles.hudRow}>
              <Pressable style={styles.hudItem} onPress={() => openStats('ct')}>
                <View style={[styles.wingdexWrap, { backgroundColor: hudBaseBg }]}>
                  <View style={[styles.wingdexFill, { left: 0, width: `${Math.round(statePct * 100)}%`, backgroundColor: hudBarColor }]} />
                  <View style={styles.wingdexContent}>
                    <Text style={styles.hudLabel}>{hudStats.stateAbbrev ? `${hudStats.stateAbbrev} WINGDEX` : 'STATE WINGDEX'}</Text>
                    <Text style={styles.hudValue}>
                      {hudStats.stateX ?? '—'}/{hudStats.stateY ?? '—'}
                    </Text>
                  </View>
                </View>
              </Pressable>

              <View style={styles.hudDivider} />

              <Pressable style={styles.hudItem} onPress={() => openStats('us_top50')}>
                <View style={[styles.wingdexWrap, { backgroundColor: hudBaseBg }]}>
                  <View style={[styles.wingdexFill, { left: 0, width: `${Math.round(top50Pct * 100)}%`, backgroundColor: hudBarColor }]} />
                  <View style={styles.wingdexContent}>
                    <Text style={styles.hudLabel}>TOP 50 US</Text>
                    <Text style={styles.hudValue}>{top50X}/50</Text>
                  </View>
                </View>
              </Pressable>

              <View style={styles.hudDivider} />

              <Pressable style={styles.hudItem} onPress={() => openStats('states')}>
                <View style={[styles.wingdexWrap, { backgroundColor: hudBaseBg }]}>
                  <View style={[styles.wingdexFill, { left: 0, width: `${Math.round(statesPct * 100)}%`, backgroundColor: hudBarColor }]} />
                  <View style={styles.wingdexContent}>
                    <Text style={styles.hudLabel}>STATES</Text>
                    <Text style={styles.hudValue}>
                      {hudStats.statesX ?? '—'}/{hudStats.statesY ?? '—'}
                    </Text>
                  </View>
                </View>
              </Pressable>
            </View>
          )}

          {/* Suggested restaurant card */}
          <View style={styles.closestCard}>
            {closestLoading ? (
              <View style={{ alignItems: 'center', paddingVertical: 12 }}>
                <ActivityIndicator />
                <Text style={{ marginTop: 10, opacity: 0.75, textAlign: 'center' }}>
                  Finding a wing spot near you…
                </Text>
              </View>
            ) : closest ? (
              <>
                <Text style={styles.closestName} numberOfLines={2}>
                  {closest.name || 'Wing Spot'}
                </Text>

                <View style={styles.addressRow}>
                  <Pressable
                    testID="send-to-friend-button"
                    accessibilityRole="button"
                    accessibilityLabel={`Send ${closest.name || 'this restaurant'} to a friend`}
                    accessibilityHint="Opens BuffaGo's Send to Friend flow"
                    onPress={openSendToFriend}
                    hitSlop={4}
                    style={({ pressed }) => [styles.restaurantIconButton, pressed && styles.restaurantIconButtonPressed]}
                  >
                    <Avatar.Icon size={36} icon="account-multiple-outline" />
                  </Pressable>

                  <View style={{ flex: 1 }}>
                    <Text style={styles.closestAddr} numberOfLines={2}>
                      {(closest.address || '').trim()}
                      {closest.city ? `${closest.address ? ', ' : ''}${closest.city}` : ''}
                    </Text>
                  </View>

                  <Pressable
                    testID="directions-button"
                    accessibilityRole="button"
                    accessibilityLabel={`Directions to ${closest.name || 'this restaurant'}`}
                    onPress={openDirections}
                    hitSlop={4}
                    style={({ pressed }) => [styles.restaurantIconButton, pressed && styles.restaurantIconButtonPressed]}
                  >
                    <Avatar.Icon size={36} icon="navigation-variant-outline" />
                  </Pressable>
                </View>

                {closest?.distanceM != null ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 10 }}>
                    <Text style={[styles.distanceText, { marginTop: 0 }]}>
                      You are {(metersToMiles(closest.distanceM) ?? 0).toFixed(1)} miles away
                    </Text>
                  </View>
                ) : null}

                <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                  <Button
                    mode="contained"
                    style={[styles.rateBtn, { flex: 1 }]}
                    contentStyle={{ height: 40 }}
                    uppercase={false}
                    onPress={openHomeRatingWizard}
                    loading={homeRateSaving}
                    disabled={homeRateSaving || alreadyRatedThis}
                  >
                    {alreadyRatedThis
                    ? `Already Rated`.trim()
                    : 'Rate this spot'}
                  </Button>

                  <Button
                    mode="outlined"
                    style={[styles.searchBtn, { flex: 1 }]}
                    contentStyle={{ height: 40 }}
                    uppercase={false}
                    onPress={() => {
                      setSearchOpen(false);
                      setDestinationWizardOpen(true);
                    }}
                    icon="magnify"
                  >
                    Swap Spot
                  </Button>
                </View>

                {alreadyRatedThis ? (
                  <Text style={styles.distanceText}>
                    You rated this spot {fmt2(homeRated?.score)}. Head  back tomorrow to rate again!
                  </Text>
                ) : null}
              </>
            ) : (
              <FeedbackState
                compact
                icon="map-marker-question-outline"
                title="No wing spot nearby yet"
                body="Search a restaurant, pick a town, or add a missing spot so BuffaGo can point you somewhere useful."
                actionLabel="Search"
                onAction={() => {
                  trackEvent({
                    eventName: 'primary_cta_clicked',
                    screen: 'home',
                    userId: session?.user?.id ?? null,
                    metadata: { cta_name: 'search_from_empty_closest', source_screen: 'home' },
                  });
                  setSearchOpen(true);
                }}
                secondaryLabel="Pick Area"
                onSecondary={() => setDestinationWizardOpen(true)}
              />
            )}
          </View>

          {ENABLE_GROWTH_MISSIONS ? (
            <Pressable
              testID="weekly-mission-entry"
              accessibilityRole="button"
              accessibilityLabel={missionLoading ? 'Weekly mission loading' : missionSummary ? `Weekly mission, ${missionSummary.mission.label}, ${missionSummary.mission.current} of ${missionSummary.mission.target} complete` : 'View weekly missions'}
              style={styles.missionEntry}
              onPress={async () => {
                setMissionDialogOpen(true);
                await refreshMissionSummary();
                await trackEvent({ eventName: 'mission_entry_viewed', screen: 'home', userId: session?.user?.id ?? null, metadata: { source: 'home_compact_entry', mission_state: missionError ? 'error' : missionLoading ? 'loading' : missionSummary ? 'active' : 'empty' } });
              }}
            >
              <Text style={styles.missionEntryIcon}>🏆</Text>
              <View style={styles.missionEntryCopy}><Text style={styles.missionEntryTitle}>Weekly Mission</Text><Text style={styles.missionEntryMission}>{missionLoading ? 'Loading mission…' : missionSummary?.mission?.label || 'Mission details are temporarily unavailable.'}</Text>{missionSummary ? <Text style={styles.missionEntryDetail}>{missionSummary.mission.current} of {missionSummary.mission.target} complete</Text> : null}</View>
              <Text style={styles.missionEntryChevron}>›</Text>
            </Pressable>
          ) : null}

          <Pressable testID="quick-action-wing-facts" accessibilityRole="button" accessibilityLabel="Wing Facts, open a wing fact" onPress={openWingFacts} style={({ pressed }) => [styles.wingFactsAction, pressed && { opacity: 0.82 }]}><Text style={styles.wingFactsIcon}>🍗</Text><Text style={styles.wingFactsLabel}>Wing Facts</Text></Pressable>
        </ScrollView>

        {/* Home Rating Wizard */}
      <RatingWizardDialog
          visible={homeRateOpen}
          open={homeRateOpen}
          destinationName={homeRateDest?.name || ''}
          title={homeRateDest?.name || ''}
          tagOptions={homeTagOptions}
          options={homeTagOptions}
          onClose={() => {
            if (homeRateSaving) return;
            setHomeRateOpen(false);
            setHomeRateDest(null);
          }}
          onDismiss={() => {
            if (homeRateSaving) return;
            setHomeRateOpen(false);
            setHomeRateDest(null);
          }}
          onFinalize={saveHomeRating}
          onSubmit={saveHomeRating}
          loading={homeRateSaving}
          saving={homeRateSaving}
      />

        <RatingComparisonModal
          visible={ratingComparisonVisible}
          data={ratingComparisonData}
          onDone={() => {
            setRatingComparisonVisible(false);
            setHomeRateDest(null);
          }}
          onViewRestaurant={async () => {
            setRatingComparisonVisible(false);
            setHomeRateDest(null);
            if (ratingComparisonData?.destinationId) await openRestaurantPeek(ratingComparisonData.destinationId);
          }}
        />

        {homeWingShotRatingId ? (
          <WingShotFlow
            visible={homeWingShotVisible}
            eligibleRatingId={homeWingShotRatingId}
            destinationId={homeWingShotDestinationId}
            submissionSource="rating"
            allowPhoto={wingShotFlags.photo}
            allowVideo={wingShotFlags.video}
            analyticsContext={{
              screen: 'home',
              userId: session?.user?.id ?? null,
              destinationId: homeWingShotDestinationId,
              crawlId: null,
            }}
            onSubmitted={async () => {
              setHomeWingShotSubmitted(true);
            }}
            onClose={async () => {
              if (homePostRatingAdvancedRef.current) return;
              homePostRatingAdvancedRef.current = true;
              setHomeWingShotVisible(false);
              setHomeWingShotRatingId(null);
              setHomeWingShotDestinationId(null);
              if (!homeWingShotSubmitted) {
                await trackEvent({
                  eventName: 'wing_shot_prompt_skipped',
                  screen: 'home',
                  userId: session?.user?.id ?? null,
                  destinationId: homeWingShotDestinationId,
                  metadata: { rating_remains_saved: true },
                });
              }
              setRatingComparisonVisible(true);
            }}
          />
        ) : null}

        {/* Search dialog */}
        <Portal>
          <Dialog
            visible={searchOpen}
            onDismiss={closeRestaurantSearch}
            style={{ borderRadius: 18, alignSelf: 'center', width: '92%', maxWidth: 520 }}
          >
            <Dialog.Title style={{ textAlign: 'center', fontWeight: '900' }}>
              Search restaurants
            </Dialog.Title>

            <Dialog.Content>
              <TextInput
                value={searchText}
                onChangeText={setSearchText}
                mode="outlined"
                placeholder="Search by name, city, or address"
                style={{ marginBottom: 10 }}
              />

              <View style={styles.listWrap}>
                {searchLoading ? (
                  <View style={{ paddingVertical: 18, alignItems: 'center' }}>
                    <ActivityIndicator />
                  </View>
                ) : (
                  <ScrollView style={{ maxHeight: 360 }}>
                    {(searchResults || []).map((d) => {
                      const title = (d.name || '').trim() || 'Wing Spot';
                      const sub = `${(d.city || '').trim()}${d.address ? `${d.city ? ' · ' : ''}${d.address}` : ''}`.trim();

                      return (
                        <Pressable
                          key={`home-s-${d.id}`}
                          onPress={() => pickSearchResult(d)}
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

                    {!searchText.trim() ? (
                      <Text style={{ textAlign: 'center', opacity: 0.75, paddingVertical: 14 }}>
                        Start typing to search.
                      </Text>
                    ) : null}

                    {!searchResults?.length && !!searchText.trim() ? (
                      <View style={{ paddingVertical: 14, alignItems: 'center', gap: 10 }}>
                        <Text style={{ textAlign: 'center', opacity: 0.75 }}>
                          No matches in BuffaGo yet.
                        </Text>

                      </View>
                    ) : null}

                    {!!searchText.trim() ? (
                      <View style={{ paddingVertical: 12, alignItems: 'center', gap: 8 }}>
                        {isSignedIn ? (
                          <Button
                            mode="contained"
                            onPress={() => setWingmanOpen(true)}
                            icon="robot-outline"
                          >
                            Add with Wingman
                          </Button>
                        ) : (
                          <Text style={{ textAlign: 'center', opacity: 0.75 }}>
                            Sign in to add a restaurant with Wingman.
                          </Text>
                        )}
                      </View>
                    ) : null}
                  </ScrollView>
                )}
              </View>

              <Text style={{ marginTop: 10, opacity: 0.7, textAlign: 'center' }}>
                Tip: pick a restaurant to lock suggestions onto it.
              </Text>
            </Dialog.Content>

            <Dialog.Actions style={{ justifyContent: 'center' }}>
              <Button
                onPress={closeRestaurantSearch}
              >
                Close
              </Button>
            </Dialog.Actions>
          </Dialog>
        </Portal>

        {/* Title Picker dialog */}
        <Portal>
          <Dialog
            visible={titlePickerOpen}
            onDismiss={() => setTitlePickerOpen(false)}
            style={{ alignSelf: 'center', width: '92%', maxWidth: 520, borderRadius: 18 }}
          >
            <Dialog.Title style={{ textAlign: 'center', fontWeight: '900', letterSpacing: 1 }}>
              Choose Your Title
            </Dialog.Title>

            <Dialog.Content>
              {!unlockedTitles?.length ? (
                <View style={{ paddingVertical: 12, alignItems: 'center' }}>
                  <Text style={{ opacity: 0.8, textAlign: 'center' }}>
                    No titles unlocked yet.
                  </Text>
                </View>
              ) : (
                <ScrollView style={{ maxHeight: 520 }}>
                  <Pressable
                    onPress={() => selectTitleOverride(null)}
                    style={({ pressed }) => [
                      styles.statRow,
                      { borderRadius: 12, paddingHorizontal: 6 },
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                      <Text style={[styles.rankPrefix, { width: 30 }]}>{!titleOverride?.title ? '✅' : ' '}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.statText, { fontWeight: !titleOverride?.title ? '900' : '700' }]}>
                          Default title
                        </Text>
                        <Text style={{ fontSize: 11, opacity: 0.65, marginTop: 2 }}>
                          Uses your current level title
                        </Text>
                      </View>
                    </View>
                  </Pressable>

                  <View style={{ height: 6 }} />

                  {unlockedTitles.map((t) => {
                    const isSelected = titleOverride?.title && titleOverride.title === t.title;

                    return (
                      <Pressable
                        key={`ttl-${t.level}-${t.title}`}
                        onPress={() => selectTitleOverride(t)}
                        style={({ pressed }) => [
                          styles.statRow,
                          { borderRadius: 12, paddingHorizontal: 6 },
                          pressed && { opacity: 0.85 },
                        ]}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                          <Text style={[styles.rankPrefix, { width: 30 }]}>
                            {isSelected ? '✅' : ' '}
                          </Text>

                          <View style={{ flex: 1 }}>
                            <Text style={[styles.statText, { fontWeight: isSelected ? '900' : '700' }]}>
                              {t.title}
                            </Text>
                            <Text style={{ fontSize: 11, opacity: 0.65, marginTop: 2 }}>
                              Unlocked at level {t.level}
                            </Text>
                          </View>
                        </View>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )}
            </Dialog.Content>

            <Dialog.Actions>
              <Button onPress={() => setTitlePickerOpen(false)}>Close</Button>
            </Dialog.Actions>
          </Dialog>
        </Portal>

        {/* Stats dialog */}
        <Portal>
          <Dialog visible={statsOpen} onDismiss={() => setStatsOpen(false)} style={styles.statsDialog}>
            <Dialog.Title style={styles.statsTitle}>{statsTitle || 'STATS'}</Dialog.Title>

            <Dialog.Content style={styles.statsContent}>
              {statsLoading ? (
                <View style={{ paddingVertical: 18, alignItems: 'center' }}>
                  <ActivityIndicator />
                </View>
              ) : (
                <ScrollView style={{ maxHeight: 520 }}>
                  {(statsItems || []).map((it, idx) => (
                    <StatLine
                      key={`${idx}-${it.label}`}
                      label={it.label}
                      done={!!it.done}
                      rightText={it.rightText}
                      onPress={it.onPress}
                      prefix={it.prefix}
                    />
                  ))}
                  {!statsItems?.length && <StatLine label="Nothing here yet." done={false} />}
                </ScrollView>
              )}
            </Dialog.Content>

            <Dialog.Actions>
              <Button onPress={() => setStatsOpen(false)}>Close</Button>
            </Dialog.Actions>
          </Dialog>
        </Portal>

        {/* Restaurant Peek dialog */}
        <Portal>
          <Dialog visible={peekOpen} onDismiss={() => setPeekOpen(false)} style={{ borderRadius: 18, alignSelf: 'center', width: '92%', maxWidth: 520 }}>
            <Dialog.Title style={{ textAlign: 'center', fontWeight: '900' }}>{peek?.name || 'Restaurant'}</Dialog.Title>

            <Dialog.Content>
              {peekLoading ? (
                <View style={{ paddingVertical: 18, alignItems: 'center' }}>
                  <ActivityIndicator />
                </View>
              ) : (
                <>
                  {!!peek?.addressLine && <Text style={{ textAlign: 'center', opacity: 0.8, marginBottom: 12 }}>{peek.addressLine}</Text>}

                  <View style={{ gap: 8 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ opacity: 0.75 }}>Avg Overall</Text>
                      <Text style={{ fontWeight: '900' }}>{fmt2(peek?.avg?.overall)}</Text>
                    </View>

                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ opacity: 0.75 }}>Crispiness</Text>
                      <Text style={{ fontWeight: '900' }}>{fmt2(peek?.avg?.crispiness)}</Text>
                    </View>

                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ opacity: 0.75 }}>Sauce</Text>
                      <Text style={{ fontWeight: '900' }}>{fmt2(peek?.avg?.sauce)}</Text>
                    </View>

                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ opacity: 0.75 }}>Meat</Text>
                      <Text style={{ fontWeight: '900' }}>{fmt2(peek?.avg?.meat)}</Text>
                    </View>

                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ opacity: 0.75 }}>BuffaGo Score</Text>
                      <Text style={{ fontWeight: '900' }}>{fmt2(peek?.avg?.weight)}</Text>
                    </View>

                    <View style={{ height: 10 }} />

                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ opacity: 0.75 }}>Ratings</Text>
                      <Text style={{ fontWeight: '900' }}>{peek?.ratingsCount ?? 0}</Text>
                    </View>

                    {peek?.topTags?.length ? (
                      <>
                        <View style={{ height: 10 }} />
                        <Text style={{ opacity: 0.8, fontWeight: '800', marginBottom: 6 }}>Top Tags</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                          {peek.topTags.map((t, i) => (
                            <View
                              key={`pt-${i}`}
                              style={{
                                paddingVertical: 6,
                                paddingHorizontal: 10,
                                borderRadius: 999,
                                borderWidth: 1,
                                borderColor: 'rgba(255,255,255,0.18)',
                                backgroundColor: 'rgba(255,255,255,0.04)',
                              }}
                            >
                              <Text style={{ fontWeight: '800', opacity: 0.9 }}>
                                {t.label} · {t.count}
                              </Text>
                            </View>
                          ))}
                        </View>
                      </>
                    ) : null}
                  </View>
                </>
              )}
            </Dialog.Content>

            <Dialog.Actions>
              <Button onPress={() => setPeekOpen(false)}>Close</Button>
            </Dialog.Actions>
          </Dialog>
        </Portal>

        {canShowWelcomeWizard && (
          <WelcomeWizard
            visible={welcomeOpen}
            onDone={() => setWelcomeOpen(false)}
          />
        )}

        {/* Wing Battle dialog */}
        <Portal>
          <Dialog
            visible={battleDialogOpen}
            onDismiss={() => setBattleDialogOpen(false)}
            style={{ alignSelf: 'center', width: '92%', maxWidth: 520, borderRadius: 18 }}
          >
            <Dialog.Title style={{ textAlign: 'center', fontWeight: '900', letterSpacing: 1 }}>
              Wing Battle
            </Dialog.Title>

            <Dialog.Content>
              {battleLoading ? (
                <View style={{ paddingVertical: 18, alignItems: 'center' }}>
                  <ActivityIndicator />
                </View>
              ) : !battleOptions?.length ? (
                <Text style={{ textAlign: 'center', opacity: 0.75 }}>
                  No active battles right now.
                </Text>
              ) : (
                <ScrollView style={{ maxHeight: 520 }}>
                  {battleOptions.map((q, idx) => {
                    const picked = Number(draftBattle?.[q.id] ?? 0);
                    const prompt = (q.label || `Battle #${idx + 1}`).trim();

                    return (
                      <View key={`wb-${q.id}`} style={{ paddingVertical: 12 }}>
                        <Text style={{ fontWeight: '900', marginBottom: 10 }}>
                          {prompt}
                        </Text>

                        <View style={{ flexDirection: 'row', gap: 10 }}>
                          <Pressable
                            onPress={() => setDraftBattle((m) => ({ ...m, [q.id]: 1 }))}
                            style={({ pressed }) => {
                              const isPicked = picked === 1;

                              return [
                                {
                                  flex: 1,
                                  paddingVertical: 12,
                                  borderRadius: 14,
                                  borderWidth: 1,
                                  borderColor: isPicked ? 'rgba(46, 125, 50, 0.95)' : 'rgba(255,255,255,0.18)',
                                  backgroundColor: isPicked ? 'rgba(46,125,50,0.35)' : 'rgba(255,255,255,0.04)',
                                  opacity: pressed ? 0.9 : 1,
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                },
                              ];
                            }}
                          >
                            <Text style={{ fontWeight: '900', color: 'rgba(255,255,255,0.92)' }}>
                              {q.left_option || 'Left'}
                            </Text>
                          </Pressable>

                          <Pressable
                            onPress={() => setDraftBattle((m) => ({ ...m, [q.id]: 2 }))}
                            style={({ pressed }) => {
                              const isPicked = picked === 2;

                              return [
                                {
                                  flex: 1,
                                  paddingVertical: 12,
                                  borderRadius: 14,
                                  borderWidth: 1,
                                  borderColor: isPicked ? BUFFAGO_ORANGE : 'rgba(255,255,255,0.18)',
                                  backgroundColor: isPicked ? 'rgba(255,122,24,0.35)' : 'rgba(255,255,255,0.04)',
                                  opacity: pressed ? 0.9 : 1,
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                },
                              ];
                            }}
                          >
                            <Text style={{ fontWeight: '900', color: 'rgba(255,255,255,0.92)' }}>
                              {q.right_option || 'Right'}
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                    );
                  })}
                </ScrollView>
              )}
            </Dialog.Content>

            <Dialog.Actions style={{ justifyContent: 'space-between' }}>
              <Button onPress={() => setBattleDialogOpen(false)} disabled={battleSaving}>
                Close
              </Button>
              <Button onPress={saveBattle} loading={battleSaving} disabled={battleSaving || battleLoading}>
                Save
              </Button>
            </Dialog.Actions>
          </Dialog>
        </Portal>

        {/* Wing Fact dialog */}
        <Portal>
          <Dialog visible={wingFactOpen} onDismiss={() => setWingFactOpen(false)} style={styles.factDialog}>
            <Dialog.Title style={styles.factTitle}>Wing Fact</Dialog.Title>

            <Dialog.Content>
              {wingFactLoading ? (
                <View style={{ paddingVertical: 18, alignItems: 'center' }}>
                  <ActivityIndicator />
                </View>
              ) : (
                <Text style={styles.factBody}>{wingFactText || 'No facts yet — add some to fun_facts 🔥'}</Text>
              )}
            </Dialog.Content>

            <Dialog.Actions style={{ justifyContent: 'space-between' }}>
              <Button onPress={() => setWingFactOpen(false)}>Close</Button>
              <Button onPress={loadNextWingFact} disabled={wingFactLoading}>
                Next
              </Button>
            </Dialog.Actions>
          </Dialog>
        </Portal>

        {/* BuffaGo social handoff for the currently recommended restaurant. */}
        <Portal>
          <Dialog visible={sendToFriendOpen} onDismiss={() => setSendToFriendOpen(false)} style={styles.sendToFriendDialog}>
            <Dialog.Title style={styles.sendToFriendTitle}>Send to Friend</Dialog.Title>
            <Dialog.Content>
              <Text style={styles.sendToFriendBody}>
                Send <Text style={styles.sendToFriendRestaurantName}>{closest?.name || 'this restaurant'}</Text> to one of your Wing Friends.
              </Text>
              {(closest?.address || closest?.city) ? (
                <Text style={styles.sendToFriendAddress}>
                  {(closest?.address || '').trim()}{closest?.city ? `${closest?.address ? ', ' : ''}${closest.city}` : ''}
                </Text>
              ) : null}
            </Dialog.Content>
            <Dialog.Actions style={{ justifyContent: 'space-between' }}>
              <Button onPress={() => setSendToFriendOpen(false)}>Cancel</Button>
              <Button
                mode="contained"
                onPress={() => {
                  setSendToFriendOpen(false);
                  router.push({
                    pathname: '/(tabs)/leaderboards',
                    params: {
                      sendDestinationId: closest?.id || '',
                      sendRestaurantName: closest?.name || '',
                      sendRestaurantAddress: closest?.address || '',
                      sendRestaurantCity: closest?.city || '',
                    },
                  });
                }}
              >
                Choose Friend
              </Button>
            </Dialog.Actions>
          </Dialog>
        </Portal>

        {/* Destination Picker Wizard */}
        <DestinationPickerWizard
          visible={destinationWizardOpen}
          onDismiss={() => setDestinationWizardOpen(false)}
          onOpenSearch={() => {
            setDestinationWizardOpen(false);
            setSearchOpen(true);
          }}
            basisCoords={
              coords?.latitude != null && coords?.longitude != null
                ? { latitude: Number(coords.latitude), longitude: Number(coords.longitude) }
                : null
            }
            onApplyDestination={(d) => {
              manualClosestRef.current = true;
            
              setClosest({
                id: d.id,
                name: d.name,
                address: d.address ?? null,
                city: d.city ?? null,
                lat: d.lat ?? null,
                lng: d.lng ?? null,
                distanceM: d.distanceM ?? null,
              });
            
              setDestinationWizardOpen(false);
          }}
        />

        <WingmanAddDialog
          visible={wingmanOpen}
          onDismiss={() => {
            setWingmanOpen(false);
            closeRestaurantSearch();
          }}
          initialRestaurant={searchText}
          initialStateId={wingmanStateCtx?.stateId ?? null}
          initialStateCode={wingmanStateCtx?.stateCode ?? null}
          userId={session?.user?.id ?? null}
          onPickDestination={pickSearchResult}
        />

        <WeeklyMissionDialog
          visible={missionDialogOpen}
          onDismiss={() => { missionRequestRef.current += 1; setMissionDialogOpen(false); setMissionError(false); setMissionLoading(false); }}
          summary={missionSummary}
          loading={missionLoading}
          error={missionError}
          onRetry={refreshMissionSummary}
          onAction={openMissionAction}
          tab={missionTab}
          onTabChange={changeMissionTab}
        />

        <CoinRewardModal
          visible={coinRewardOpen}
          coins={COIN_REWARD_AMOUNT}
          onClose={() => {
            setCoinRewardOpen(false);
            DeviceEventEmitter.emit('buffago:coins_refresh', Date.now());
          }}
        />
      </SafeAreaView>
    </LocationGate>
  );
}

const styles = StyleSheet.create({
  // The tab bar height comes from navigation, so the final card can scroll fully
  // above every Android/iOS tab bar and its safe-area inset.
  scroll: { paddingHorizontal: 12, paddingTop: 10, gap: 6 },

  headerRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  socialActions: { width: 72, flexDirection: 'row', alignItems: 'center', gap: 8 },
  circleButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 122, 24, 0.72)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.16,
    shadowRadius: 4,
    elevation: 2,
  },
  circleButtonPressed: { backgroundColor: 'rgba(255, 122, 24, 0.16)' },
  socialButtonDisabled: { opacity: 0.35 },
  rightCluster: { width: 56, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8 },
  logo: {
    position: 'absolute',
    left: '50%',
    width: 225,
    height: 62.5,
    marginLeft: -112.5,
    alignSelf: 'center',
  },
  avatarIcon: { backgroundColor: 'transparent' },

  levelRow: {
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignItems: 'flex-start',
  },
  levelHeaderRow: { width: '100%', flexDirection: 'row', alignItems: 'baseline', flexWrap: 'nowrap', gap: 10 },
  levelLine: { fontSize: 20, fontWeight: '900', letterSpacing: 0.4, color: 'rgba(255,255,255,0.95)' },
  titlePressable: { width: '100%' },
  titleHint: { marginTop: 2, fontSize: 11, opacity: 0.6 },

  levelSub: { marginTop: 5, fontSize: 11, opacity: 0.6, textAlign: 'center' },

  xpOuter: { width: '100%', marginTop: 2 },
  xpVisual: { width: '100%', height: 16, justifyContent: 'center' },
  xpBase: {
    width: '100%',
    height: 16,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
  },
  xpFill: { height: '100%', backgroundColor: '#2E7D32' },
  xpTextOverlay: { position: 'absolute', left: 10, right: 10, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  xpText: {
    fontSize: 11,
    letterSpacing: 0.5,
    fontWeight: '900',
    color: 'rgba(255,255,255,0.9)',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },

  hudRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    paddingVertical: 7,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    gap: 8,
  },
  hudItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hudLabel: { fontSize: 11, opacity: 0.8, letterSpacing: 1 },
  hudValue: { fontSize: 18, fontWeight: '900', marginTop: 2 },
  hudDivider: { width: 1, opacity: 0.25, backgroundColor: '#fff' },

  wingdexWrap: { width: '100%', borderRadius: 12, overflow: 'hidden', paddingVertical: 5, paddingHorizontal: 6, position: 'relative' },
  wingdexFill: { position: 'absolute', top: 0, bottom: 0, opacity: 0.35 },
  wingdexContent: { alignItems: 'center' },

  wingFactsAction: { minHeight: 52, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,122,24,0.30)', backgroundColor: 'rgba(255,255,255,0.035)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  wingFactsIcon: { fontSize: 17, lineHeight: 22 },
  wingFactsLabel: { fontSize: 14, lineHeight: 18, fontWeight: '900', color: 'rgba(255,255,255,0.96)' },

  xpRow: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 10 },
  dailyPill: {
    height: 28,
    minWidth: 92,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(46, 125, 50, 0.35)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  dailyPillEmoji: { fontSize: 14 },
  dailyPillText: { fontSize: 12, fontWeight: '900', color: 'rgba(255,255,255,0.92)' },

  closestCard: {
    width: '100%',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  missionEntry: { minHeight: 64, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,122,24,0.35)', backgroundColor: 'rgba(255,122,24,0.10)', paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  missionEntryIcon: { fontSize: 20 },
  missionEntryCopy: { flex: 1 },
  missionEntryTitle: { fontSize: 16, fontWeight: '900', color: 'rgba(255,255,255,0.96)' },
  missionEntryMission: { marginTop: 1, fontSize: 14, lineHeight: 18, fontWeight: '800', color: 'rgba(255,255,255,0.92)' },
  missionEntryDetail: { marginTop: 2, fontSize: 13, opacity: 0.76 },
  missionEntryChevron: { color: '#FFB36F', fontSize: 30, lineHeight: 30 },
  closestName: { fontSize: 18, fontWeight: '900', textAlign: 'center', color: 'rgba(255,255,255,0.95)' },
  addressRow: { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  closestAddr: { opacity: 0.8, textAlign: 'center' },
  restaurantIconButton: { width: 40, height: 40, borderRadius: 20, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  restaurantIconButtonPressed: { transform: [{ scale: 0.96 }], opacity: 0.9 },
  distanceText: { marginTop: 10, opacity: 0.75, fontSize: 12, textAlign: 'center', fontWeight: '800' },
  rateBtn: { borderRadius: 14 },
  searchBtn: { borderRadius: 14 },

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

  statsDialog: { alignSelf: 'center', width: '92%', maxWidth: 520, borderRadius: 18 },
  statsTitle: { textAlign: 'center', letterSpacing: 1, fontWeight: '900' },
  statsContent: { paddingTop: 6 },

  statRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  statText: { fontSize: 16, opacity: 0.92, fontWeight: '600' },
  statTextDone: { opacity: 0.65 },
  redStrike: { position: 'absolute', left: -2, right: 12, height: 3, borderRadius: 3, backgroundColor: 'rgba(210,0,0,0.85)' },
  rankPrefix: {
    width: 30,
    paddingTop: 2,
    fontSize: 14,
    fontWeight: '900',
    opacity: 0.9,
  },

  factDialog: { alignSelf: 'center', width: '92%', maxWidth: 520, borderRadius: 18 },
  factTitle: { textAlign: 'center', letterSpacing: 1, fontWeight: '900' },
  factBody: { textAlign: 'center', lineHeight: 20, opacity: 0.9 },
  sendToFriendDialog: { alignSelf: 'center', width: '92%', maxWidth: 520, borderRadius: 18 },
  sendToFriendTitle: { textAlign: 'center', fontWeight: '900' },
  sendToFriendBody: { textAlign: 'center', lineHeight: 22 },
  sendToFriendRestaurantName: { fontWeight: '900' },
  sendToFriendAddress: { marginTop: 8, textAlign: 'center', opacity: 0.72 },
});
