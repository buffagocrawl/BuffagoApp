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
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Text,
  Button,
  Card,
  useTheme,
  Dialog,
  Portal,
  ProgressBar,
  Avatar,
} from 'react-native-paper';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase.js';
import { isOAuthFlowInProgress } from '../../lib/facebookOAuth';
import { hasCompletedOnboarding } from '../../hooks/useOnboardingGate';
import WelcomeWizard from '../../components/WelcomeWizard';
import LocationGate from '../../components/LocationGate';
import { useLocationCtx } from '../../providers/LocationProvider';
import { openDirections } from '../../utils/directions';
import { createSoloCrawl } from '../../utils/crawls';
import { fetchRandomFunFact } from '../../utils/funFacts';
import { nyDateString, isYesterdayNY } from '../../utils/nyDate';

const SEARCH_RADIUS_M = 160934; // 100 miles
const MS_5_MIN = 5 * 60 * 1000;

const clamp01 = (n) => Math.max(0, Math.min(1, Number(n) || 0));

// ✅ Correct Haversine (meters)
const haversine = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// --- WingBattle reason helper (NY month scoped) ---
// ex: Jan 2026 => "WingBattle2601"
function yymmNY(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: '2-digit',
    month: '2-digit',
  }).formatToParts(d);

  const yy = parts.find((p) => p.type === 'year')?.value ?? '00';
  const mm = parts.find((p) => p.type === 'month')?.value ?? '00';
  return `${yy}${mm}`;
}

function wingBattleReasonNY(d = new Date()) {
  return `WingBattle${yymmNY(d)}`;
}


/**
 * Find user's current state via Destinations.state_id (NOT parsing strings)
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
      const distM = haversine(lat0, lng0, Number(d.lat), Number(d.lng));
      if (!best || distM < best.distM) best = { state_id: d.state_id, distM };
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
 * ✅ Hydrate (title + stop1 destination) for a saved selection
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
      .select(
        `id, title,
         stop1:stop1_id ( id, name, address, city, lat, lng )`
      )
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

// More handwriting-like defaults (best-effort, safe)
const HAND_FONT = Platform.select({
  ios: 'Bradley Hand',
  android: 'cursive',
  default: undefined,
});

/**
 * Small “XP-style” bar: black base + colored reveal + XP text.
 * (No arrow — per request)
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

/**
 * “Stepping stones” progress for active crawl — distinct from XP bar.
 */
function SteppingStones({ visited = 0, total = 0 }) {
  const t = Math.max(0, Number(total) || 0);
  const v = Math.max(0, Math.min(t, Number(visited) || 0));
  if (!t) return null;

  const stones = Array.from({ length: t }).map((_, i) => i);
  return (
    <View style={styles.stonesRow}>
      {stones.map((i) => {
        const done = i < v;
        const wobble = (i % 3) - 1; // -1,0,1
        return (
          <View
            key={`stone-${i}`}
            style={[
              styles.stone,
              done ? styles.stoneDone : styles.stoneTodo,
              { transform: [{ rotate: `${wobble * 3}deg` }] },
            ]}
          />
        );
      })}
    </View>
  );
}

/**
 * Stat list line: RED X before + hand-drawn-ish strike overlay (Android-safe).
 */
function StatLine({ label, done }) {
  return (
    <View style={styles.statRow}>
      {done ? <Text style={styles.redX}>X</Text> : <View style={{ width: 18 }} />}

      <View style={{ flex: 1, position: 'relative' }}>
        <Text style={[styles.statText, done && styles.statTextDone]} numberOfLines={2}>
          {label}
        </Text>

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
  );
}

/**
 * Fun little “Wing Facts” pill.
 */
function WingFactsButton({ onPress }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.wingFactsPress, pressed && { transform: [{ scale: 0.98 }] }]}
    >
      <View style={styles.wingPillOuter}>
        <View style={styles.wingPillInner}>
          <Text style={styles.wingFactsEmoji}>🍗</Text>
          <Text style={styles.wingFactsText}>Wing Facts</Text>
          <Text style={styles.wingFactsSpark}>✨</Text>
        </View>
      </View>
    </Pressable>
  );
}

export default function Home() {
  const theme = useTheme();
  const { colors, dark } = theme;

  const router = useRouter();
  const { coords, status, refreshPosition } = useLocationCtx();

  // ✅ MUST be inside component (hooks cannot run at module scope)
  const lastSavedStateKeyRef = useRef('');

  const [loading, setLoading] = useState(true);
  const [nearest, setNearest] = useState(null);
  const [selectedRoute, setSelectedRoute] = useState(null);

  const [session, setSession] = useState(null);
  const isSignedIn = !!session?.user?.id;

  const [showGuestDialog, setShowGuestDialog] = useState(false);
  const [starting, setStarting] = useState(false);

  const [activeCrawl, setActiveCrawl] = useState(null);
  const [preloadedFact, setPreloadedFact] = useState('');

  // Stats dialog (tile taps)
  const [statsOpen, setStatsOpen] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsTitle, setStatsTitle] = useState('');
  const [statsItems, setStatsItems] = useState([]); // { label, done }

  // Wing Fact dialog
  const [wingFactOpen, setWingFactOpen] = useState(false);
  const [wingFactLoading, setWingFactLoading] = useState(false);
  const [wingFactText, setWingFactText] = useState('');

  // HUD stats (signed-in only)
  const [hudStats, setHudStats] = useState({
    loading: false,

    // Level + XP bar
    level: null,
    levelTitle: null, // pulled from level_thresholds.level_title (canonical)
    xp: null,
    xpMin: null,
    xpMax: null,
    levelPct: 0,

    // Current state wingdex
    stateAbbrev: null,
    stateId: null,
    stateName: null,
    stateX: null,
    stateY: null,
    stateRatedDestinationIds: [],

    // US wingdex
    usX: null,
    usY: null,

    // States (distinct states rated)
    statesX: null,
    statesY: null,
    eatenStateIds: [],
  });

  // Daily Gift / Daily XP (shown on Home)
  const [dailyGift, setDailyGift] = useState({
    claimedToday: false, // start false so it can show once status loads
    streak: 0,
    nextResetAt: null,
    lastClaimed: null,
    loading: true,
    claiming: false,
  });

    // Help wizard, manual only
  const [wizardOpen, setWizardOpen] = useState(false);

  // Onboarding redirect gate
  const gateRanRef = useRef(false);
  const [gateChecked, setGateChecked] = useState(false);

  useEffect(() => {
    if (gateRanRef.current) return;
    gateRanRef.current = true;

    (async () => {
      try {
        const [oauthFlowActive, onboardingDone] = await Promise.all([
          isOAuthFlowInProgress({ mode: 'link_identity' }),
          hasCompletedOnboarding(),
        ]);

        if (oauthFlowActive) {
          setGateChecked(true);
          return;
        }

        if (!onboardingDone) {
          router.replace('/onboarding');
          return;
        }
      } catch (error) {
        console.warn('home gate check failed', error?.message || error);
        router.replace('/onboarding');
        return;
      }

      setGateChecked(true);
    })();
  }, [router]);

  // Fun-fact rotator (loader only)
  const FUN_FACTS = useRef([
    'The world wing-eating record is over 500 — Molly Schuyler ate 501 wings in 30 minutes.',
    'There are over 1,500 wing-focused restaurants in the U.S.',
    'The average chicken only has two usable wings for “wing night.”',
    'The Scoville scale measures a wing sauce’s heat by capsaicin level.',
    'Some chefs smoke wings over applewood for sweetness.',
    '“Wingette” refers to the flat section of the wing.',
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

  /**
   * ✅ Compute the Home hero from:
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
          distanceM = haversine(
            coords.latitude,
            coords.longitude,
            Number(startDest.lat),
            Number(startDest.lng)
          );
        }

        setNearest({
          routeId: selected.id ?? null,
          routeTitle: selected.title ?? 'Selected Crawl',
          destName: startDest?.name || '',
          destAddress: startDest?.address
            ? `${startDest.address}${startDest.city ? `, ${startDest.city}` : ''}`
            : '',
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

      let closest = null;
      let minDist = Infinity;

      for (const r of data || []) {
        const s1 = r.stop1;
        if (!s1 || s1.lat == null || s1.lng == null) continue;
        const dist = haversine(coords.latitude, coords.longitude, Number(s1.lat), Number(s1.lng));
        if (dist <= SEARCH_RADIUS_M && dist < minDist) {
          minDist = dist;
          closest = {
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

      setNearest(closest);
      setLoading(false);
    },
    [coords, status]
  );

  const reloadPreferredFromStorage = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem('buffago:selectedRoute');
      const parsed = raw ? JSON.parse(raw) : null;
      const sel = parsed ? await hydrateSelectedRouteFromDb(parsed) : null;

      setSelectedRoute(sel);
      await computePreferred(sel);
    } catch (e) {
      console.warn('reloadPreferredFromStorage failed', e?.message || e);
      setSelectedRoute(null);
      await computePreferred(null);
    }
  }, [computePreferred]);

  useFocusEffect(
    useCallback(() => {
      reloadPreferredFromStorage();
      return undefined;
    }, [reloadPreferredFromStorage])
  );

  useEffect(() => {
    if (status === 'granted' && coords) reloadPreferredFromStorage();
  }, [status, coords?.latitude, coords?.longitude, reloadPreferredFromStorage]);

  useEffect(() => {
    if (status !== 'granted') return;
    const id = setInterval(async () => {
      await refreshPosition();
      await reloadPreferredFromStorage();
    }, MS_5_MIN);
    return () => clearInterval(id);
  }, [status, refreshPosition, reloadPreferredFromStorage]);

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
        ? [
            routeRow.stop1_id,
            routeRow.stop2_id,
            routeRow.stop3_id,
            routeRow.stop4_id,
            routeRow.stop5_id,
          ].filter(Boolean)
        : [];

      const totalStops = stopIds.length || 0;

      const { data: ratings } = await supabase
        .from('destination_ratings')
        .select('destination_id')
        .eq('crawl_id', crawl.crawl_id)
        .eq('user_id', session.user.id);

      const visitedSet = new Set();
      for (const r of ratings || []) if (r.destination_id) visitedSet.add(r.destination_id);

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
  }, [isSignedIn, nearest?.routeId, session?.user?.id]);

  useEffect(() => {
    refreshActiveCrawl();
  }, [refreshActiveCrawl]);

  const hasCompletedThisRoute = useCallback(
    async (routeId) => {
      if (!isSignedIn || !routeId) return false;

      const { data, error } = await supabase
        .from('crawls')
        .select('crawl_id')
        .eq('user_id', session.user.id)
        .eq('route_id', routeId)
        .eq('status', 'completed')
        .limit(1);

      if (error) {
        console.warn('completed crawl check failed', error.message || error);
        return false;
      }

      return !!data?.[0]?.crawl_id;
    },
    [isSignedIn, session?.user?.id]
  );

  const milesAway =
    nearest && typeof nearest.distanceM === 'number' && isFinite(nearest.distanceM)
      ? (nearest.distanceM / 1609.34).toFixed(1)
      : null;

  const showFunFacts = loading || status !== 'granted' || !coords;

  useEffect(() => {
    if (showFunFacts) {
      setFactIndex((i) => (i + 1) % FUN_FACTS.length);
      if (factTimerRef.current) clearInterval(factTimerRef.current);
      factTimerRef.current = setInterval(
        () => setFactIndex((i) => (i + 1) % FUN_FACTS.length),
        7500
      );
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

  const activeStats =
    activeCrawl && activeCrawl.totalStops > 0
      ? {
          visited: activeCrawl.visitedCount,
          total: activeCrawl.totalStops,
          left: Math.max(0, activeCrawl.totalStops - activeCrawl.visitedCount),
          pct: Math.max(0, Math.min(1, activeCrawl.visitedCount / Math.max(1, activeCrawl.totalStops))),
        }
      : null;

  // ✅ Cache current state for the Leaderboards tab (so it can default to State without re-detecting)
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

  /**
   * HUD refresh:
   * - Level + XP bar (user_with_level + level_thresholds)
   * - Current state wingdex
   * - US wingdex
   * - States (distinct states rated)
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
        statesX: null,
        statesY: null,
        eatenStateIds: [],
      });
      return;
    }

    if (status !== 'granted' || !coords) {
      setHudStats((s) => ({ ...s, loading: false }));
      return;
    }

    setHudStats((s) => ({ ...s, loading: true }));

    try {
      // Level + XP
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
        // ✅ Pull title from canonical table (level_thresholds.level_title)
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

      // US totals
      let usY = null;
      try {
        const { count } = await supabase.from('destinations').select('id', { count: 'exact', head: true });
        if (typeof count === 'number') usY = count;
      } catch {}

      // US X (distinct destinations rated)
      let usX = null;
      try {
        const { data: ur } = await supabase
          .from('destination_ratings')
          .select('destination_id')
          .eq('user_id', session.user.id);

        const set = new Set();
        for (const r of ur || []) if (r?.destination_id) set.add(r.destination_id);
        usX = set.size;
      } catch {}

      // States Y
      let statesY = null;
      try {
        const { count } = await supabase.from('states').select('state_id', { count: 'exact', head: true });
        if (typeof count === 'number') statesY = count;
      } catch {}

      // States X (distinct destination.state_id rated)
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

      // Current state abbrev
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

      // ✅ Save cache for Leaderboards default state scope
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
          statesX,
          statesY,
          eatenStateIds,
        });
        return;
      }

      // State Y
      let stateY = null;
      try {
        const { count } = await supabase
          .from('destinations')
          .select('id', { count: 'exact', head: true })
          .eq('state_id', stateId);
        if (typeof count === 'number') stateY = count;
      } catch {}

      // State X
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
        statesX,
        statesY,
        eatenStateIds,
      });
    } catch (e) {
      console.warn('refreshHud failed', e?.message || e);
      setHudStats((s) => ({ ...s, loading: false }));
    }
  }, [isSignedIn, session?.user?.id, status, coords?.latitude, coords?.longitude, saveCurrentStateCache]);

  /* ---------- Daily Gift (Home) ---------- */

  // Some Supabase RPCs return {..} or [ {..} ] depending on definition.
  const unwrapRpc = (d) => (Array.isArray(d) ? d[0] : d);

  const loadDailyStatus = useCallback(async (uid) => {
    if (!uid) {
      setDailyGift((g) => ({ ...g, loading: false, claimedToday: true }));
      return;
    }

    setDailyGift((g) => ({ ...g, loading: true }));

    try {
      const { data, error } = await supabase.rpc('daily_xp_status', { p_user: uid });
      if (error) throw error;

      const row = unwrapRpc(data) || {};
      const claimedToday =
        !!row.claimed_today || !!row.claimedToday || !!row.claimed || false;

      let lastClaimed = null;
      try {
        const { data: lastRow, error: lastErr } = await supabase.rpc('daily_xp_last_claimed', { p_user: uid });
        const lr = unwrapRpc(lastRow) || {};
        if (!lastErr && lr?.last_claimed) {
          const raw = String(lr.last_claimed);
          lastClaimed = raw.length >= 10 ? raw.slice(0, 10) : raw;
        }
      } catch {}

      setDailyGift({
        claimedToday,
        streak: Number(row?.streak ?? 0),
        nextResetAt: row?.next_reset_at ?? row?.nextResetAt ?? null,
        lastClaimed,
        loading: false,
        claiming: false,
      });
    } catch (e) {
      // If status fails, err on the side of showing the card (so you notice).
      console.warn('daily_xp_status failed:', e?.message || e);
      setDailyGift((g) => ({
        ...g,
        loading: false,
        claimedToday: false,
      }));
    }
  }, []);

  const claimDaily = useCallback(
    async (uid) => {
      if (!uid) return;
      setDailyGift((g) => ({ ...g, claiming: true }));

      try {
        const { data, error } = await supabase.rpc('claim_daily_xp', { p_user: uid });
        if (error) throw error;

        const row = unwrapRpc(data) || {};

        // Optimistic: bump HUD XP if provided
        if (Number.isFinite(Number(row?.updated_xp))) {
          setHudStats((s) => ({ ...s, xp: Number(row.updated_xp) }));
        } else if (row?.awarded) {
          setHudStats((s) => ({ ...s, xp: (Number(s?.xp) || 0) + 10 }));
        }

        setDailyGift((g) => {
          const today = nyDateString();
          const newStreak =
            Number.isFinite(Number(row?.new_streak))
              ? Number(row.new_streak)
              : g.claimedToday
              ? g.streak
              : isYesterdayNY(g.lastClaimed)
              ? g.streak + 1
              : Math.max(1, g.streak || 1);

          return {
            claimedToday: true,
            streak: newStreak,
            nextResetAt: row?.next_reset_at ?? row?.nextResetAt ?? g.nextResetAt,
            lastClaimed: today,
            loading: false,
            claiming: false,
          };
        });

        await loadDailyStatus(uid);
        await refreshHud(); // keep Level/XP bar in sync
      } catch (e) {
        console.warn('claim_daily_xp failed:', e?.message || e);
        setDailyGift((g) => ({ ...g, claiming: false }));
      }
    },
    [loadDailyStatus, refreshHud]
  );

  // Load HUD + daily status when session becomes available.
  useEffect(() => {
    refreshHud();

    if (isSignedIn && session?.user?.id) {
      loadDailyStatus(session.user.id);
    } else {
      setDailyGift((g) => ({ ...g, loading: false, claimedToday: true }));
    }
  }, [refreshHud, isSignedIn, session?.user?.id, loadDailyStatus]);

  const heroSubtitle = nearest?.routeTitle ?? 'Nearby Crawl';

  const statePct = useMemo(() => {
    const x = Number(hudStats.stateX);
    const y = Number(hudStats.stateY);
    return y > 0 && Number.isFinite(x) ? clamp01(x / y) : 0;
  }, [hudStats.stateX, hudStats.stateY]);

  const usPct = useMemo(() => {
    const x = Number(hudStats.usX);
    const y = Number(hudStats.usY);
    return y > 0 && Number.isFinite(x) ? clamp01(x / y) : 0;
  }, [hudStats.usX, hudStats.usY]);

  const statesPct = useMemo(() => {
    const x = Number(hudStats.statesX);
    const y = Number(hudStats.statesY);
    return y > 0 && Number.isFinite(x) ? clamp01(x / y) : 0;
  }, [hudStats.statesX, hudStats.statesY]);

  const hudBarColor = '#2E7D32';
  const hudBaseBg = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';

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
          const items = (allStates || []).map((s) => ({
            label: s.state_name,
            done: eaten.has(s.state_id),
          }));

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
          }));

          setStatsItems(items);
          return;
        }

        if (type === 'us') {
          setStatsTitle('US WINGDEX');

          const { data: rows, error } = await supabase
            .from('destination_ratings')
            .select('created_at, destination:destination_id ( name, city, state_id )')
            .eq('user_id', session.user.id)
            .order('created_at', { ascending: false })
            .limit(80);

          if (error) throw error;

          const stateIds = Array.from(new Set((rows || []).map((r) => r?.destination?.state_id).filter(Boolean)));

          let stateMap = {};
          if (stateIds.length) {
            const { data: stRows } = await supabase
              .from('states')
              .select('state_id, state_name')
              .in('state_id', stateIds);

            for (const s of stRows || []) stateMap[s.state_id] = s.state_name;
          }

          const items = (rows || []).map((r) => {
            const d = r?.destination;
            const stName = d?.state_id ? stateMap[d.state_id] : null;
            const where = [d?.city, stName].filter(Boolean).join(', ');
            return {
              label: `${d?.name || 'Wing Spot'}${where ? ` — ${where}` : ''}`,
              done: true,
            };
          });

          setStatsItems(items.length ? items : [{ label: 'No ratings yet—go eat wings 🔥', done: false }]);
          return;
        }
      } catch (e) {
        console.warn('openStats failed:', e?.message || e);
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
    ]
  );

  const xpBarLabel = hudStats.xp != null && hudStats.xpMax != null ? `XP ${hudStats.xp}/${hudStats.xpMax}` : '';
  
  // Prevent Home from flashing while we decide whether to gate
  if (!gateChecked) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}
      >
        <ActivityIndicator />
        <Text style={{ marginTop: 12, opacity: 0.75 }}>Loading BuffaGo…</Text>
      </SafeAreaView>
    );
  }

  return (
    <LocationGate>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <ScrollView contentContainerStyle={styles.scroll}>
          {/* Header */}
          <View style={styles.headerRow}>
            <Pressable accessibilityRole="button" onPress={() => setWizardOpen(true)} style={styles.leftArea}>
              <View style={styles.iconScale}>
                <Avatar.Icon size={30} icon="help-circle-outline" />
              </View>
            </Pressable>

            <Image
              source={require('../../assets/images/buffago-logo.png')}
              resizeMode="contain"
              style={styles.logo}
            />

            {/* Only avatar on the right now */}
            <View style={styles.rightCluster}>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push(isSignedIn ? '/user' : '/auth/login')}
                style={styles.avatarBtn}
              >
                {isSignedIn && session?.user?.user_metadata?.avatar_url ? (
                  <Avatar.Image size={30} source={{ uri: session.user.user_metadata.avatar_url }} />
                ) : (
                  <Avatar.Icon size={30} icon={isSignedIn ? 'account-circle' : 'login'} />
                )}
              </Pressable>
            </View>
          </View>

          {/* Signed-in: Level row */}
          {isSignedIn ? (
            <View style={styles.levelRow}>
              <View style={styles.levelHeaderRow}>
                <Text style={styles.levelValue} numberOfLines={1}>
                  LEVEL {hudStats.level ?? '—'}
                  {!!hudStats.levelTitle ? ` • ${hudStats.levelTitle}` : ''}
                </Text>
              </View>

              <View style={{ marginTop: 10, width: '100%' }}>
                <XpPepperBar progress={hudStats.levelPct ?? 0} label={xpBarLabel} />
                {!xpBarLabel ? <Text style={styles.levelSub}>XP loading…</Text> : <Text style={styles.levelSub}> </Text>}
              </View>
            </View>
          ) : (
            <View style={styles.guestBlurb}>
              <Text style={{ textAlign: 'center', opacity: 0.85, lineHeight: 19 }}>
                Take one night a week with your family to find a new favorite spot, or blow through a
                crawl with friends on the weekend. You don’t need an account to get started, but
                signing in lets you save progress, track your Wingdex, and build your wing journey
                over time.
              </Text>
            </View>
          )}

          {/* Daily Gift (only when signed in + unclaimed) */}
          {isSignedIn && !dailyGift.loading && !dailyGift.claimedToday && (
            <Card
              style={[
                styles.dailyCard,
                { backgroundColor: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' },
              ]}
              mode="elevated"
            >
              <Card.Content style={styles.dailyContent}>
                <View style={[styles.dailyIcon, { backgroundColor: colors.primary }]}>
                  <Text style={{ color: colors.onPrimary ?? '#000', fontWeight: '900' }}>🎁</Text>
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.dailyTitle}>Daily Gift Ready</Text>
                  <Text style={styles.dailySub}>+10 XP waiting for you</Text>
                </View>

                <Button
                  mode="contained"
                  compact
                  style={{ borderRadius: 12 }}
                  loading={dailyGift.claiming}
                  disabled={dailyGift.claiming}
                  onPress={() => claimDaily(session.user.id)}
                >
                  Claim
                </Button>
              </Card.Content>
            </Card>
          )}

          {/* Tiles (CT Wingdex, US Wingdex, States) */}
          {isSignedIn && (
            <View style={styles.hudRow}>
              {/* State Wingdex */}
              <Pressable style={styles.hudItem} onPress={() => openStats('ct')}>
                <View style={[styles.wingdexWrap, { backgroundColor: hudBaseBg }]}>
                  <View
                    style={[
                      styles.wingdexFill,
                      { left: 0, width: `${Math.round(statePct * 100)}%`, backgroundColor: hudBarColor },
                    ]}
                  />
                  <View style={styles.wingdexContent}>
                    <Text style={styles.hudLabel}>
                      {hudStats.stateAbbrev ? `${hudStats.stateAbbrev} WINGDEX` : 'STATE WINGDEX'}
                    </Text>
                    <Text style={styles.hudValue}>
                      {hudStats.stateX ?? '—'}/{hudStats.stateY ?? '—'}
                    </Text>
                  </View>
                </View>
              </Pressable>

              <View style={styles.hudDivider} />

              {/* US Wingdex */}
              <Pressable style={styles.hudItem} onPress={() => openStats('us')}>
                <View style={[styles.wingdexWrap, { backgroundColor: hudBaseBg }]}>
                  <View
                    style={[
                      styles.wingdexFill,
                      { left: 0, width: `${Math.round(usPct * 100)}%`, backgroundColor: hudBarColor },
                    ]}
                  />
                  <View style={styles.wingdexContent}>
                    <Text style={styles.hudLabel}>US WINGDEX</Text>
                    <Text style={styles.hudValue}>
                      {hudStats.usX ?? '—'}/{hudStats.usY ?? '—'}
                    </Text>
                  </View>
                </View>
              </Pressable>

              <View style={styles.hudDivider} />

              {/* States */}
              <Pressable style={styles.hudItem} onPress={() => openStats('states')}>
                <View style={[styles.wingdexWrap, { backgroundColor: hudBaseBg }]}>
                  <View
                    style={[
                      styles.wingdexFill,
                      { left: 0, width: `${Math.round(statesPct * 100)}%`, backgroundColor: hudBarColor },
                    ]}
                  />
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

          {/* HERO */}
          <Card style={styles.heroCard} mode="elevated">
            <Card.Content style={{ alignItems: 'center', width: '100%' }}>
              {showFunFacts && (
                <View style={{ width: '100%', alignItems: 'center' }}>
                  <ProgressBar indeterminate style={{ height: 8, borderRadius: 8, width: '92%' }} />
                  <Text
                    style={{
                      marginTop: 10,
                      textAlign: 'center',
                      opacity: 0.9,
                      fontFamily: HAND_FONT,
                      fontSize: 15,
                      letterSpacing: 0.4,
                    }}
                  >
                    {FUN_FACTS[factIndex]}
                  </Text>
                  <View style={{ alignItems: 'center', marginTop: 10 }}>
                    <ActivityIndicator size="small" color={colors.primary} />
                  </View>
                </View>
              )}

              {!showFunFacts && nearest && (
                <>
                  <Text variant="titleMedium" style={styles.heroSubtitle}>
                    {heroSubtitle}
                  </Text>

                  {!!activeStats && (
                    <View style={{ width: '92%', marginTop: 4, marginBottom: 12, alignItems: 'center' }}>
                      <SteppingStones visited={activeStats.visited} total={activeStats.total} />
                      <Text variant="bodySmall" style={{ marginTop: 8, opacity: 0.85, textAlign: 'center' }}>
                        Visited {activeStats.visited}/{activeStats.total}
                        {activeStats.left > 0 ? ` • ${activeStats.left} left` : ' • Complete'}
                      </Text>
                    </View>
                  )}

                  <Button
                    mode="contained"
                    icon={activeCrawl?.crawlId ? 'play' : 'sword-cross'}
                    style={styles.bigCta}
                    contentStyle={{ paddingVertical: 16 }}
                    uppercase={false}
                    loading={starting}
                    onPress={async () => {
                      if (activeCrawl?.crawlId) {
                        router.replace({
                          pathname: `/crawl/${activeCrawl.crawlId}`,
                          params: { prefact: preloadedFact ?? '' },
                        });
                        return;
                      }

                      if (isSignedIn) {
                        try {
                          setStarting(true);
                          if (!nearest?.routeId) throw new Error('No route selected or found nearby.');

                          const alreadyCompleted = await hasCompletedThisRoute(nearest.routeId);
                          if (alreadyCompleted) {
                            Alert.alert('You already did this crawl!', 'You’ve already completed this crawl. Try something new!');
                            return;
                          }

                          const row = await createSoloCrawl({ routeId: nearest.routeId, userId: session.user.id });

                          router.replace({ pathname: `/crawl/${row.crawl_id}`, params: { prefact: preloadedFact ?? '' } });
                        } catch (e) {
                          Alert.alert('Error', e.message ?? String(e));
                        } finally {
                          setStarting(false);
                        }
                        return;
                      }

                      setShowGuestDialog(true);
                    }}
                  >
                    <Text style={styles.bigCtaText} numberOfLines={2}>
                      {nearest?.destName || nearest?.routeTitle || 'Start Crawl'}
                    </Text>
                  </Button>
                  {nearest?.lat != null && nearest?.lng != null && (
                    <Button
                      mode="outlined"
                      style={styles.secondaryBtn}
                      labelStyle={{ fontSize: 13 }}
                      onPress={() =>
                        openDirections({ lat: nearest.lat, lng: nearest.lng, label: nearest.destName, mode: 'walking' })
                      }
                    >
                      Take Me There
                    </Button>
                  )}
                </>
              )}

              {!showFunFacts && !nearest && (
                <Text style={{ opacity: 0.85, textAlign: 'center' }}>
                  No crawl starts found within 100 miles.
                </Text>
              )}
            </Card.Content>
          </Card>

          {/* Wing facts button: beneath hero card */}
          <View style={styles.wingFactsRow}>
            <WingFactsButton
              onPress={async () => {
                setWingFactOpen(true);
                if (!wingFactText) await loadNextWingFact();
              }}
            />
          </View>
        </ScrollView>

        {/* Guest dialog */}
        <Portal>
          <Dialog visible={showGuestDialog} onDismiss={() => setShowGuestDialog(false)} style={styles.dialog}>
            <Dialog.Title style={{ textAlign: 'center', marginBottom: 0 }}>Save your crawl?</Dialog.Title>

            <Dialog.Content style={{ paddingTop: 8 }}>
              <Text variant="bodyMedium" style={{ textAlign: 'center', lineHeight: 20 }}>
                Sign in to save history and view results later — or continue as a guest (no saved progress).
              </Text>
            </Dialog.Content>

            <Dialog.Actions style={styles.dialogActions}>
              <Button
                mode="outlined"
                style={styles.dialogBtn}
                onPress={() => {
                  setShowGuestDialog(false);
                  router.push('/auth/login');
                }}
              >
                Sign in
              </Button>

              <Button
                mode="contained"
                style={styles.dialogBtn}
                loading={starting}
                onPress={async () => {
                  setShowGuestDialog(false);
                  try {
                    setStarting(true);
                    if (!nearest?.routeId) throw new Error('No route selected or found nearby.');

                    const row = await createSoloCrawl({ routeId: nearest.routeId, userId: null });

                    router.replace({ pathname: `/crawl/${row.crawl_id}`, params: { prefact: preloadedFact ?? '' } });
                  } catch (e) {
                    Alert.alert('Error', e.message ?? String(e));
                  } finally {
                    setStarting(false);
                  }
                }}
              >
                Continue as guest
              </Button>
            </Dialog.Actions>
          </Dialog>
        </Portal>

        {/* Stats dialog (tile taps) */}
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
                    <StatLine key={`${idx}-${it.label}`} label={it.label} done={!!it.done} />
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

        {/* Wing Fact dialog (Next + Close) */}
        <Portal>
          <Dialog visible={wingFactOpen} onDismiss={() => setWingFactOpen(false)} style={styles.factDialog}>
            <Dialog.Title style={styles.factTitle}>Wing Fact</Dialog.Title>

            <Dialog.Content>
              {wingFactLoading ? (
                <View style={{ paddingVertical: 18, alignItems: 'center' }}>
                  <ActivityIndicator />
                </View>
              ) : (
                <Text style={styles.factBody}>
                  {wingFactText || 'No facts yet — add some to fun_facts 🔥'}
                </Text>
              )}
            </Dialog.Content>

            <Dialog.Actions style={{ justifyContent: 'space-between' }}>
              <Button onPress={loadNextWingFact} disabled={wingFactLoading}>
                Next
              </Button>
              <Button onPress={() => setWingFactOpen(false)}>Close</Button>
            </Dialog.Actions>
          </Dialog>
        </Portal>
      </SafeAreaView>
    </LocationGate>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 20, paddingBottom: 28, gap: 14 },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  leftArea: { width: 36, alignItems: 'flex-start', justifyContent: 'center' },
  rightCluster: { width: 46, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8 },
  iconScale: {
    transform: [{ scale: 0.75 }],
    minWidth: 36,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: { flex: 1, height: 60, alignSelf: 'center' },
  avatarBtn: { borderRadius: 999 },

  // Level row
  levelRow: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignItems: 'flex-start',
  },
  levelHeaderRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
  },
  levelLabel: { fontSize: 11, opacity: 0.75, letterSpacing: 1 },
  levelValue: { fontSize: 22, fontWeight: '900' },

  levelSub: { marginTop: 8, fontSize: 11, opacity: 0.6, textAlign: 'center' },

  // XP bar + text
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
  xpFill: {
    height: '100%',
    backgroundColor: '#2E7D32',
  },
  xpTextOverlay: {
    position: 'absolute',
    left: 10,
    right: 10,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  xpText: {
    fontSize: 11,
    letterSpacing: 0.5,
    fontWeight: '900',
    color: 'rgba(255,255,255,0.9)',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },

  // Tiles strip
  hudRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    paddingVertical: 10,
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

  // Daily Gift card
  dailyCard: {
    width: '100%',
    borderRadius: 16,
    marginTop: 10,
  },
  dailyContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 2,
  },
  dailyIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dailyTitle: { fontWeight: '900', fontSize: 14 },
  dailySub: { opacity: 0.75, marginTop: 2, fontSize: 12 },

  wingdexWrap: {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    paddingVertical: 8,
    paddingHorizontal: 6,
    position: 'relative',
  },
  wingdexFill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    opacity: 0.35,
  },
  wingdexContent: { alignItems: 'center' },

  guestBlurb: {
    paddingHorizontal: 10,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },

  heroCard: { borderRadius: 18, paddingVertical: 14 },
  heroSubtitle: { marginTop: 2, opacity: 0.9, textAlign: 'center', marginBottom: 10 },

  bigCta: {
    borderRadius: 18,
    width: '92%',
    alignSelf: 'center',
    marginTop: 4,
  },
  bigCtaText: {
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'center',
    fontWeight: '800',
  },

  helperText: { marginTop: 8, opacity: 0.85, textAlign: 'center' },
  secondaryBtn: { marginTop: 10, borderRadius: 12 },

  dialog: { borderRadius: 16, alignSelf: 'center', width: '92%', maxWidth: 420 },
  dialogActions: {
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 10,
  },
  dialogBtn: { flex: 1, borderRadius: 12 },

  // Stepping stones
  stonesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  stone: {
    width: 18,
    height: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  stoneTodo: {
    borderColor: 'rgba(255,255,255,0.25)',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  stoneDone: {
    borderColor: 'rgba(255,255,255,0.35)',
    backgroundColor: 'rgba(46, 125, 50, 0.65)',
  },

  // Wing facts button (NEW look)
  wingFactsRow: { alignItems: 'center', marginTop: -4, marginBottom: 6 },
  wingFactsPress: { alignSelf: 'center', marginTop: 10 },

  wingPillOuter: {
    borderRadius: 999,
    padding: 2,
    // golden-ish glow ring
    backgroundColor: 'rgba(255, 193, 7, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255, 193, 7, 0.35)',
  },
  wingPillInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 42,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 193, 7, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  wingFactsEmoji: { fontSize: 16 },
  wingFactsSpark: { fontSize: 14, opacity: 0.9 },
  wingFactsText: {
    fontFamily: HAND_FONT,
    fontSize: 16,
    letterSpacing: 0.7,
    fontWeight: '900',
    color: 'rgba(255,255,255,0.95)',
    textTransform: 'none',
  },

  // Stats dialog
  statsDialog: {
    alignSelf: 'center',
    width: '92%',
    maxWidth: 520,
    borderRadius: 18,
  },
  statsTitle: {
    textAlign: 'center',
    letterSpacing: 1,
    fontWeight: '900',
  },
  statsContent: { paddingTop: 6 },

  // Stat lines
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  statText: {
    fontSize: 16,
    opacity: 0.92,
    fontFamily: HAND_FONT,
  },
  statTextDone: { opacity: 0.65 },
  redX: {
    width: 18,
    textAlign: 'center',
    fontSize: 18,
    fontFamily: HAND_FONT,
    color: 'rgba(210,0,0,0.95)',
    fontWeight: '900',
  },
  redStrike: {
    position: 'absolute',
    left: -2,
    right: 12,
    height: 3,
    borderRadius: 3,
    backgroundColor: 'rgba(210,0,0,0.85)',
  },

  // Wing fact dialog
  factDialog: {
    alignSelf: 'center',
    width: '92%',
    maxWidth: 520,
    borderRadius: 18,
  },
  factTitle: {
    textAlign: 'center',
    letterSpacing: 1,
    fontWeight: '900',
  },
  factBody: {
    textAlign: 'center',
    lineHeight: 20,
    opacity: 0.9,
  },
});
