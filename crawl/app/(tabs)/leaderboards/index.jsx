// app/(tabs)/leaderboards/index.jsx
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Pressable, Image  } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Text,
  Card,
  ActivityIndicator,
  Divider,
  Button,
  Dialog,
  Portal,
  Avatar,
  useTheme,
} from 'react-native-paper';
import { useRouter, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { supabase } from '../../../lib/supabase.js';

const ADMIN_ID = '23898359-306a-4dd3-91f0-da66da19ccfc';
const TOKEN_SRC = require('../../../assets/Buffago-token.png');

const TokenIcon = ({ size = 14 }) => (
  <Image
    source={TOKEN_SRC}
    style={{ width: size, height: size }}
    resizeMode="contain"
  />
);

// ✅ Shared “current state” cache key (Home writes this after it resolves the user’s state)
const STATE_CACHE_KEY = 'buffago:currentState';

// ---------- helpers ----------
const groupBy = (arr, keyFn) => {
  const m = new Map();
  for (const item of arr || []) {
    const k = keyFn(item);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(item);
  }
  return m;
};

const distinctCount = (items, keyFn) => {
  const s = new Set();
  for (const it of items || []) s.add(keyFn(it));
  return s.size;
};

const toStartOfISOWeek = (d) => {
  const date = new Date(d);
  const day = (date.getDay() + 6) % 7; // Mon=0 ... Sun=6
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - day);
  return date.toISOString().slice(0, 10);
};

const longestWeeklyStreak = (datesISO) => {
  const weekKeys = new Set((datesISO || []).map(toStartOfISOWeek));
  if (weekKeys.size === 0) return 0;
  const weeks = Array.from(weekKeys).sort();
  let best = 1;
  let cur = 1;
  for (let i = 1; i < weeks.length; i++) {
    const prev = new Date(weeks[i - 1]);
    const curD = new Date(weeks[i]);
    const diffDays = Math.round((curD - prev) / (1000 * 60 * 60 * 24));
    if (diffDays === 7) cur += 1;
    else cur = 1;
    if (cur > best) best = cur;
  }
  return best;
};

const maxDistinctIn24h = (rows, keyFn) => {
  const times = (rows || [])
    .map((r) => ({
      t: new Date(r.created_at || r.inserted_at || r.createdAt).getTime(),
      k: keyFn(r),
    }))
    .filter((x) => Number.isFinite(x.t))
    .sort((a, b) => a.t - b.t);

  let i = 0;
  let best = 0;
  const windowKeys = new Map();

  for (let j = 0; j < times.length; j++) {
    const tJ = times[j].t;
    windowKeys.set(times[j].k, (windowKeys.get(times[j].k) ?? 0) + 1);

    while (times[i] && tJ - times[i].t > 24 * 60 * 60 * 1000) {
      const k = times[i].k;
      const c = (windowKeys.get(k) ?? 0) - 1;
      if (c <= 0) windowKeys.delete(k);
      else windowKeys.set(k, c);
      i++;
    }
    best = Math.max(best, windowKeys.size);
  }
  return best;
};

function rowsToMap(rows, idKey, valKey) {
  const m = new Map();
  for (const r of rows || []) m.set(r[idKey], Number(r[valKey]) || 0);
  return m;
}

const fmtShortDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const attachTokenFlagsToFeedRows = async (rows) => {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return list;

  const userIds = Array.from(new Set(list.map((r) => r.user_id).filter(Boolean)));
  const destIds = Array.from(new Set(list.map((r) => r.destination_id).filter(Boolean)));
  if (!userIds.length || !destIds.length) return list;

  // Use a loose time window around the feed items to reduce result size
  const times = list
    .map((r) => (r?.created_at ? new Date(r.created_at).getTime() : NaN))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);

  const minT = times[0];
  const maxT = times[times.length - 1];

  let q = supabase
    .from('destination_ratings')
    .select('user_id, destination_id, created_at, is_buffacoin')
    .in('user_id', userIds)
    .in('destination_id', destIds);

  if (Number.isFinite(minT) && Number.isFinite(maxT)) {
    const minIso = new Date(minT - 1000 * 60 * 60 * 24 * 7).toISOString(); // -7 days buffer
    const maxIso = new Date(maxT + 1000 * 60).toISOString(); // +60s buffer
    q = q.gte('created_at', minIso).lte('created_at', maxIso);
  }

  const { data, error } = await q.order('created_at', { ascending: false });

  if (error || !Array.isArray(data) || !data.length) {
    return list.map((r) => ({ ...r, is_buffacoin: false }));
  }

  // Index by (user|dest)
  const byPair = new Map();
  for (const r of data) {
    const key = `${r.user_id}|${r.destination_id}`;
    if (!byPair.has(key)) byPair.set(key, []);
    byPair.get(key).push(r);
  }

  // Closest created_at match for same (user,dest)
  const pickClosest = (pairRows, targetIso) => {
    const t = new Date(targetIso).getTime();
    if (!Number.isFinite(t) || !pairRows?.length) return null;

    let best = null;
    let bestDiff = Infinity;

    for (const cand of pairRows) {
      const ct = new Date(cand.created_at).getTime();
      if (!Number.isFinite(ct)) continue;
      const diff = Math.abs(ct - t);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = cand;
      }
      if (bestDiff <= 2000) break; // within 2s is "good enough"
    }
    return best;
  };

  return list.map((row) => {
    const key = `${row.user_id}|${row.destination_id}`;
    const candidates = byPair.get(key) || [];
    const best = pickClosest(candidates, row.created_at);
    return { ...row, is_buffacoin: !!best?.is_buffacoin };
  });
};

// ---------- tiny UI atoms ----------
const Medal = ({ rank, size = 'md' }) => {
  const map = { 1: '🥇', 2: '🥈', 3: '🥉' };
  const cfg =
    {
      sm: { fontSize: 14, lineHeight: 16 },
      md: { fontSize: 18, lineHeight: 20 },
      lg: { fontSize: 20, lineHeight: 22 },
    }[size] || {};
  return (
    <Text style={[styles.medal, cfg]} numberOfLines={1} ellipsizeMode="clip">
      {map[rank] || `#${rank}`}
    </Text>
  );
};

const initials = (name) => {
  if (!name) return '??';
  const parts = String(name).split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? '';
  const b = parts[1]?.[0] ?? '';
  return (a + b).toUpperCase();
};

const PodiumRow = ({ rank, name, value, sub, onPress }) => {
  const theme = useTheme();
  const avatarBg = theme.colors.elevation?.level1 ?? (theme.dark ? '#2a2a2a' : '#f1f3f5');
  const textColor = theme.colors.onSurface;
  return (
    <TouchableOpacity style={styles.podiumRow} onPress={onPress} activeOpacity={0.7} disabled={!onPress}>
      <Medal rank={rank} />
      <Avatar.Text size={30} label={initials(name)} style={[styles.avatar, { backgroundColor: avatarBg }]} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.podiumName, { color: textColor }]} numberOfLines={1}>
          {name}
        </Text>
        {sub ? (
          <Text style={[styles.podiumSub, { color: textColor }]} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
      {typeof value !== 'undefined' ? (
        <Text style={[styles.podiumValue, { color: textColor }]} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
};

// A single leaderboard card with a podium preview and “View Top 25”
const LeaderCard = ({ title, items, formatValue, formatSub, onView, onUserPress, emptyText }) => {
  const theme = useTheme();
  const cardBg = theme.colors.elevation?.level2 ?? (theme.dark ? '#1f1f1f' : '#ffffff');
  const titleColor = theme.colors.onSurface;
  const top3 = (items || []).slice(0, 3);

  return (
    <Card style={[styles.card, { backgroundColor: cardBg }]}>
      <Card.Title title={title} titleVariant="titleMedium" titleStyle={{ color: titleColor }} />
      <Card.Content style={{ gap: 10 }}>
        {top3.length === 0 ? (
          <Text style={[styles.muted, { color: theme.colors.onSurface }]}>
            {emptyText || 'No data yet.'}
          </Text>
        ) : (
          top3.map((it, i) => (
            <PodiumRow
              key={`${title}-${it.uid}-${i}`}
              rank={i + 1}
              name={it.displayName}
              value={formatValue ? formatValue(it) : it.value}
              sub={formatSub ? formatSub(it) : undefined}
              onPress={onUserPress ? () => onUserPress(it.uid) : undefined}
            />
          ))
        )}

        <View style={styles.cardBottomRow}>
          <Button mode="contained-tonal" onPress={onView} style={styles.viewAllBtn} disabled={!top3.length}>
            View Top 25
          </Button>
        </View>
      </Card.Content>
    </Card>
  );
};

const TogglePills = ({ options, value, onChange, size = 'sm' }) => {
  const theme = useTheme();
  const surface = theme.colors.elevation?.level1 ?? (theme.dark ? '#1f1f1f' : '#ffffff');
  const active = theme.colors.primary;
  const text = theme.colors.onSurface;

  const isLg = size === 'lg';

  return (
    <View
      style={[
        styles.pillsWrap,
        {
          backgroundColor: surface,
          alignSelf: isLg ? 'stretch' : 'flex-start',
          width: isLg ? '100%' : undefined,
        },
      ]}
    >
      {options.map((opt) => {
        const isActive = opt.value === value;
        const isDisabled = !!opt.disabled;
        return (
          <Pressable
            key={opt.value}
            onPress={() => (!isDisabled ? onChange(opt.value) : null)}
            style={[
              styles.pill,
              isLg ? styles.pillLg : null,
              {
                backgroundColor: isActive ? active : 'transparent',
                opacity: isDisabled ? 0.45 : 1,
                flex: isLg ? 1 : undefined,
                minWidth: isLg ? 0 : styles.pill.minWidth,
              },
            ]}
          >
            <Text
              style={[
                styles.pillText,
                isLg ? styles.pillTextLg : null,
                { color: isActive ? theme.colors.onPrimary : text },
              ]}
              numberOfLines={1}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};

// ---------- screen ----------
export default function Leaderboards() {
  const theme = useTheme();
  const textColor = theme.colors.onSurface;
  const surface = theme.colors.surface;
  const router = useRouter();

  const goToJourney = useCallback(
    (userId) => {
      if (!userId) return;
  
      router.push({
        pathname: '/profile/history',
        params: { userId: String(userId) },
      });
    },
    [router]
  );


  // Top-level mode tabs
  const [mode, setMode] = useState('feed'); // 'feed' | 'leaderboards'

  // Social scope (default state)
  const [feedScope, setFeedScope] = useState('state'); // 'state' | 'all' | 'friends'

  // Leaderboards scope (default state + match order to social)
  const [lbScope, setLbScope] = useState('state'); // 'state' | 'all' | 'friends'

  // Current state detection
  const [stateName, setStateName] = useState('Your State');
  const [stateId, setStateId] = useState(null);
  const [stateDetecting, setStateDetecting] = useState(true);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Always-readable via your RLS: ratings (global, used for leaderboards)
  const [ratings, setRatings] = useState([]);

  // Users meta (username + xp + level truth)
  const [usersMap, setUsersMap] = useState(new Map()); // user_id -> { username, xp, level }

  // Current viewer (for guest vs user context on the journey screen)
  const [viewerId, setViewerId] = useState(null);

  // Crawls aggregates (may be blocked by RLS on crawls; we try/fallback)
  const [crawlsOk, setCrawlsOk] = useState(false);
  const [crawlsByUser, setCrawlsByUser] = useState(new Map()); // user_id -> { total, completed, crawls: [] }

  // Totals (ALL destinations)
  const [totalDestinations, setTotalDestinations] = useState(0);

  // Totals (STATE destinations)
  const [totalDestinationsState, setTotalDestinationsState] = useState(null);

  // Per-user aggregates (global)
  const [destsRatedMap, setDestsRatedMap] = useState(new Map());

  // Per-user aggregates (state)
  const [destsRatedStateMap, setDestsRatedStateMap] = useState(new Map());

  // Badges Earned per user
  const [badgesCountMap, setBadgesCountMap] = useState(new Map()); // user_id -> count

  // Weekly streaks from view
  const [streakWeeksMap, setStreakWeeksMap] = useState(new Map()); // user_id -> current_streak_weeks

  // Social Feed (uses your view: v_social_feed)
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedError, setFeedError] = useState('');
  const [feedRows, setFeedRows] = useState([]);
  const [feedPage, setFeedPage] = useState(0);
  const [feedHasMore, setFeedHasMore] = useState(true);

  // Leaderboards state-scoped ratings
  const [stateRatings, setStateRatings] = useState([]);
  const [stateRatingsLoading, setStateRatingsLoading] = useState(false);

  // Drilldown modal (leaderboards)
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalItems, setModalItems] = useState([]);
  const [modalFormatter, setModalFormatter] = useState({ fmtValue: null, fmtSub: null });

  // Rating Details modal (social feed tap)
  const [ratingModalOpen, setRatingModalOpen] = useState(false);
  const [ratingModalLoading, setRatingModalLoading] = useState(false);
  const [ratingModalError, setRatingModalError] = useState('');
  const [ratingDetail, setRatingDetail] = useState(null);

  // --------- ✅ state: bootstrap from Home cache, then fallback to device geo ----------
  const readStateCache = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(STATE_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed) return null;

      // Accept either {state_id,...} or {stateId,...}
      const cachedId = parsed.state_id ?? parsed.stateId ?? null;
      const cachedName = parsed.state_name ?? parsed.stateName ?? null;

      if (cachedId) {
        setStateId(cachedId);
        if (cachedName) setStateName(String(cachedName));
        return { stateId: cachedId, stateName: cachedName || null };
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  // On focus: refresh cache so Social immediately matches Home when user taps the tab
  useFocusEffect(
    useCallback(() => {
      readStateCache();
      return undefined;
    }, [readStateCache])
  );

  // Initial boot: try cache first; if missing, do the old geo flow
  useEffect(() => {
    let alive = true;

    (async () => {
      setStateDetecting(true);

      // 1) Cache-first (fast path)
      const cached = await readStateCache();
      if (cached?.stateId) {
        if (alive) setStateDetecting(false);

        // Optional: still kick off a background check to keep it accurate,
        // but don't block the UI.
        try {
          const { status } = await Location.getForegroundPermissionsAsync();
          if (status !== 'granted') return;
          const loc = await Location.getCurrentPositionAsync({});
          const geo = await Location.reverseGeocodeAsync({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          });
          const region = geo?.[0]?.region || geo?.[0]?.subregion || '';
          const regionStr = String(region || '').trim();
          if (!alive || !regionStr) return;

          const { data: st } = await supabase
            .from('states')
            .select('state_id, state_name')
            .ilike('state_name', `%${regionStr}%`)
            .limit(1);

          const row = st?.[0];
          if (row?.state_id) {
            setStateId(row.state_id);
            setStateName(row.state_name || regionStr);

            // Update cache so Home & Social converge on the same value
            try {
              await AsyncStorage.setItem(
                STATE_CACHE_KEY,
                JSON.stringify({ state_id: row.state_id, state_name: row.state_name })
              );
            } catch {}
          }
        } catch {
          // ignore
        }

        return;
      }

      // 2) No cache — do original location detection
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (!alive) return;
          setStateName('Your State');
          setStateId(null);
          return;
        }

        const loc = await Location.getCurrentPositionAsync({});
        const geo = await Location.reverseGeocodeAsync({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });

        const region = geo?.[0]?.region || geo?.[0]?.subregion || '';
        const regionStr = String(region || '').trim();
        if (!alive) return;

        if (regionStr) setStateName(regionStr);

        if (!regionStr) {
          setStateId(null);
          return;
        }

        try {
          const { data: st, error: stErr } = await supabase
            .from('states')
            .select('state_id, state_name')
            .ilike('state_name', `%${regionStr}%`)
            .limit(1);

          if (!stErr && Array.isArray(st) && st.length) {
            setStateId(st[0].state_id);
            setStateName(st[0].state_name);

            // ✅ persist for next tab-open
            try {
              await AsyncStorage.setItem(
                STATE_CACHE_KEY,
                JSON.stringify({ state_id: st[0].state_id, state_name: st[0].state_name })
              );
            } catch {}
          } else {
            setStateId(null);
          }
        } catch {
          setStateId(null);
        }
      } catch {
        if (alive) {
          setStateName('Your State');
          setStateId(null);
        }
      } finally {
        if (alive) setStateDetecting(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [readStateCache]);

  // Grab viewer session
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!alive) return;
        if (error) {
          setViewerId(null);
          return;
        }
        setViewerId(data?.session?.user?.id ?? null);
      } catch {
        if (alive) setViewerId(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Fetch global leaderboard data
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError('');

        // 1) destination_ratings (exclude guests/admin)
        const { data: dr, error: e1 } = await supabase
          .from('destination_ratings')
          .select('user_id, destination_id, crawl_id, tag_id, weight_score, created_at')
          .not('user_id', 'is', null)
          .neq('user_id', ADMIN_ID);

        if (e1) throw e1;
        setRatings(Array.isArray(dr) ? dr : []);

        // 2) user_with_level + users (username)
        const map = new Map();

        // 2a) level + xp from view (truth)
        let levelRows = null;
        try {
          const { data: lvl, error: eLvl } = await supabase
            .from('user_with_level')
            .select('user_id, xp, level')
            .neq('user_id', ADMIN_ID);

          if (!eLvl && Array.isArray(lvl)) levelRows = lvl;
        } catch {
          levelRows = null;
        }

        if (Array.isArray(levelRows) && levelRows.length) {
          for (const row of levelRows) {
            map.set(row.user_id, {
              username: null,
              xp: row.xp ?? 0,
              level: row.level ?? null,
            });
          }
        }

        // 2b) usernames for labels — exclude admin
        try {
          const { data: usersData, error: eUsers } = await supabase
            .from('users')
            .select('user_id, username')
            .neq('user_id', ADMIN_ID);

          if (!eUsers && Array.isArray(usersData)) {
            for (const u of usersData) {
              const prev = map.get(u.user_id) || { xp: 0, level: null, username: null };
              map.set(u.user_id, { ...prev, username: u.username || null });
            }
          } else {
            const ids = Array.from(new Set((dr || []).map((r) => r.user_id))).filter(Boolean);
            if (ids.length) {
              const { data: someUsers } = await supabase.from('users').select('user_id, username').in('user_id', ids);
              for (const u of someUsers || []) {
                const prev = map.get(u.user_id) || { xp: 0, level: null, username: null };
                map.set(u.user_id, { ...prev, username: u.username || null });
              }
            }
          }
        } catch {}

        // 2c) last fallback: approximate XP
        if (map.size === 0) {
          const ids = Array.from(new Set((dr || []).map((r) => r.user_id))).filter(Boolean);
          for (const uid of ids) {
            const approxXp = (dr || []).filter((r) => r.user_id === uid).length;
            map.set(uid, { username: null, xp: approxXp, level: null });
          }
        }

        setUsersMap(map);

        // 3) Crawls (optional)
        try {
          const { data: crawls, error: cErr } = await supabase
            .from('crawls')
            .select('crawl_id, user_id, route_id, status, start_time, end_time')
            .not('user_id', 'is', null)
            .neq('user_id', ADMIN_ID);

          if (cErr) throw cErr;

          const byU = new Map();
          for (const c of crawls || []) {
            if (!byU.has(c.user_id)) byU.set(c.user_id, { total: 0, completed: 0, crawls: [] });
            const o = byU.get(c.user_id);
            o.total += 1;
            if ((c.status || '').toLowerCase() === 'completed') o.completed += 1;
            o.crawls.push(c);
          }
          setCrawlsByUser(byU);
          setCrawlsOk(true);
        } catch {
          setCrawlsByUser(new Map());
          setCrawlsOk(false);
        }

        // 4) Total destinations (global)
        try {
          const { count } = await supabase.from('destinations').select('id', { count: 'exact', head: true });
          setTotalDestinations(typeof count === 'number' ? count : 0);
        } catch {
          try {
            const { data: d } = await supabase.from('destinations').select('id');
            setTotalDestinations(Array.isArray(d) ? d.length : 0);
          } catch {
            setTotalDestinations(0);
          }
        }

        // 5) Per-user destinations rated (global) via RPC preferred
        try {
          const { data: destsRated } = await supabase.rpc('lb_user_destinations_rated');
          setDestsRatedMap(rowsToMap(destsRated, 'user_id', 'distinct_destinations'));
        } catch {
          const byUser = groupBy(dr, (r) => r.user_id);
          const drMap = new Map();
          for (const [uid, items] of byUser) {
            drMap.set(uid, distinctCount(items, (r) => r.destination_id));
          }
          setDestsRatedMap(drMap);
        }

        // 6) Badges
        try {
          const { data: badgeCounts, error: bErr } = await supabase
            .from('lb_user_badges_counts')
            .select('user_id, badges_count');
          if (!bErr && Array.isArray(badgeCounts)) setBadgesCountMap(rowsToMap(badgeCounts, 'user_id', 'badges_count'));
          else setBadgesCountMap(new Map());
        } catch {
          setBadgesCountMap(new Map());
        }

        // 7) Weekly streaks
        try {
          const { data: streakRows, error: sErr } = await supabase
            .from('crawl_weekly_streak')
            .select('user_id, current_streak_weeks');
          if (!sErr && Array.isArray(streakRows)) {
            const filtered = streakRows.filter((r) => r.user_id !== ADMIN_ID);
            setStreakWeeksMap(rowsToMap(filtered, 'user_id', 'current_streak_weeks'));
          } else {
            setStreakWeeksMap(new Map());
          }
        } catch {
          setStreakWeeksMap(new Map());
        }
      } catch (e) {
        setError(e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Social Feed queries (v_social_feed) ----------
  const fetchFeedPage = useCallback(
    async ({ reset = false } = {}) => {
      try {
        setFeedLoading(true);
        setFeedError('');

        const page = reset ? 0 : feedPage;
        const from = page * 10;
        const to = from + 9;

        let q = supabase
          .from('v_social_feed')
          .select(
          'user_id, weight_score, created_at, destination_id, destination_name, destination_city, destination_state_id, username'  
          )
          .neq('user_id', ADMIN_ID)
          .order('created_at', { ascending: false })
          .range(from, to);

        const scope = feedScope;

        if (scope === 'state' && stateId) q = q.eq('destination_state_id', stateId);

        const { data, error: qErr } = await q;
        if (qErr) throw qErr;

        const rowsRaw = Array.isArray(data) ? data : [];
        const rows = await attachTokenFlagsToFeedRows(rowsRaw);
        const merged = reset ? rows : [...(feedRows || []), ...rows];

        setFeedRows(merged);
        setFeedHasMore(rows.length === 10);
        setFeedPage(reset ? 1 : page + 1);
      } catch (e) {
        setFeedError(e?.message ?? String(e));
      } finally {
        setFeedLoading(false);
      }
    },
    [feedPage, feedRows, feedScope, stateId]
  );

  useEffect(() => {
    if (mode !== 'feed') return;
    if (feedScope === 'friends') return;
    if (feedScope === 'state' && !stateId && stateDetecting) return;
    fetchFeedPage({ reset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, feedScope, stateId, stateDetecting]);

  // ---------- STATE leaderboards data ----------
  useEffect(() => {
    let alive = true;
    (async () => {
      if (lbScope !== 'state') return;
      if (!stateId) {
        if (alive) {
          setStateRatings([]);
          setTotalDestinationsState(null);
          setDestsRatedStateMap(new Map());
        }
        return;
      }

      try {
        setStateRatingsLoading(true);

        const { data, error } = await supabase
          .from('v_social_feed')
          .select('user_id, destination_id, weight_score, created_at, destination_state_id')
          .neq('user_id', ADMIN_ID)
          .eq('destination_state_id', stateId)
          .order('created_at', { ascending: false });

        if (error) throw error;
        if (!alive) return;

        const rows = Array.isArray(data) ? data : [];
        setStateRatings(rows);

        try {
          const { count } = await supabase
            .from('destinations')
            .select('id', { count: 'exact', head: true })
            .eq('state_id', stateId);
          if (!alive) return;
          setTotalDestinationsState(typeof count === 'number' ? count : null);
        } catch {
          if (alive) setTotalDestinationsState(null);
        }

        const byU = groupBy(rows, (r) => r.user_id);
        const m = new Map();
        for (const [uid, items] of byU) m.set(uid, distinctCount(items, (r) => r.destination_id));
        setDestsRatedStateMap(m);
      } catch {
        if (alive) {
          setStateRatings([]);
          setTotalDestinationsState(null);
          setDestsRatedStateMap(new Map());
        }
      } finally {
        if (alive) setStateRatingsLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [lbScope, stateId]);

  // ---------- names ----------
  const nameOf = (uid) => {
    const meta = usersMap.get(uid);
    const nm = meta?.username?.trim?.();
    return nm && nm.length > 0 ? nm : `Winglet_${String(uid || '').slice(0, 6)}`;
  };
  const xpOf = (uid) => usersMap.get(uid)?.xp ?? 0;
  const levelOf = (uid) => usersMap.get(uid)?.level ?? null;

  // ---------- leaderboards scoped ratings ----------
  const ratingsForBoards = useMemo(() => {
    if (lbScope === 'state') return stateRatings;
    return ratings;
  }, [lbScope, stateRatings, ratings]);

  const ratingsByUserScoped = useMemo(() => groupBy(ratingsForBoards, (r) => r.user_id), [ratingsForBoards]);

  const usersInScope = useMemo(() => {
    const ids = new Set((ratingsForBoards || []).map((r) => r.user_id).filter(Boolean));
    return ids;
  }, [ratingsForBoards]);

  // ---------- Social Feed -> open rating details ----------
  const openRatingDetails = useCallback(
    async (row) => {
      if (!row?.user_id || !row?.destination_id) return;

      setRatingModalOpen(true);
      setRatingModalLoading(true);
      setRatingModalError('');
      setRatingDetail(null);

      try {
        // NOTE: Avoid joins because joins can be blocked by RLS even when base rows are readable.
        const { data, error } = await supabase
          .from('destination_ratings')
          .select('id, user_id, destination_id, created_at, crispiness, sauce, meat, overall, weight_score, tag_id, is_buffacoin')
          .eq('user_id', row.user_id)
          .eq('destination_id', row.destination_id)
          .order('created_at', { ascending: false })
          .limit(1);

        if (error) throw new Error(error.message || 'Failed to load rating details.');

        const picked = Array.isArray(data) ? data[0] : null;

        if (!picked) {
          throw new Error(
            'Rating details are private right now. (Your feed is public, but the detailed breakdown is not readable yet.)'
          );
        }

        setRatingDetail({
          id: picked.id,
          created_at: picked.created_at,
          userName: (row?.username || '').trim() || nameOf(row.user_id),
          destinationName: row?.destination_name || 'Unknown spot',
          destinationCity: row?.destination_city || '',
          crispiness: picked.crispiness,
          sauce: picked.sauce,
          meat: picked.meat,
          overall: picked.overall,
          tag_id: picked.tag_id,
          weight_score: picked.weight_score,
          is_buffacoin: !!picked.is_buffacoin,
        });
      } catch (e) {
        setRatingModalError(e?.message ?? String(e));
      } finally {
        setRatingModalLoading(false);
      }
    },
    [nameOf]
  );

  const calcWeightScore = (r) => {
  const crisp = Number(r?.crispiness ?? 0);
  const sauce = Number(r?.sauce ?? 0);
  const meat = Number(r?.meat ?? 0);
  const overall = Number(r?.overall ?? 0);

  const raw = crisp * 2 + sauce * 2 + meat * 2 + overall * 4; // max 100
    return Number.isFinite(raw) ? Math.round(raw) : null;
  };


  // ---------- leaderboards ----------
  const lbHighestLevel = useMemo(() => {
    const arr = [];
    for (const [uid, meta] of usersMap) {
      if (usersInScope.size && !usersInScope.has(uid)) continue;
      arr.push({
        uid,
        xp: meta?.xp ?? 0,
        value: meta?.level ?? 0,
        hasLevel: meta?.level != null,
      });
    }

    const anyHasLevel = arr.some((x) => x.hasLevel);

    arr.sort((a, b) => {
      if (anyHasLevel) return b.value - a.value || b.xp - a.xp || nameOf(a.uid).localeCompare(nameOf(b.uid));
      return b.xp - a.xp || nameOf(a.uid).localeCompare(nameOf(b.uid));
    });

    return arr.slice(0, 25).map((x) => ({ ...x, displayName: nameOf(x.uid) }));
  }, [usersMap, usersInScope, nameOf]);

  const lbWeeklyStreak = useMemo(() => {
    const entries = [];

    if (lbScope === 'all' && streakWeeksMap.size > 0) {
      for (const [uid] of usersMap) {
        if (usersInScope.size && !usersInScope.has(uid)) continue;
        entries.push({ uid, value: streakWeeksMap.get(uid) ?? 0 });
      }
    } else {
      for (const [uid, items] of ratingsByUserScoped) {
        const dates = items.map((r) => r.created_at).filter(Boolean);
        entries.push({ uid, value: longestWeeklyStreak(dates) });
      }
    }

    entries.sort((a, b) => b.value - a.value || nameOf(a.uid).localeCompare(nameOf(b.uid)));
    return entries.slice(0, 25).map((x) => ({ ...x, displayName: nameOf(x.uid) }));
  }, [lbScope, streakWeeksMap, usersMap, ratingsByUserScoped, usersInScope, nameOf]);

  const lbBadgesEarned = useMemo(() => {
    const entries = [];
    for (const [uid, count] of badgesCountMap) {
      if (usersInScope.size && !usersInScope.has(uid)) continue;
      entries.push({ uid, value: count });
    }
    entries.sort((a, b) => b.value - a.value || nameOf(a.uid).localeCompare(nameOf(b.uid)));
    return entries.slice(0, 25).map((x) => ({ ...x, displayName: nameOf(x.uid) }));
  }, [badgesCountMap, usersInScope, usersMap, nameOf]);

  const lbPctDestinationsRated = useMemo(() => {
    const tot = lbScope === 'state' ? totalDestinationsState : totalDestinations;
    if (!tot) return [];

    const map = lbScope === 'state' ? destsRatedStateMap : destsRatedMap;

    const entries = [];
    for (const [uid] of usersMap) {
      if (usersInScope.size && !usersInScope.has(uid)) continue;
      const rated = map.get(uid) || 0;
      const value = (rated / tot) * 100;
      entries.push({ uid, value, rated, total: tot });
    }

    entries.sort((a, b) => b.value - a.value || b.rated - a.rated || nameOf(a.uid).localeCompare(nameOf(b.uid)));
    return entries.slice(0, 25).map((x) => ({ ...x, displayName: nameOf(x.uid) }));
  }, [lbScope, totalDestinations, totalDestinationsState, destsRatedMap, destsRatedStateMap, usersMap, usersInScope, nameOf]);

  const lbMostCrawlsIn24h = useMemo(() => {
    if (!crawlsOk) return [];
    if (lbScope === 'state') return [];

    const entries = [];
    for (const [uid, agg] of crawlsByUser) {
      const completed = (agg.crawls || []).filter((c) => (c.status || '').toLowerCase() === 'completed');
      const ts = completed
        .map((c) => new Date(c.end_time || c.start_time).getTime())
        .filter((n) => Number.isFinite(n))
        .sort((a, b) => a - b);

      let i = 0;
      let best = 0;
      for (let j = 0; j < ts.length; j++) {
        const tJ = ts[j];
        while (ts[i] && tJ - ts[i] > 24 * 60 * 60 * 1000) i++;
        best = Math.max(best, j - i + 1);
      }
      entries.push({ uid, value: best });
    }

    entries.sort((a, b) => b.value - a.value || nameOf(a.uid).localeCompare(nameOf(b.uid)));
    return entries.slice(0, 25).map((x) => ({ ...x, displayName: nameOf(x.uid) }));
  }, [crawlsOk, crawlsByUser, usersMap, lbScope, nameOf]);

  const lbMostRestaurantsIn24h = useMemo(() => {
    const entries = [];
    for (const [uid, items] of ratingsByUserScoped) {
      const best = maxDistinctIn24h(items, (r) => r.destination_id);
      entries.push({ uid, value: best });
    }
    entries.sort((a, b) => b.value - a.value || nameOf(a.uid).localeCompare(nameOf(b.uid)));
    return entries.slice(0, 25).map((x) => ({ ...x, displayName: nameOf(x.uid) }));
  }, [ratingsByUserScoped, nameOf]);

  // ---------- modal handling (leaderboards drilldown) ----------
  const openDrilldown = (title, items, fmtValue, fmtSub) => {
    setModalTitle(title);
    setModalFormatter({ fmtValue, fmtSub });
    setModalItems(
      (items || []).map((it, i) => ({
        key: `${title}-${it.uid}-${i}`,
        rank: i + 1,
        displayName: it.displayName,
        raw: it,
      }))
    );
    setModalOpen(true);
  };

  const fmtPct = (it) => `${(it.value ?? 0).toFixed(1)}%`;

  // ---------- Social Feed row render ----------
  const renderFeedRow = (row, idx) => {
  const uname = (row?.username || '').trim() || `Winglet_${String(row?.user_id || '').slice(0, 6)}`;
  const destName = row?.destination_name || 'Unknown spot';
  const city = row?.destination_city ? ` • ${row.destination_city}` : '';
  const isToken = !!row?.is_buffacoin;

  const score = typeof row?.weight_score === 'number' ? row.weight_score : null;
  const scoreText = score != null ? `${score.toFixed(1)}` : '—';

  return (
      <TouchableOpacity
        key={`${row?.created_at || idx}-${row?.user_id || idx}-${row?.destination_id || idx}`}
        style={styles.feedRow}
        activeOpacity={0.75}
        onPress={() => openRatingDetails(row)}
      >
        <Avatar.Text
          size={34}
          label={initials(uname)}
          style={{
            backgroundColor: theme.colors.elevation?.level1 ?? (theme.dark ? '#2a2a2a' : '#f1f3f5'),
          }}
        />
        <View style={{ flex: 1, gap: 2 }}>
          <View style={styles.feedTopLine}>
            <Text style={[styles.feedUser, { color: textColor }]} numberOfLines={1}>
              {uname}
            </Text>
            <Text style={[styles.feedTime, { color: textColor }]} numberOfLines={1}>
              {fmtShortDate(row?.created_at)}
            </Text>
          </View>

            <Text style={[styles.feedDest, { color: textColor }]} numberOfLines={2}>
            <Text style={{ fontWeight: '800' }}>{destName}</Text>
            {city}
          </Text>
        </View>
        <View
          style={[
            styles.feedScorePill,
            { backgroundColor: theme.colors.elevation?.level1 ?? 'rgba(255,255,255,0.06)' },
          ]}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {isToken ? <TokenIcon size={18} /> : null}
            <Text style={[styles.feedScore, { color: theme.colors.onSurface }]}>{scoreText}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const showNewAppEmpty = feedScope === 'state' && !feedLoading && !feedError && (feedRows?.length || 0) === 0;

  // ---------- render ----------
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.headerWrap}>
          <Text variant="headlineSmall" style={[styles.title, { color: textColor }]}>
            Social
          </Text>

          <TogglePills
            size="lg"
            value={mode}
            onChange={(v) => setMode(v)}
            options={[
              { label: 'Social Feed', value: 'feed' },
              { label: 'Leaderboards', value: 'leaderboards' },
            ]}
          />
        </View>

        {mode === 'feed' ? (
          <>
            <View style={styles.subHeaderWrap}>
              <TogglePills
                value={feedScope}
                onChange={(v) => setFeedScope(v)}
                options={[
                  { label: stateDetecting ? 'Locating…' : stateName, value: 'state', disabled: stateDetecting },
                  { label: 'All', value: 'all' },
                  { label: 'Friends (Soon)', value: 'friends', disabled: true },
                ]}
              />
            </View>

            {feedError ? (
              <Card style={[styles.card, { backgroundColor: theme.colors.elevation?.level2 ?? (theme.dark ? '#1f1f1f' : '#fff') }]}>
                <Card.Content>
                  <Text style={{ color: theme.colors.error }}>Error: {feedError}</Text>
                </Card.Content>
              </Card>
            ) : null}

            {feedLoading && (feedRows?.length || 0) === 0 ? (
              <View style={{ alignItems: 'center', padding: 24 }}>
                <ActivityIndicator />
                <Text style={{ marginTop: 8, color: textColor }}>Loading the latest wing action…</Text>
              </View>
            ) : null}

            {showNewAppEmpty ? (
              <Card style={[styles.card, { backgroundColor: theme.colors.elevation?.level2 ?? (theme.dark ? '#1f1f1f' : '#fff') }]}>
                <Card.Content style={{ gap: 10 }}>
                  <Text style={[styles.emptyTitle, { color: textColor }]}>Nothing yet in {stateName}…</Text>
                  <Text style={{ color: textColor, opacity: 0.85, lineHeight: 20 }}>
                    BuffaGo is still new — but once word spreads, this feed is going to be 🔥.
                    {'\n\n'}
                    Be the first to make it pop: get out, rate some wings… and tell your friends.
                  </Text>
                  <Button mode="contained" onPress={() => fetchFeedPage({ reset: true })} style={{ borderRadius: 14 }}>
                    Refresh
                  </Button>
                </Card.Content>
              </Card>
            ) : null}

            {(feedRows?.length || 0) > 0 ? (
              <Card style={[styles.card, { backgroundColor: theme.colors.elevation?.level2 ?? (theme.dark ? '#1f1f1f' : '#fff') }]}>
                <Card.Title
                  title={feedScope === 'all' ? 'Latest Ratings' : `Latest in ${stateName}`}
                  titleVariant="titleMedium"
                  titleStyle={{ color: textColor }}
                />
                <Card.Content style={{ gap: 10 }}>
                  {feedRows.map(renderFeedRow)}

                  <View style={{ height: 4 }} />

                  {feedHasMore ? (
                    <Button
                      mode="contained-tonal"
                      onPress={() => fetchFeedPage({ reset: false })}
                      style={{ borderRadius: 14 }}
                      loading={feedLoading}
                      disabled={feedLoading}
                    >
                      Load more
                    </Button>
                  ) : (
                    <Text style={{ color: textColor, opacity: 0.7, textAlign: 'center' }}>That’s the latest for now 🐔</Text>
                  )}
                </Card.Content>
              </Card>
            ) : null}
          </>
        ) : (
          <>
            <View style={styles.subHeaderWrap}>
              <TogglePills
                value={lbScope}
                onChange={(v) => setLbScope(v)}
                options={[
                  { label: stateId ? stateName : 'Your State', value: 'state', disabled: !stateId },
                  { label: 'All', value: 'all' },
                  { label: 'Friends (Soon)', value: 'friends', disabled: true },
                ]}
              />

              {lbScope === 'state' && !stateId ? (
                <Text style={{ color: textColor, opacity: 0.7, marginTop: 6, textAlign: 'center' }}>
                  Turn on location to unlock state leaderboards.
                </Text>
              ) : null}

              {lbScope === 'friends' ? (
                <Text style={{ color: textColor, opacity: 0.7, marginTop: 6, textAlign: 'center' }}>
                  Friends leaderboards are coming soon.
                </Text>
              ) : null}
            </View>

            {lbScope === 'friends' ? null : loading || (lbScope === 'state' && stateRatingsLoading) ? (
              <View style={{ alignItems: 'center', padding: 24 }}>
                <ActivityIndicator />
                <Text style={{ marginTop: 8, color: textColor }}>Loading leaderboards…</Text>
              </View>
            ) : error ? (
              <Card style={[styles.card, { backgroundColor: theme.colors.elevation?.level2 ?? (theme.dark ? '#1f1f1f' : '#fff') }]}>
                <Card.Content>
                  <Text style={{ color: theme.colors.error }}>Error: {error}</Text>
                </Card.Content>
              </Card>
            ) : (
              <>
                <LeaderCard
                  title={lbScope === 'state' ? 'Highest Level (Local Legends)' : 'Highest Level'}
                  items={lbHighestLevel}
                  formatValue={(it) => (it.value ? `Lv ${it.value}` : '—')}
                  formatSub={(it) => `${xpOf(it.uid).toLocaleString()} XP`}
                  onView={() =>
                    openDrilldown(
                      'Highest Level',
                      lbHighestLevel,
                      (it) => `${levelOf(it.uid) ? `Level ${levelOf(it.uid)}` : 'Level —'} • ${xpOf(it.uid).toLocaleString()} XP`,
                      null
                    )
                  }
                  onUserPress={goToJourney}
                />

                <LeaderCard
                  title="Badges Earned"
                  items={lbBadgesEarned}
                  formatValue={(it) => `${it.value}`}
                  formatSub={(it) => `${it.value} badge${it.value === 1 ? '' : 's'}`}
                  onView={() => openDrilldown('Badges Earned', lbBadgesEarned, (it) => `${it.value} badge${it.value === 1 ? '' : 's'}`, null)}
                  onUserPress={goToJourney}
                />

                <LeaderCard
                  title="Longest Weekly Streak"
                  items={lbWeeklyStreak}
                  formatValue={(it) => `${it.value}w`}
                  formatSub={(it) => `${it.value} week${it.value === 1 ? '' : 's'}`}
                  onView={() => openDrilldown('Longest Weekly Streak', lbWeeklyStreak, (it) => `${it.value} week${it.value === 1 ? '' : 's'}`, null)}
                  onUserPress={goToJourney}
                />

                <LeaderCard
                  title={lbScope === 'state' ? 'Highest % of Destinations Rated (State)' : 'Highest % of Destinations Rated'}
                  items={lbPctDestinationsRated}
                  formatValue={fmtPct}
                  formatSub={(it) => `${(it.value ?? 0).toFixed(1)}% • ${it.rated}/${it.total}`}
                  onView={() => openDrilldown('Highest % Destinations Rated', lbPctDestinationsRated, (it) => `${(it.value ?? 0).toFixed(1)}% • ${it.rated}/${it.total}`, null)}
                  onUserPress={goToJourney}
                  emptyText={lbScope === 'state' ? 'Not enough destination data in this state yet.' : undefined}
                />

                {lbScope === 'all' ? (
                  <LeaderCard
                    title="Crawls in 24 Hours"
                    items={lbMostCrawlsIn24h}
                    formatValue={(it) => `${it.value}`}
                    onView={() => openDrilldown('Most Crawls Completed in 24h', lbMostCrawlsIn24h, (it) => `${it.value} in 24h`, null)}
                    onUserPress={goToJourney}
                  />
                ) : null}

                <LeaderCard
                  title="Restaurants Rated in 24 Hours"
                  items={lbMostRestaurantsIn24h}
                  formatValue={(it) => `${it.value}`}
                  onView={() => openDrilldown('Most Restaurants Rated in 24h', lbMostRestaurantsIn24h, (it) => `${it.value} in 24h`, null)}
                  onUserPress={goToJourney}
                />
              </>
            )}
          </>
        )}

        {/* Leaderboards Drilldown modal */}
        <Portal>
          <Dialog visible={modalOpen} onDismiss={() => setModalOpen(false)} style={[styles.dialog, { backgroundColor: surface }]}>
            <Dialog.Title style={{ textAlign: 'center', color: textColor }}>{modalTitle}</Dialog.Title>

            <Dialog.Content style={{ paddingHorizontal: 0 }}>
              {modalItems.length === 0 ? (
                <Text style={{ color: textColor, paddingHorizontal: 16 }}>No data.</Text>
              ) : (
                <ScrollView
                  style={{ maxHeight: 400 }}
                  contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 4 }}
                  showsVerticalScrollIndicator
                >
                  {modalItems.map((it, idx) => (
                  <View key={it.key}>
                    <TouchableOpacity
                      style={styles.drillRow}
                      activeOpacity={0.75}
                      onPress={() => goToJourney(it.raw?.uid)}
                    >
                      <Medal rank={it.rank} size="sm" />
                      <Avatar.Text
                        size={30}
                        label={initials(it.displayName)}
                        style={{
                          backgroundColor: theme.colors.elevation?.level1 ?? (theme.dark ? '#2a2a2a' : '#f1f3f5'),
                        }}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.drillName, { color: textColor }]} numberOfLines={1}>
                          {it.displayName}
                        </Text>
                      </View>
                      <Text style={[styles.drillValue, { color: textColor }]} numberOfLines={1}>
                        {modalFormatter.fmtValue ? modalFormatter.fmtValue(it.raw) : ''}
                      </Text>
                    </TouchableOpacity>
                
                    {idx < modalItems.length - 1 ? <Divider style={{ marginVertical: 8 }} /> : null}
                  </View>
                ))}
                </ScrollView>
              )}
            </Dialog.Content>

            <Dialog.Actions>
              <Button onPress={() => setModalOpen(false)}>Close</Button>
            </Dialog.Actions>
          </Dialog>
        </Portal>

        {/* Social Feed Rating Details modal */}
        <Portal>
          <Dialog
            visible={ratingModalOpen}
            onDismiss={() => {
              setRatingModalOpen(false);
              setRatingModalError('');
              setRatingDetail(null);
            }}
            style={[styles.dialog, { backgroundColor: surface }]}
          >
            <Dialog.Title style={{ textAlign: 'center', color: textColor }}>Rating Details</Dialog.Title>

            <Dialog.Content>
              {ratingModalLoading ? (
                <View style={{ alignItems: 'center', paddingVertical: 10 }}>
                  <ActivityIndicator />
                  <Text style={{ marginTop: 8, color: textColor, opacity: 0.8 }}>Loading…</Text>
                </View>
              ) : ratingModalError ? (
                <Text style={{ color: theme.colors.error }}>Error: {ratingModalError}</Text>
              ) : ratingDetail ? (
                <View style={{ gap: 10 }}>
                  <View style={{ gap: 2 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
                      {ratingDetail.is_buffacoin ? <TokenIcon size={16} /> : null}
                      <Text style={{ color: textColor, fontWeight: '900', flexShrink: 1 }} numberOfLines={2}>
                        {ratingDetail.destinationName}
                      </Text>
                    </View>
                    <Text style={{ color: textColor, opacity: 0.75 }} numberOfLines={1}>
                      {ratingDetail.destinationCity ? `${ratingDetail.destinationCity} • ` : ''}
                      {ratingDetail.userName} • {fmtShortDate(ratingDetail.created_at)}
                    </Text>
                  </View>

                  <View style={styles.detailGrid}>
                    <View style={styles.detailCell}>
                      <Text style={[styles.detailLabel, { color: textColor }]}>Crispiness</Text>
                      <Text style={[styles.detailValue, { color: textColor }]}>
                        {typeof ratingDetail.crispiness === 'number' ? ratingDetail.crispiness.toFixed(1) : '—'}
                      </Text>
                    </View>
                    <View style={styles.detailCell}>
                      <Text style={[styles.detailLabel, { color: textColor }]}>Sauce</Text>
                      <Text style={[styles.detailValue, { color: textColor }]}>
                        {typeof ratingDetail.sauce === 'number' ? ratingDetail.sauce.toFixed(1) : '—'}
                      </Text>
                    </View>
                    <View style={styles.detailCell}>
                      <Text style={[styles.detailLabel, { color: textColor }]}>Meat</Text>
                      <Text style={[styles.detailValue, { color: textColor }]}>
                        {typeof ratingDetail.meat === 'number' ? ratingDetail.meat.toFixed(1) : '—'}
                      </Text>
                    </View>
                    <View style={styles.detailCell}>
                      <Text style={[styles.detailLabel, { color: textColor }]}>Overall</Text>
                      <Text style={[styles.detailValue, { color: textColor }]}>
                        {typeof ratingDetail.overall === 'number' ? ratingDetail.overall.toFixed(1) : '—'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.detailBigScore}>
                    <Text style={{ color: textColor, opacity: 0.8, fontWeight: '800' }}>BuffaGo Score</Text>
                    <Text style={{ color: textColor, fontWeight: '900', fontSize: 22 }}>
                        {(() => {
                          const ws =
                            typeof ratingDetail.weight_score === 'number'
                              ? ratingDetail.weight_score
                              : calcWeightScore(ratingDetail);
                          return typeof ws === 'number' ? ws.toFixed(0) : '—';
                        })()}
                    </Text>
                  </View>
                </View>
              ) : (
                <Text style={{ color: textColor, opacity: 0.75 }}>No details found.</Text>
              )}
            </Dialog.Content>

            <Dialog.Actions>
              <Button
                onPress={() => {
                  setRatingModalOpen(false);
                  setRatingModalError('');
                  setRatingDetail(null);
                }}
              >
                Close
              </Button>
            </Dialog.Actions>
          </Dialog>
        </Portal>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 20, gap: 14 },
  headerWrap: { gap: 12 },
  subHeaderWrap: { gap: 10 },
  title: { fontWeight: '800' },

  card: { borderRadius: 18, elevation: 1 },
  muted: { opacity: 0.7 },

  // Pills
  pillsWrap: {
    flexDirection: 'row',
    borderRadius: 16,
    padding: 4,
    gap: 6,
  },
  pill: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 14,
    minWidth: 92,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillLg: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 16,
  },
  pillText: {
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.2,
  },
  pillTextLg: {
    fontSize: 13,
    letterSpacing: 0.3,
  },

  // Podium rows
  podiumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  medal: {
    minWidth: 28,
    textAlign: 'center',
    includeFontPadding: false,
  },
  avatar: {},
  podiumName: { fontWeight: '700' },
  podiumSub: {
    opacity: 0.7,
    fontSize: 12,
    marginTop: 2,
  },
  podiumValue: { fontWeight: '800' },

  // Card bottom
  cardBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  viewAllBtn: { borderRadius: 12 },

  // Feed
  feedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  feedTopLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  feedUser: { fontWeight: '900', flex: 1 },
  feedTime: { opacity: 0.65, fontSize: 12, flexShrink: 0 },
  feedDest: { opacity: 0.9 },
  feedScorePill: {
    minWidth: 56,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.95,
    flexShrink: 0,
  },
  feedScore: { fontWeight: '900' },
  emptyTitle: { fontWeight: '900', fontSize: 16 },

  // Drilldown / dialogs
  dialog: {
    borderRadius: 16,
    alignSelf: 'center',
    width: '92%',
    maxWidth: 520,
  },
  drillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    gap: 10,
  },
  drillName: { fontWeight: '700' },
  drillValue: {
    fontWeight: '800',
    marginLeft: 8,
    maxWidth: 160,
    textAlign: 'right',
    flexShrink: 0,
  },

  // Rating detail grid
  detailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  detailCell: {
    width: '48%',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    opacity: 0.95,
  },
  detailLabel: { fontWeight: '800', opacity: 0.75, fontSize: 12 },
  detailValue: { fontWeight: '900', fontSize: 16, marginTop: 2 },

  detailBigScore: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.95,
  },
});
