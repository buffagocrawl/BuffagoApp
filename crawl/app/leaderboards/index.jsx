// app/Leaderboards.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
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
  Chip,
  useTheme
} from 'react-native-paper';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase.js';
import { filterSociallyVisibleRows } from '../../lib/socialVisibility';

const ADMIN_ID = '23898359-306a-4dd3-91f0-da66da19ccfc';
const LEVEL_XP_STEP = 100; // 1 level per 100 XP

const TOKEN_SRC = require('../../assets/Buffago-token.png');

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
  let best = 1,
    cur = 1;
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

const computeLevelFromXp = (xp) =>
  1 + Math.floor((Number(xp) || 0) / LEVEL_XP_STEP);

const maxDistinctIn24h = (rows, keyFn) => {
  const times = (rows || [])
    .map((r) => ({
      t: new Date(
        r.created_at || r.inserted_at || r.createdAt
      ).getTime(),
      k: keyFn(r),
    }))
    .filter((x) => Number.isFinite(x.t))
    .sort((a, b) => a.t - b.t);
  let i = 0,
    best = 0;
  const windowKeys = new Map();
  for (let j = 0; j < times.length; j++) {
    const tJ = times[j].t;
    windowKeys.set(
      times[j].k,
      (windowKeys.get(times[j].k) ?? 0) + 1
    );
    while (tJ - times[i].t > 24 * 60 * 60 * 1000) {
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

const TokenIcon = ({ size = 16 }) => {
  // You already have TOKEN_SRC at the top, so just use it.
  if (!TOKEN_SRC) return <Text style={{ fontSize: size }}>🪙</Text>;

  return (
    <Image
      source={TOKEN_SRC}
      style={{ width: size, height: size }}
      resizeMode="contain"
    />
  );
};

// ---------- tiny UI atoms ----------
// FIXED: no tiny fixed width; use minWidth + clip so #10–#25 display
const Medal = ({ rank, size = 'md' }) => {
  const map = { 1: '🥇', 2: '🥈', 3: '🥉' };
  const cfg = {
    sm: { fontSize: 14, lineHeight: 16 },
    md: { fontSize: 18, lineHeight: 20 },
    lg: { fontSize: 20, lineHeight: 22 },
  }[size] || {};
  return (
    <Text
      style={[styles.medal, cfg]}
      numberOfLines={1}
      ellipsizeMode="clip"
    >
      {map[rank] || `#${rank}`}
    </Text>
  );
};

const initials = (name) => {
  if (!name) return '??';
  const parts = name.split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? '';
  const b = parts[1]?.[0] ?? '';
  return (a + b).toUpperCase();
};

const UserChip = ({ name, value, onPress }) => {
  const theme = useTheme();
  const chipBg =
    theme.colors.elevation?.level1 ??
    (theme.dark ? '#202020' : '#fff');
  const textColor = theme.colors.onSurface;
  return (
    <Chip
      mode="flat"
      onPress={onPress}
      style={[styles.userChip, { backgroundColor: chipBg }]}
      compact
      textStyle={{ color: textColor }}
    >
      <Text
        style={[styles.userChipText, { color: textColor }]}
        numberOfLines={1}
      >
        {name}
      </Text>
      {typeof value !== 'undefined' ? (
        <Text
          style={[
            styles.userChipValue,
            { color: textColor },
          ]}
        >
          {' '}
          • {value}
        </Text>
      ) : null}
    </Chip>
  );
};

const PodiumRow = ({ rank, name, value, sub, onPress }) => {
  const theme = useTheme();
  const avatarBg =
    theme.colors.elevation?.level1 ??
    (theme.dark ? '#2a2a2a' : '#f1f3f5');
  const textColor = theme.colors.onSurface;
  return (
    <TouchableOpacity
      style={styles.podiumRow}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Medal rank={rank} />
      <Avatar.Text
        size={30}
        label={initials(name)}
        style={[
          styles.avatar,
          { backgroundColor: avatarBg },
        ]}
      />
      <View style={{ flex: 1 }}>
        <Text
          style={[styles.podiumName, { color: textColor }]}
          numberOfLines={1}
        >
          {name}
        </Text>
        {sub ? (
          <Text
            style={[
              styles.podiumSub,
              { color: textColor },
            ]}
            numberOfLines={1}
          >
            {sub}
          </Text>
        ) : null}
      </View>
      {typeof value !== 'undefined' ? (
        <Text
          style={[
            styles.podiumValue,
            { color: textColor },
          ]}
          numberOfLines={1}
        >
          {value}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
};

// A single leaderboard card with a podium preview and “View Top 25”
const LeaderCard = ({
  title,
  items,
  formatValue,
  formatSub,
  onView,
  onUserPress,
}) => {
  const theme = useTheme();
  const cardBg =
    theme.colors.elevation?.level2 ??
    (theme.dark ? '#1f1f1f' : '#ffffff');
  const titleColor = theme.colors.onSurface;
  const top3 = (items || []).slice(0, 3);
  return (
    <Card
      style={[styles.card, { backgroundColor: cardBg }]}
    >
      <Card.Title
        title={title}
        titleVariant="titleMedium"
        titleStyle={{ color: titleColor }}
      />
      <Card.Content style={{ gap: 10 }}>
        {top3.length === 0 ? (
          <Text
            style={[
              styles.muted,
              { color: theme.colors.onSurface },
            ]}
          >
            No data yet.
          </Text>
        ) : (
          top3.map((it, i) => (
            <PodiumRow
              key={`${title}-${it.uid}-${i}`}
              rank={i + 1}
              name={it.displayName}
              value={
                formatValue ? formatValue(it) : it.value
              }
              sub={
                formatSub ? formatSub(it) : undefined
              }
              onPress={
                onUserPress
                  ? () => onUserPress(it.uid)
                  : undefined
              }
            />
          ))
        )}
        <View style={styles.cardBottomRow}>
          <Button
            mode="contained-tonal"
            onPress={onView}
            style={styles.viewAllBtn}
          >
            View Top 25
          </Button>
        </View>
      </Card.Content>
    </Card>
  );
};

// ---------- screen ----------
export default function Leaderboards() {
  const theme = useTheme();
  const textColor = theme.colors.onSurface;
  const surface = theme.colors.surface;
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Always-readable via your RLS: ratings
  const [ratings, setRatings] = useState([]);

  // Users meta (username/xp) for labels + level metric
  const [usersMap, setUsersMap] = useState(
    new Map()
  ); // user_id -> { username, xp }

  // Current viewer (for guest vs user context on the journey screen)
  const [viewerId, setViewerId] = useState(null);

  // Crawls aggregates (may be blocked by RLS on crawls; we try/fallback)
  const [crawlsOk, setCrawlsOk] = useState(false);
  const [crawlsByUser, setCrawlsByUser] = useState(
    new Map()
  ); // user_id -> { total, completed, crawls: [] }

  // Totals (ALL routes / ALL destinations)
  const [totalRoutes, setTotalRoutes] = useState(0);
  const [totalDestinations, setTotalDestinations] =
    useState(0);

  // Per-user aggregates for the “global %” boards
  const [routesCompletedMap, setRoutesCompletedMap] =
    useState(new Map());
  const [destsRatedMap, setDestsRatedMap] = useState(
    new Map()
  );

  // Badges Earned per user
  const [badgesCountMap, setBadgesCountMap] = useState(
    new Map()
  ); // user_id -> count

  // Weekly streaks from view
  const [streakWeeksMap, setStreakWeeksMap] = useState(
    new Map()
  ); // user_id -> current_streak_weeks

  // Drilldown modal
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalItems, setModalItems] = useState([]);
  const [modalFormatter, setModalFormatter] = useState({
    fmtValue: null,
    fmtSub: null,
  });

  // Grab viewer session (so the journey screen can distinguish guest vs self)
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
        const uid = data?.session?.user?.id ?? null;
        setViewerId(uid);
      } catch {
        if (alive) setViewerId(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError('');

        const { data: visibleUsers, error: visibleErr } = await supabase
          .from('socially_visible_users')
          .select('user_id, username');

        if (visibleErr) throw visibleErr;

        const visibleIds = new Set((visibleUsers || []).map((u) => u.user_id).filter(Boolean));

        // 1) destination_ratings (exclude guests/admin)
        const { data: dr, error: e1 } = await supabase
          .from('socially_visible_destination_ratings')
          .select(
            'user_id, destination_id, crawl_id, tag_id, weight_score, created_at'
          )
          .not('user_id', 'is', null)
          .neq('user_id', ADMIN_ID);
        if (e1) throw e1;
        setRatings(Array.isArray(dr) ? dr : []);

        // 2) users (for username + xp) — exclude admin
        const { data: usersData, error: eUsers } =
          await supabase
            .from('users')
            .select('user_id, username, xp')
            .neq('user_id', ADMIN_ID);

        const map = new Map();
        const socialUsersData = Array.isArray(usersData)
          ? filterSociallyVisibleRows(usersData, visibleIds)
          : [];
        if (!eUsers && Array.isArray(socialUsersData)) {
          for (const u of socialUsersData) {
            map.set(u.user_id, {
              username: u.username || null,
              xp: u.xp ?? 0,
            });
          }
        } else {
          // Fallback: only load users that appear in ratings
          const ids = Array.from(
            new Set((dr || []).map((r) => r.user_id))
          );
          if (ids.length) {
            const { data: someUsers } = await supabase
              .from('users')
              .select('user_id, username, xp')
              .in('user_id', ids);
            for (const u of filterSociallyVisibleRows(someUsers || [], visibleIds)) {
              map.set(u.user_id, {
                username: u.username || null,
                xp: u.xp ?? 0,
              });
            }
          }
        }
        setUsersMap(map);

        // 3) Crawls (optional — if blocked, mark unavailable)
        try {
          const { data: crawls, error: cErr } =
            await supabase
              .from('socially_visible_crawls')
              .select(
                'crawl_id, user_id, route_id, status, start_time, end_time'
              )
              .not('user_id', 'is', null)
              .neq('user_id', ADMIN_ID);
          if (cErr) throw cErr;

          const byU = new Map();
          for (const c of crawls || []) {
            if (!byU.has(c.user_id))
              byU.set(c.user_id, {
                total: 0,
                completed: 0,
                crawls: [],
              });
            const o = byU.get(c.user_id);
            o.total += 1;
            if (
              (c.status || '').toLowerCase() ===
              'completed'
            )
              o.completed += 1;
            o.crawls.push(c);
          }
          setCrawlsByUser(byU);
          setCrawlsOk(true);
        } catch {
          setCrawlsByUser(new Map());
          setCrawlsOk(false);
        }

        // 4) Totals via RPCs (preferred), then fallbacks
        try {
          const [
            { data: totalRoutesRes },
            { data: totalDestsRes },
          ] = await Promise.all([
            supabase.rpc('lb_total_routes'),
            supabase.rpc('lb_total_destinations'),
          ]);

          const tr = Array.isArray(totalRoutesRes)
            ? totalRoutesRes?.[0]
            : totalRoutesRes;
          const td = Array.isArray(totalDestsRes)
            ? totalDestsRes?.[0]
            : totalDestsRes;

          if (typeof tr === 'number')
            setTotalRoutes(tr);
          else {
            const { data } = await supabase
              .from('routes')
              .select('id');
            setTotalRoutes(
              Array.isArray(data) ? data.length : 0
            );
          }

          if (typeof td === 'number')
            setTotalDestinations(td);
          else {
            const { data } = await supabase
              .from('destinations')
              .select('id');
            setTotalDestinations(
              Array.isArray(data) ? data.length : 0
            );
          }
        } catch {
          try {
            const { data: r } = await supabase
              .from('routes')
              .select('id');
            setTotalRoutes(
              Array.isArray(r) ? r.length : 0
            );
          } catch {
            setTotalRoutes(0);
          }
          try {
            const { data: d } = await supabase
              .from('destinations')
              .select('id');
            setTotalDestinations(
              Array.isArray(d) ? d.length : 0
            );
          } catch {
            setTotalDestinations(0);
          }
        }

        // 5) Per-user aggregates via RPCs (preferred), with fallbacks
        try {
          const [
            { data: routesCompleted },
            { data: destsRated },
          ] = await Promise.all([
            supabase.rpc('lb_user_routes_completed'),
            supabase.rpc(
              'lb_user_destinations_rated'
            ),
          ]);
          setRoutesCompletedMap(
            rowsToMap(
              filterSociallyVisibleRows(routesCompleted, visibleIds),
              'user_id',
              'completed_routes'
            )
          );
          setDestsRatedMap(
            rowsToMap(
              filterSociallyVisibleRows(destsRated, visibleIds),
              'user_id',
              'distinct_destinations'
            )
          );
        } catch {
          const rc = new Map();
          for (const [
            uid,
            agg,
          ] of crawlsByUser || new Map()) {
            const completedRouteIds = new Set(
              (agg.crawls || [])
                .filter(
                  (c) =>
                    (c.status || '')
                      .toLowerCase() === 'completed'
                )
                .map((c) => c.route_id)
            );
            rc.set(uid, completedRouteIds.size);
          }
          setRoutesCompletedMap(rc);

          const byUser = groupBy(dr, (r) => r.user_id);
          const drMap = new Map();
          for (const [uid, items] of byUser) {
            drMap.set(
              uid,
              distinctCount(
                items,
                (r) => r.destination_id
              )
            );
          }
          setDestsRatedMap(drMap);
        }

        // 6) Badges Earned per user
        try {
          const {
            data: badgeCounts,
            error: bErr,
          } = await supabase
            .from('lb_user_badges_counts')
            .select('user_id, badges_count');

          if (!bErr && Array.isArray(badgeCounts)) {
            setBadgesCountMap(
              rowsToMap(
                filterSociallyVisibleRows(badgeCounts, visibleIds),
                'user_id',
                'badges_count'
              )
            );
          } else {
            try {
              const { data: rpcCounts } =
                await supabase.rpc(
                  'lb_user_badges_count'
                );
              if (Array.isArray(rpcCounts)) {
                setBadgesCountMap(
                  rowsToMap(
                    rpcCounts,
                    'user_id',
                    'badges_count'
                  )
                );
              } else {
                setBadgesCountMap(new Map());
              }
            } catch {
              setBadgesCountMap(new Map());
            }
          }
        } catch {
          setBadgesCountMap(new Map());
        }

        // 7) Weekly streaks from crawl_weekly_streak view
        try {
          const {
            data: streakRows,
            error: sErr,
          } = await supabase
            .from('crawl_weekly_streak')
            .select(
              'user_id, current_streak_weeks'
            );

          if (!sErr && Array.isArray(streakRows)) {
            const filtered = streakRows.filter(
              (r) => r.user_id !== ADMIN_ID
            );
            setStreakWeeksMap(
              rowsToMap(
                filterSociallyVisibleRows(filtered, visibleIds),
                'user_id',
                'current_streak_weeks'
              )
            );
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
  }, []);

  const nameOf = (uid) => {
    const meta = usersMap.get(uid);
    const nm = meta?.username?.trim?.();
    return nm && nm.length > 0
      ? nm
      : `Winglet_${String(uid || '').slice(0, 6)}`;
  };
  const xpOf = (uid) => usersMap.get(uid)?.xp ?? 0;

  const ratingsByUser = useMemo(
    () => groupBy(ratings, (r) => r.user_id),
    [ratings]
  );

  // ---------- navigate to "Chicken Wing Journey" for a user ----------
  const handleViewUserJourney = (uid) => {
    if (!uid) return;
    setModalOpen(false); // close list so journey isn't hidden behind it
    router.push({
      pathname: '/profile/history',
      params: {
        userId: uid,
        viewerId: viewerId || '',
      },
    });
  };

  // ---------- metric builders ----------
  const lbHighestLevel = useMemo(() => {
    const arr = [];
    for (const [uid, meta] of usersMap) {
      const xp = meta?.xp ?? 0;
      arr.push({ uid, xp, value: computeLevelFromXp(xp) });
    }
    if (arr.length === 0) {
      for (const [uid, items] of ratingsByUser) {
        const xp = items.length; // fallback XP = ratings count
        arr.push({
          uid,
          xp,
          value: computeLevelFromXp(xp),
        });
      }
    }
    arr.sort(
      (a, b) =>
        b.value - a.value ||
        b.xp - a.xp ||
        nameOf(a.uid).localeCompare(nameOf(b.uid))
    );
    return arr
      .slice(0, 25)
      .map((x) => ({
        ...x,
        displayName: nameOf(x.uid),
      }));
  }, [usersMap, ratingsByUser]);

  const lbWeeklyStreak = useMemo(() => {
    const entries = [];
    if (streakWeeksMap.size > 0) {
      for (const [uid] of usersMap) {
        const v = streakWeeksMap.get(uid) ?? 0;
        entries.push({ uid, value: v });
      }
    } else {
      for (const [uid, items] of ratingsByUser) {
        const dates = items
          .map((r) => r.created_at)
          .filter(Boolean);
        const streak = longestWeeklyStreak(dates);
        entries.push({ uid, value: streak });
      }
    }
    entries.sort(
      (a, b) =>
        b.value - a.value ||
        nameOf(a.uid).localeCompare(nameOf(b.uid))
    );
    return entries
      .slice(0, 25)
      .map((x) => ({
        ...x,
        displayName: nameOf(x.uid),
      }));
  }, [streakWeeksMap, usersMap, ratingsByUser]);

  const lbUniqueRestaurants = useMemo(() => {
    const entries = [];
    for (const [uid, items] of ratingsByUser) {
      const count = distinctCount(
        items,
        (r) => r.destination_id
      );
      entries.push({ uid, value: count });
    }
    entries.sort(
      (a, b) =>
        b.value - a.value ||
        nameOf(a.uid).localeCompare(nameOf(b.uid))
    );
    return entries
      .slice(0, 25)
      .map((x) => ({
        ...x,
        displayName: nameOf(x.uid),
      }));
  }, [ratingsByUser, usersMap]);

  const lbCrawlsCompleted = useMemo(() => {
    if (!crawlsOk) return [];
    const entries = [];
    for (const [uid, agg] of crawlsByUser) {
      entries.push({ uid, value: agg.completed ?? 0 });
    }
    entries.sort(
      (a, b) =>
        b.value - a.value ||
        nameOf(a.uid).localeCompare(nameOf(b.uid))
    );
    return entries
      .slice(0, 25)
      .map((x) => ({
        ...x,
        displayName: nameOf(x.uid),
      }));
  }, [crawlsOk, crawlsByUser, usersMap]);

  const lbPctRoutesCompleted = useMemo(() => {
    if (!totalRoutes) return [];
    const entries = [];
    for (const [uid] of usersMap) {
      const completed =
        routesCompletedMap.get(uid) || 0;
      const value =
        (completed / totalRoutes) * 100;
      entries.push({
        uid,
        value,
        completed,
        total: totalRoutes,
      });
    }
    entries.sort(
      (a, b) =>
        b.value - a.value ||
        b.completed - a.completed ||
        nameOf(a.uid).localeCompare(nameOf(b.uid))
    );
    return entries
      .slice(0, 25)
      .map((x) => ({
        ...x,
        displayName: nameOf(x.uid),
      }));
  }, [usersMap, routesCompletedMap, totalRoutes]);

  const lbPctDestinationsRated = useMemo(() => {
    if (!totalDestinations) return [];
    const entries = [];
    for (const [uid] of usersMap) {
      const rated = destsRatedMap.get(uid) || 0;
      const value =
        (rated / totalDestinations) * 100;
      entries.push({
        uid,
        value,
        rated,
        total: totalDestinations,
      });
    }
    entries.sort(
      (a, b) =>
        b.value - a.value ||
        b.rated - a.rated ||
        nameOf(a.uid).localeCompare(nameOf(b.uid))
    );
    return entries
      .slice(0, 25)
      .map((x) => ({
        ...x,
        displayName: nameOf(x.uid),
      }));
  }, [usersMap, destsRatedMap, totalDestinations]);

  const lbMostCrawlsIn24h = useMemo(() => {
    if (!crawlsOk) return [];
    const entries = [];
    for (const [uid, agg] of crawlsByUser) {
      const completed = (agg.crawls || []).filter(
        (c) =>
          (c.status || '').toLowerCase() ===
          'completed'
      );
      const ts = completed
        .map((c) =>
          new Date(
            c.end_time || c.start_time
          ).getTime()
        )
        .filter((n) => Number.isFinite(n))
        .sort((a, b) => a - b);
      let i = 0,
        best = 0;
      for (let j = 0; j < ts.length; j++) {
        const tJ = ts[j];
        while (
          tJ - ts[i] >
          24 * 60 * 60 * 1000
        )
          i++;
        best = Math.max(best, j - i + 1);
      }
      entries.push({ uid, value: best });
    }
    entries.sort(
      (a, b) =>
        b.value - a.value ||
        nameOf(a.uid).localeCompare(nameOf(b.uid))
    );
    return entries
      .slice(0, 25)
      .map((x) => ({
        ...x,
        displayName: nameOf(x.uid),
      }));
  }, [crawlsOk, crawlsByUser, usersMap]);

  const lbMostRestaurantsIn24h = useMemo(() => {
    const entries = [];
    for (const [uid, items] of ratingsByUser) {
      const best = maxDistinctIn24h(
        items,
        (r) => r.destination_id
      );
      entries.push({ uid, value: best });
    }
    entries.sort(
      (a, b) =>
        b.value - a.value ||
        nameOf(a.uid).localeCompare(nameOf(b.uid))
    );
    return entries
      .slice(0, 25)
      .map((x) => ({
        ...x,
        displayName: nameOf(x.uid),
      }));
  }, [ratingsByUser, usersMap]);

  const lbBadgesEarned = useMemo(() => {
    const entries = [];
    for (const [uid, count] of badgesCountMap) {
      entries.push({ uid, value: count });
    }
    entries.sort(
      (a, b) =>
        b.value - a.value ||
        nameOf(a.uid).localeCompare(nameOf(b.uid))
    );
    return entries
      .slice(0, 25)
      .map((x) => ({
        ...x,
        displayName: nameOf(x.uid),
      }));
  }, [badgesCountMap, usersMap]);

  // ---------- modal handling ----------
  const openDrilldown = (
    title,
    items,
    fmtValue,
    fmtSub
  ) => {
    setModalTitle(title);
    setModalFormatter({ fmtValue, fmtSub });
    setModalItems(
      items.map((it, i) => ({
        key: `${title}-${it.uid}-${i}`,
        rank: i + 1,
        displayName: it.displayName,
        raw: it,
      }))
    );
    setModalOpen(true);
  };

  const fmtPct = (it) =>
    `${(it.value ?? 0).toFixed(1)}%`;

  // ---------- render ----------
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text
          variant="headlineSmall"
          style={[styles.title, { color: textColor }]}
        >
          Leaderboards
        </Text>

        {loading ? (
          <View
            style={{ alignItems: 'center', padding: 24 }}
          >
            <ActivityIndicator />
            <Text
              style={{ marginTop: 8, color: textColor }}
            >
              Loading leaderboards…
            </Text>
          </View>
        ) : error ? (
          <Card
            style={[
              styles.card,
              {
                backgroundColor:
                  theme.colors.elevation?.level2 ??
                  (theme.dark ? '#1f1f1f' : '#fff'),
              },
            ]}
          >
            <Card.Content>
              <Text style={{ color: theme.colors.error }}>
                Error: {error}
              </Text>
            </Card.Content>
          </Card>
        ) : (
          <>
            <LeaderCard
              title="Highest Level"
              items={lbHighestLevel}
              formatValue={(it) => `Lv ${it.value}`}
              formatSub={(it) =>
                `${xpOf(it.uid)} XP`
              }
              onView={() =>
                openDrilldown(
                  'Highest Level',
                  lbHighestLevel,
                  (it) =>
                    `Level ${it.value} • ${xpOf(
                      it.uid
                    ).toLocaleString()} XP`,
                  null
                )
              }
              onUserPress={handleViewUserJourney}
            />

            <LeaderCard
              title="Badges Earned"
              items={lbBadgesEarned}
              formatValue={(it) => `${it.value}`}
              formatSub={(it) =>
                `${it.value} badge${
                  it.value === 1 ? '' : 's'
                }`
              }
              onView={() =>
                openDrilldown(
                  'Badges Earned',
                  lbBadgesEarned,
                  (it) =>
                    `${it.value} badge${
                      it.value === 1 ? '' : 's'
                    }`,
                  null
                )
              }
              onUserPress={handleViewUserJourney}
            />

            <LeaderCard
              title="Longest Weekly Streak"
              items={lbWeeklyStreak}
              formatValue={(it) => `${it.value}w`}
              formatSub={(it) =>
                `${it.value} week${
                  it.value === 1 ? '' : 's'
                }`
              }
              onView={() =>
                openDrilldown(
                  'Longest Weekly Streak',
                  lbWeeklyStreak,
                  (it) =>
                    `${it.value} week${
                      it.value === 1 ? '' : 's'
                    }`,
                  null
                )
              }
              onUserPress={handleViewUserJourney}
            />

            <LeaderCard
              title="Highest % of Routes Completed"
              items={lbPctRoutesCompleted}
              formatValue={fmtPct}
              formatSub={(it) =>
                `${(it.value ?? 0).toFixed(
                  1
                )}% • ${it.completed}/${it.total}`
              }
              onView={() =>
                openDrilldown(
                  'Highest % Routes Completed',
                  lbPctRoutesCompleted,
                  (it) =>
                    `${(it.value ?? 0).toFixed(
                      1
                    )}% • ${it.completed}/${it.total}`,
                  null
                )
              }
              onUserPress={handleViewUserJourney}
            />

            <LeaderCard
              title="Highest % of Destinations Rated"
              items={lbPctDestinationsRated}
              formatValue={fmtPct}
              formatSub={(it) =>
                `${(it.value ?? 0).toFixed(
                  1
                )}% • ${it.rated}/${it.total}`
              }
              onView={() =>
                openDrilldown(
                  'Highest % Destinations Rated',
                  lbPctDestinationsRated,
                  (it) =>
                    `${(it.value ?? 0).toFixed(
                      1
                    )}% • ${it.rated}/${it.total}`,
                  null
                )
              }
              onUserPress={handleViewUserJourney}
            />

            <LeaderCard
              title="Crawls in 24 Hours"
              items={lbMostCrawlsIn24h}
              formatValue={(it) => `${it.value}`}
              onView={() =>
                openDrilldown(
                  'Most Crawls Completed in 24h',
                  lbMostCrawlsIn24h,
                  (it) => `${it.value} in 24h`,
                  null
                )
              }
              onUserPress={handleViewUserJourney}
            />

            <LeaderCard
              title="Restaurants Rated in 24 Hours"
              items={lbMostRestaurantsIn24h}
              formatValue={(it) => `${it.value}`}
              onView={() =>
                openDrilldown(
                  'Most Restaurants Rated in 24h',
                  lbMostRestaurantsIn24h,
                  (it) => `${it.value} in 24h`,
                  null
                )
              }
              onUserPress={handleViewUserJourney}
            />
          </>
        )}

        {/* Drilldown modal */}
        <Portal>
          <Dialog
            visible={modalOpen}
            onDismiss={() => setModalOpen(false)}
            style={[
              styles.dialog,
              { backgroundColor: surface },
            ]}
          >
            <Dialog.Title
              style={{
                textAlign: 'center',
                color: textColor,
              }}
            >
              {modalTitle}
            </Dialog.Title>

            {/* Inner scroll so Top 25 list is scrollable */}
            <Dialog.Content style={{ paddingHorizontal: 0 }}>
              {modalItems.length === 0 ? (
                <Text
                  style={{ color: textColor, paddingHorizontal: 16 }}
                >
                  No data.
                </Text>
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
                        activeOpacity={0.7}
                        onPress={() =>
                          handleViewUserJourney(
                            it.raw.uid
                          )
                        }
                      >
                        <Medal rank={it.rank} size="sm" />
                        <Avatar.Text
                          size={30}
                          label={initials(
                            it.displayName
                          )}
                          style={{
                            backgroundColor:
                              theme.colors
                                .elevation
                                ?.level1 ??
                              (theme.dark
                                ? '#2a2a2a'
                                : '#f1f3f5'),
                          }}
                        />
                        <View style={{ flex: 1 }}>
                          <Text
                            style={[
                              styles.drillName,
                              { color: textColor },
                            ]}
                            numberOfLines={1}
                          >
                            {it.displayName}
                          </Text>
                          {modalFormatter.fmtSub ? (
                            <Text
                              style={[
                                styles.drillSub,
                                { color: textColor },
                              ]}
                              numberOfLines={1}
                            >
                              {modalFormatter.fmtSub(
                                it.raw
                              )}
                            </Text>
                          ) : null}
                        </View>
                        <Text
                          style={[
                            styles.drillValue,
                            { color: textColor },
                          ]}
                          numberOfLines={1}
                        >
                          {modalFormatter.fmtValue
                            ? modalFormatter.fmtValue(
                                it.raw
                              )
                            : ''}
                        </Text>
                      </TouchableOpacity>
                      {idx <
                        modalItems.length - 1 && (
                        <Divider
                          style={{ marginVertical: 8 }}
                        />
                      )}
                    </View>
                  ))}
                </ScrollView>
              )}
            </Dialog.Content>

            <Dialog.Actions>
              <Button
                onPress={() => setModalOpen(false)}
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
  title: { fontWeight: '800' },
  card: { borderRadius: 18, elevation: 1 },
  muted: { opacity: 0.7 },

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
  userChip: { borderRadius: 12 },
  userChipText: { fontWeight: '600' },
  userChipValue: { opacity: 0.7 },

  // Drilldown
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
  drillSub: {
    opacity: 0.7,
    fontSize: 12,
    marginTop: 2,
  },
  drillValue: {
    fontWeight: '800',
    marginLeft: 8,
    maxWidth: 130,
    textAlign: 'right',
    flexShrink: 0,
  },
});
