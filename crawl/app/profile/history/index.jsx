// app/profile/history/index.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import ProfileWelcomeWizard from '../../../components/ProfileWelcomeWizard';
import { View, FlatList, StyleSheet, ScrollView, RefreshControl, Alert, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator, Card, Text, Button, Divider, ProgressBar, useTheme } from 'react-native-paper';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../../lib/supabase.js';
import { trackEvent } from '../../../lib/analytics';
import FriendProfileActions from '../../../components/FriendProfileActions';
import ScreenHeader from '../../../components/ScreenHeader';
import WeeklyChallengeStats from '../../../components/WeeklyChallengeStats';
import WingCreatorSummaryCard from '../../../components/creator/WingCreatorSummaryCard';

/* ---------------- helpers ---------------- */

const toStr = (v) => (Array.isArray(v) ? v[0] : v) ?? undefined;

function fmtDate(iso) {
  try {
    const d = new Date(iso);
    return isNaN(d) ? '—' : d.toLocaleString();
  } catch {
    return '—';
  }
}

const fmt2 = (n) => (Number.isFinite(Number(n)) ? Number(n).toFixed(2) : '—');

async function fetchFunFact() {
  try {
    const { data, error } = await supabase.rpc('get_random_fun_fact');
    if (!error && data?.[0]?.text) return String(data[0].text);
  } catch (e) {
    console.warn('fun fact RPC failed:', e?.message || e);
  }

  try {
    const { data, error } = await supabase.from('fun_facts').select('text').limit(25);
    if (!error && Array.isArray(data) && data.length) {
      const i = Math.floor(Math.random() * data.length);
      return String(data[i].text);
    }
  } catch (e) {
    console.warn('fun fact fallback failed:', e?.message || e);
  }

  return 'Classic Buffalo sauce = cayenne pepper hot sauce + melted butter.';
}

const isActiveCrawl = (c) => {
  const s = (c.status || '').toLowerCase().trim().replace(/\s+/g, '_');
  return s === 'active' || s === 'in_progress' || (!c.end_time && s !== 'completed');
};

const possessiveName = (name) => {
  if (!name) return 'Their';
  const trimmed = String(name).trim();
  if (!trimmed) return 'Their';
  return trimmed.endsWith('s') ? `${trimmed}'` : `${trimmed}'s`;
};

let guestProfileWizardShownThisSession = false;

/* ---------------- error boundary ---------------- */

class HistoryErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorText: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, errorText: String(error?.message || error) };
  }

  componentDidCatch(error, info) {
    try {
      console.warn('[HistoryIndex] Render error:', error?.message || error);
      console.warn('[HistoryIndex] Component stack:', info?.componentStack || info);
    } catch {}
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback?.(this.state.errorText) ?? null;
    }
    return this.props.children;
  }
}

/* ---------------- main ---------------- */

export default function HistoryIndex() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const theme = useTheme();
  const isDark = !!theme.dark;

  const didInitialLoadRef = useRef(false);
  const journeyOpenedAtRef = useRef(Date.now());
  const journeyRenderTrackedRef = useRef(false);

  const cardBg = theme.colors.elevation?.level2 ?? (isDark ? '#1f1f1f' : '#f7f7f8');
  const surfaceBg = theme.colors.surface;
  const outline = theme.colors.outlineVariant ?? theme.colors.outline;

  const [funFact, setFunFact] = useState(null);

  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [viewUserId, setViewUserId] = useState(null);
  const [viewUserProfile, setViewUserProfile] = useState(null);

  const [crawls, setCrawls] = useState([]);
  const [ratings, setRatings] = useState([]);

  const [ratingAlignment, setRatingAlignment] = useState({ closest: null, farthest: null });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState('completed');

  const [wizardChecked, setWizardChecked] = useState(false);
  const [wizardVisible, setWizardVisible] = useState(false);

  const isViewingSelf = !!session?.user?.id && !!viewUserId && viewUserId === session.user.id;

  /* ---------- boot ---------- */

  useEffect(() => {
    let alive = true;

    (async () => {
      fetchFunFact().then((f) => {
        if (alive) setFunFact(f);
      });

      const { data } = await supabase.auth.getSession();
      if (!alive) return;

      const sess = data?.session ?? null;
      const paramUserId = toStr(params?.userId);

      setSession(sess);
      setViewUserId(paramUserId || sess?.user?.id || null);
      setAuthReady(true);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!alive) return;
      const paramUserId = toStr(params?.userId);
      setSession(s ?? null);
      setViewUserId(paramUserId || s?.user?.id || null);
      setAuthReady(true);
    });

    return () => {
      alive = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, [params?.userId]);

  /* ---------- determine view user ---------- */

  useEffect(() => {
    const paramUserId = toStr(params?.userId);
    if (paramUserId) {
      setViewUserId(paramUserId);
      return;
    }
    if (!authReady) return;
    setViewUserId(session?.user?.id ?? null);
  }, [params?.userId, authReady, session?.user?.id]);

  /* ---------- fetch profile meta (username) ---------- */

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!viewUserId) {
        if (!cancelled) setViewUserProfile(null);
        return;
      }

      if (session?.user?.id && viewUserId === session.user.id) {
        if (!cancelled) setViewUserProfile(null);
        return;
      }

      try {
        const { data, error } = await supabase.rpc('get_safe_social_profile', {
          p_target_user_id: viewUserId,
        });

        if (cancelled) return;

        if (error) {
          console.warn('view user profile fetch failed:', error.message || error);
          setViewUserProfile(null);
        } else {
          setViewUserProfile(Array.isArray(data) ? data[0] ?? null : data ?? null);
        }
      } catch (e) {
        if (!cancelled) {
          console.warn('view user profile fetch failed:', e?.message || e);
          setViewUserProfile(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [viewUserId, session?.user?.id]);

  /* ---------- wizard visibility ---------- */

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!authReady) return;

      const uid = session?.user?.id ?? null;
      const paramUserId = toStr(params?.userId);

      if (!uid) {
        if (paramUserId) {
          if (!cancelled) {
            setWizardVisible(false);
            setWizardChecked(true);
          }
          return;
        }

        if (!guestProfileWizardShownThisSession) {
          if (!cancelled) {
            setWizardVisible(true);
            setWizardChecked(true);
          }
        } else {
          if (!cancelled) {
            setWizardVisible(false);
            setWizardChecked(true);
          }
        }
        return;
      }

      const { data, error } = await supabase
        .from('users_check_profile')
        .select('user_id')
        .eq('user_id', uid)
        .limit(1);

      if (cancelled) return;

      if (error) {
        console.warn('profile wizard check failed:', error.message || error);
        setWizardVisible(false);
      } else {
        setWizardVisible(!(data && data.length > 0));
      }
      setWizardChecked(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [authReady, session?.user?.id, params?.userId]);

  const markProfileWizardSeen = useCallback(async () => {
    try {
      const uid = session?.user?.id ?? null;
      if (!uid) {
        guestProfileWizardShownThisSession = true;
        setWizardVisible(false);
        return;
      }
      const { error } = await supabase
        .from('users_check_profile')
        .upsert({ user_id: uid, seen_at: new Date().toISOString() }, { onConflict: 'user_id' });
      if (error) throw error;
    } catch (e) {
      console.warn('profile wizard upsert failed:', e?.message || e);
    } finally {
      setWizardVisible(false);
    }
  }, [session?.user?.id]);

  /* ---------- fetchAll ---------- */

  const fetchAll = useCallback(async (userId) => {
    if (!userId) {
      setCrawls([]);
      setRatings([]);
      setRatingAlignment({ closest: null, farthest: null });
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const viewerId = sessionData?.session?.user?.id ?? null;
    if (viewerId && viewerId !== userId) {
      const { data: safeProfile, error: accessError } = await supabase.rpc('get_safe_social_profile', {
        p_target_user_id: userId,
      });
      if (accessError) throw accessError;
      const allowed = Array.isArray(safeProfile) ? safeProfile[0] : safeProfile;
      if (!allowed) throw new Error('This profile is unavailable because of privacy settings.');
    }

    const { data: crawlsRows, error: cErr } = await supabase
      .from('crawls')
      .select(
        `
          crawl_id,
          route_id,
          status,
          start_time,
          end_time,
          routes:route_id(title)
        `
      )
      .eq('user_id', userId)
      .order('start_time', { ascending: false });

    if (cErr) throw cErr;

    const mappedCrawls = (crawlsRows || []).map((c) => ({
      crawl_id: c.crawl_id,
      route_id: c.route_id,
      status: c.status,
      start_time: c.start_time,
      end_time: c.end_time,
      route_title: c.routes?.title ?? 'Route',
    }));

    const { data: ratingsRows, error: rErr } = await supabase
      .from('destination_ratings')
      .select(
        `
          destination_id,
          created_at,
          wings_eaten,
          crispiness, sauce, meat, overall, weight_score,
          destinations!destination_ratings_destination_id_fkey ( name )
        `
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (rErr) throw rErr;

    const ratingsList = ratingsRows || [];

    // alignment
    const perDestLocal = new Map();
    for (const r of ratingsList) {
      const id = r.destination_id;
      if (!id) continue;
      const name = r.destinations?.name ?? 'Unknown';
      const w = Number(r.weight_score ?? 0);
      const bucket = perDestLocal.get(id) || { name, sumW: 0, n: 0 };
      if (Number.isFinite(w)) {
        bucket.sumW += w;
        bucket.n += 1;
      }
      perDestLocal.set(id, bucket);
    }

    let closest = null;
    let farthest = null;

    if (perDestLocal.size) {
      const destIds = Array.from(perDestLocal.keys());

      const { data: globalRows, error: gErr } = await supabase
        .from('destination_ratings')
        .select('destination_id, weight_score')
        .in('destination_id', destIds);

      if (!gErr && Array.isArray(globalRows) && globalRows.length) {
        const globalMap = new Map();
        for (const row of globalRows) {
          const id = row.destination_id;
          const w = Number(row.weight_score ?? 0);
          if (!id || !Number.isFinite(w)) continue;
          const g = globalMap.get(id) || { sum: 0, n: 0 };
          g.sum += w;
          g.n += 1;
          globalMap.set(id, g);
        }

        const diffList = [];
        for (const [id, bucket] of perDestLocal.entries()) {
          if (!bucket.n) continue;
          const yourAvg = bucket.sumW / bucket.n;
          const g = globalMap.get(id);
          if (!g || !g.n) continue;
          const groupAvg = g.sum / g.n;
          const diff = Math.abs(yourAvg - groupAvg);
          diffList.push({ id, name: bucket.name, yourAvg, groupAvg, diff });
        }

        if (diffList.length) {
          diffList.sort((a, b) => a.diff - b.diff);
          closest = diffList[0];
          farthest = diffList[diffList.length - 1];
        }
      }
    }

    setCrawls(mappedCrawls);
    setRatings(ratingsList);
    setRatingAlignment({ closest, farthest });
  }, []);

  /* ---------- initial load ---------- */

  useEffect(() => {
    let alive = true;

    (async () => {
      didInitialLoadRef.current = false;

      if (!viewUserId) {
        if (!authReady) return;

        setCrawls([]);
        setRatings([]);
        setRatingAlignment({ closest: null, farthest: null });
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setCrawls([]);
        setRatings([]);
        setRatingAlignment({ closest: null, farthest: null });

        await fetchAll(viewUserId);
      } catch (e) {
        const msg = e?.message || String(e);
        console.warn('history fetch error', msg);
        setCrawls([]);
        setRatings([]);
        setRatingAlignment({ closest: null, farthest: null });
      } finally {
        if (alive) {
          setLoading(false);
          didInitialLoadRef.current = true;
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, [viewUserId, authReady, fetchAll]);

  /* ---------- focus refresh ---------- */

  useFocusEffect(
    useCallback(() => {
      trackEvent({
        eventName: 'profile_opened',
        screen: 'profile_history',
        userId: viewUserId ?? session?.user?.id ?? null,
        metadata: {
          source_screen: 'journey_tab',
          viewing_self: isViewingSelf,
        },
      });
      if (!isViewingSelf && viewUserId) {
        trackEvent({
          eventName: 'friend_profile_opened',
          screen: 'profile_history',
          userId: session?.user?.id ?? null,
          metadata: {
            target_user_id: viewUserId,
            source_surface: toStr(params?.sourceSurface) || 'profile',
          },
        });
      }
      if (!viewUserId) return;
      if (!didInitialLoadRef.current) return;
      fetchAll(viewUserId);
    }, [viewUserId, fetchAll, session?.user?.id, isViewingSelf, params?.sourceSurface])
  );

  const onRefresh = useCallback(async () => {
    if (!viewUserId) return;
    setRefreshing(true);
    try {
      await fetchAll(viewUserId);
    } finally {
      setRefreshing(false);
    }
  }, [viewUserId, fetchAll]);

  /* ---------- aggregates ---------- */

  const perDest = useMemo(() => {
    const m = new Map();
    for (const r of ratings) {
      const id = r.destination_id;
      if (!id) continue;
      const bucket = m.get(id) || {
        destination_id: id,
        name: r.destinations?.name ?? 'Unknown',
        n: 0,
        sumW: 0,
      };
      bucket.n += 1;
      bucket.sumW += Number(r.weight_score ?? 0);
      m.set(id, bucket);
    }
    return m;
  }, [ratings]);

  const { best, worst } = useMemo(() => {
    let best = null;
    let worst = null;
    for (const b of perDest.values()) {
      const avgW = b.n ? b.sumW / b.n : 0;
      const item = { ...b, avgW };
      if (!best || item.avgW > best.avgW) best = item;
      if (!worst || item.avgW < worst.avgW) worst = item;
    }
    return { best, worst };
  }, [perDest]);

  const mostFrequent = useMemo(() => {
    let mf = null;
    for (const b of perDest.values()) {
      if (!mf || b.n > mf.n) mf = b;
    }
    return mf;
  }, [perDest]);

  const avgs = useMemo(() => {
    if (!ratings.length) return { o: null, s: null, m: null, c: null };
    let n = 0,
      so = 0,
      ss = 0,
      sm = 0,
      sc = 0;
    for (const r of ratings) {
      n += 1;
      so += Number(r.overall ?? 0);
      ss += Number(r.sauce ?? 0);
      sm += Number(r.meat ?? 0);
      sc += Number(r.crispiness ?? 0);
    }
    return { o: n ? so / n : null, s: n ? ss / n : null, m: n ? sm / n : null, c: n ? sc / n : null };
  }, [ratings]);

  const activeCrawls = useMemo(() => crawls.filter(isActiveCrawl), [crawls]);
  const completedCrawls = useMemo(
    () => crawls.filter((c) => (c.status || '').toLowerCase().trim() === 'completed'),
    [crawls]
  );

  const listForDialog = dialogMode === 'active' ? activeCrawls : dialogMode === 'completed' ? completedCrawls : ratings;

  const nowYear = new Date().getFullYear();

  const wingsYTD = useMemo(
    () =>
      ratings.reduce((sum, r) => {
        const d = r?.created_at ? new Date(r.created_at) : null;
        const y = d && !isNaN(d) ? d.getFullYear() : null;
        return y === nowYear ? sum + (Number(r.wings_eaten) || 0) : sum;
      }, 0),
    [ratings, nowYear]
  );

  const restaurantsYTD = useMemo(
    () =>
      ratings.filter((r) => {
        const d = r?.created_at ? new Date(r.created_at) : null;
        return d && !isNaN(d) && d.getFullYear() === nowYear;
      }).length,
    [ratings, nowYear]
  );

  const crawlsYTD = useMemo(
    () =>
      completedCrawls.filter((c) => {
        const d = c?.end_time ? new Date(c.end_time) : c?.start_time ? new Date(c.start_time) : null;
        return d && !isNaN(d) && d.getFullYear() === nowYear;
      }).length,
    [completedCrawls, nowYear]
  );

  const viewUsername =
    viewUserProfile?.username && viewUserProfile.username.trim().length
      ? viewUserProfile.username.trim()
      : viewUserProfile?.user_id
      ? `Winglet_${String(viewUserProfile.user_id).slice(0, 6)}`
      : null;

  const headerTitle =
    isViewingSelf || !viewUserId ? 'Your Chicken Wing Journey' : `${possessiveName(viewUsername)} Chicken Wing Journey`;

  const headerSubtitle = isViewingSelf
    ? 'Personal stats and averages across your ratings'
    : 'Stats and averages across this winglet’s ratings';

  const hasCompletedCrawls = completedCrawls.length > 0;
  const hasRatings = ratings.length > 0;

  useFocusEffect(
    useCallback(() => {
      journeyOpenedAtRef.current = Date.now();
      journeyRenderTrackedRef.current = false;

      trackEvent({
        eventName: 'journey_screen_viewed',
        screen: 'journey',
        userId: session?.user?.id ?? null,
        metadata: {
          viewing_self: isViewingSelf,
          has_view_user_id: Boolean(viewUserId),
          source_surface: toStr(params?.sourceSurface) || 'journey_tab',
        },
      });

      return undefined;
    }, [isViewingSelf, params?.sourceSurface, session?.user?.id, viewUserId])
  );

  const handleRootLayout = useCallback(() => {
    if (journeyRenderTrackedRef.current) return;
    journeyRenderTrackedRef.current = true;

    trackEvent({
      eventName: 'journey_screen_render_time',
      screen: 'journey',
      userId: session?.user?.id ?? null,
      metadata: {
        render_time_ms: Math.max(0, Date.now() - journeyOpenedAtRef.current),
        viewing_self: isViewingSelf,
        has_view_user_id: Boolean(viewUserId),
      },
    });
  }, [isViewingSelf, session?.user?.id, viewUserId]);

  const handleDeleteCrawl = useCallback(async (crawl_id) => {
    setCrawls((arr) => arr.filter((c) => c.crawl_id !== crawl_id));

    let warned = false;
    try {
      const { error: rpcErr } = await supabase.rpc('detach_crawl', { p_crawl: crawl_id });
      if (rpcErr) throw rpcErr;
      return;
    } catch (e) {
      const msg = String(e?.message || '');
      const notExists = msg.toLowerCase().includes('function') && msg.toLowerCase().includes('does not exist');
      if (!notExists) {
        console.warn('Could not detach crawl on backend:', e?.message || e);
        warned = true;
      }
    }

    try {
      const { error } = await supabase.from('crawls').update({ user_id: null }).eq('crawl_id', crawl_id);
      if (error) throw error;
    } catch (e) {
      if (!warned) console.warn('Could not detach crawl on backend:', e?.message || e);
    }
  }, []);

  const CrawlRow = ({ item }) => {
    const isActive = isActiveCrawl(item);

    const [percent, setPercent] = useState(null);
    const [stopCount, setStopCount] = useState(null);
    const [ratedCount, setRatedCount] = useState(null);

    const getProgressColor = (pct) => {
      if (pct == null) return '#E6E6E6';
      const start = { r: 255, g: 231, b: 195 };
      const end = { r: 255, g: 150, b: 60 };
      const t = Math.max(0, Math.min(1, pct / 100));
      const r = Math.round(start.r + (end.r - start.r) * t);
      const g = Math.round(start.g + (end.g - start.g) * t);
      const b = Math.round(start.b + (end.b - start.b) * t);
      return `rgb(${r},${g},${b})`;
    };

    useEffect(() => {
      let alive = true;

      const load = async () => {
        try {
          const { data: routeRow, error: rErr } = await supabase
            .from('routes')
            .select('stop1_id, stop2_id, stop3_id, stop4_id, stop5_id')
            .eq('id', item.route_id)
            .maybeSingle();
          if (rErr) throw rErr;

          const stops = [
            routeRow?.stop1_id,
            routeRow?.stop2_id,
            routeRow?.stop3_id,
            routeRow?.stop4_id,
            routeRow?.stop5_id,
          ].filter(Boolean);

          const totalStops = stops.length || 0;

          const { count, error: cErr } = await supabase
            .from('destination_ratings')
            .select('destination_id', { count: 'exact', head: true })
            .eq('crawl_id', item.crawl_id);
          if (cErr) throw cErr;

          const rc = Number(count ?? 0);
          const pct = totalStops > 0 ? Math.round((rc / totalStops) * 100) : 0;

          if (!alive) return;
          setStopCount(totalStops);
          setRatedCount(rc);
          setPercent(pct);
        } catch (e) {
          console.warn('progress fetch error', e?.message || e);
          if (!alive) return;
          setStopCount(0);
          setRatedCount(0);
          setPercent(0);
        }
      };

      if (item?.route_id && item?.crawl_id) load();

      return () => {
        alive = false;
      };
    }, [item?.route_id, item?.crawl_id]);

    const progressLabel =
      percent == null || stopCount == null || ratedCount == null ? '…' : `${percent}% (${ratedCount}/${stopCount})`;

    const handleViewCrawlDetail = () => {
      router.push(`/profile/history/${item.crawl_id}`);
    };

    return (
      <Card style={[styles.card, { backgroundColor: cardBg }]} mode="elevated">
        <Card.Content style={styles.rowBetween}>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <Text variant="titleMedium" style={styles.name}>
              {item.route_title}
            </Text>
            <Text variant="bodySmall" style={styles.muted}>
              Started: {fmtDate(item.start_time)}
            </Text>
            <Text variant="bodySmall" style={styles.muted}>
              {item.end_time ? `Ended: ${fmtDate(item.end_time)}` : 'In progress'}
            </Text>
          </View>

          <View style={{ alignItems: 'flex-end', minWidth: 140 }}>
            {isActive ? (
              isViewingSelf ? (
                <Button
                  mode="contained"
                  style={{ borderRadius: 12, backgroundColor: getProgressColor(percent), marginBottom: 6 }}
                  onPress={() => {
                    router.push({
                      pathname: `/crawl/${item.crawl_id}`,
                      params: { resume: '1', prefact: funFact ?? 'Let’s eat some wings!' },
                    });
                  }}
                >
                  {progressLabel}
                </Button>
              ) : (
                <Button mode="outlined" onPress={handleViewCrawlDetail} style={{ borderRadius: 12, marginBottom: 6 }}>
                  View
                </Button>
              )
            ) : (
              <Button mode="outlined" onPress={handleViewCrawlDetail} style={{ borderRadius: 12, marginBottom: 6 }}>
                View
              </Button>
            )}

            {isViewingSelf && (
              <Button
                mode="text"
                textColor="#C62828"
                onPress={() => {
                  Alert.alert(
                    'Remove Crawl?',
                    'This will remove the crawl from your history only; it will remain in the backend.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Remove', style: 'destructive', onPress: () => handleDeleteCrawl(item.crawl_id) },
                    ]
                  );
                }}
              >
                Delete Crawl
              </Button>
            )}
          </View>
        </Card.Content>
      </Card>
    );
  };

  const RatingRow = ({ item }) => {
    const created = item?.created_at ? new Date(item.created_at) : null;
    const dateLabel =
      created && !isNaN(created)
        ? created.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
        : '—';

    const name = item.destinations?.name ?? 'Unknown Restaurant';
    const sauce = Number(item.sauce ?? 0);
    const meat = Number(item.meat ?? 0);
    const crisp = Number(item.crispiness ?? 0);
    const overall = Number(item.overall ?? 0);
    const buffaGoScore = Number(item.weight_score ?? 0);

    return (
      <Card style={[styles.card, { backgroundColor: cardBg }]} mode="elevated">
        <Card.Content style={{ marginBottom: 2 }}>
          <View style={styles.ratingTopRow}>
            <Text variant="titleMedium" style={styles.name} numberOfLines={1} ellipsizeMode="tail">
              {name}
            </Text>
            <Text style={styles.ratingDate} numberOfLines={1} ellipsizeMode="tail">
              {dateLabel}
            </Text>
          </View>

          <View style={styles.ratingMetaRow}>
            <View style={styles.ratingScorePill}>
              <Text style={styles.ratingScoreText}>BuffaGo Score {fmt2(buffaGoScore)}</Text>
            </View>
            <Text style={styles.ratingOverallText}>Experience {fmt2(overall)}/10</Text>
          </View>

          <View style={styles.ratingChipRow}>
            <View style={styles.ratingChip}>
              <Text style={styles.ratingChipLabel}>
                Sauce: <Text style={styles.ratingChipValue}>{fmt2(sauce)}</Text>/10
              </Text>
            </View>
            <View style={styles.ratingChip}>
              <Text style={styles.ratingChipLabel}>
                Meat: <Text style={styles.ratingChipValue}>{fmt2(meat)}</Text>/10
              </Text>
            </View>
            <View style={styles.ratingChip}>
              <Text style={styles.ratingChipLabel}>
                Crisp: <Text style={styles.ratingChipValue}>{fmt2(crisp)}</Text>/10
              </Text>
            </View>
          </View>
        </Card.Content>
      </Card>
    );
  };

  const fallbackUI = useCallback(
    (errText) => {
      return (
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
          <View style={[styles.center, { padding: 16 }]}>
            <Text style={{ textAlign: 'center' }}>History screen crashed during render.</Text>
            <Text style={{ marginTop: 8, opacity: 0.7, textAlign: 'center' }}>
              {String(errText || 'Unknown error')}
            </Text>
          </View>
        </SafeAreaView>
      );
    },
    [theme.colors.background]
  );

  /* ---------- render ---------- */

  return (
    <HistoryErrorBoundary fallback={fallbackUI}>
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={['top']}>
        <View style={{ flex: 1 }} onLayout={handleRootLayout}>
          {authReady && wizardChecked && wizardVisible && (isViewingSelf || !session?.user?.id) && (
            <ProfileWelcomeWizard visible onDone={markProfileWizardSeen} onSkip={markProfileWizardSeen} />
          )}

          <ScreenHeader title={headerTitle} subtitle={headerSubtitle} />

          {!isViewingSelf && session?.user?.id && viewUserProfile?.user_id ? (
            <FriendProfileActions
              targetUserId={viewUserProfile.user_id}
              sourceSurface={toStr(params?.sourceSurface) || 'profile'}
            />
          ) : null}

          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator />
            </View>
          ) : (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
              keyboardShouldPersistTaps="handled"
            >
            <View style={styles.tilesRow}>
              <TouchableOpacity
                activeOpacity={hasCompletedCrawls ? 0.7 : 1}
                onPress={async () => {
                  if (viewUserId) await fetchAll(viewUserId);
                  setDialogMode('completed');
                  setDialogOpen(true);
                }}
                style={[styles.tilePressable, styles.tileClickable, { backgroundColor: cardBg }]}
              >
                <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 10 }}>
                  <Text style={[styles.tileLabel, styles.clickableLabel, { textAlign: 'center' }]} numberOfLines={1}>
                    Crawls YTD
                  </Text>
                  <Text style={[styles.metricValue, styles.clickableValue, { textAlign: 'center' }]}>{crawlsYTD}</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={hasRatings ? 0.7 : 1}
                onPress={async () => {
                  if (viewUserId) await fetchAll(viewUserId);
                  setDialogMode('ratings');
                  setDialogOpen(true);
                }}
                style={[styles.tilePressable, styles.tileClickable, { backgroundColor: cardBg }]}
              >
                <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 10 }}>
                  <Text style={[styles.tileLabel, styles.clickableLabel, { textAlign: 'center' }]} numberOfLines={1}>
                    Rated YTD
                  </Text>
                  <Text style={[styles.metricValue, styles.clickableValue, { textAlign: 'center' }]}>
                    {restaurantsYTD}
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  router.push({
                    pathname: '/profile/history/YearlyWingSummary',
                    params:
                      viewUserId && session?.user?.id && viewUserId !== session.user.id ? { userId: viewUserId } : undefined,
                  });
                }}
                style={[styles.tilePressable, styles.tileClickable, { backgroundColor: cardBg }]}
                activeOpacity={0.7}
              >
                <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 10 }}>
                  <Text style={[styles.tileLabel, styles.clickableLabel]} numberOfLines={1}>
                    Wings YTD
                  </Text>
                  <Text style={[styles.metricValue, styles.clickableValue, { textAlign: 'center' }]}>{wingsYTD}</Text>
                </View>
              </TouchableOpacity>
            </View>

            {isViewingSelf ? <WingCreatorSummaryCard refreshKey={ratings.length} /> : null}

            <WeeklyChallengeStats
              client={supabase}
              userId={viewUserId}
              isPublic={!isViewingSelf}
            />

            <View style={styles.metricsRow}>
              <View
                style={[
                  styles.metricCardWide,
                  { backgroundColor: cardBg, borderColor: outline, borderWidth: StyleSheet.hairlineWidth },
                ]}
              >
                <Text style={styles.metricLabel}>Highest Rated Destination</Text>
                {best ? (
                  <Text style={styles.metricHighlight}>
                    {best.name} · {fmt2(best.avgW)}
                  </Text>
                ) : (
                  <Text style={styles.muted}>—</Text>
                )}
              </View>
            </View>

            <View style={styles.metricsRow}>
              <View
                style={[
                  styles.metricCardWide,
                  { backgroundColor: cardBg, borderColor: outline, borderWidth: StyleSheet.hairlineWidth },
                ]}
              >
                <Text style={styles.metricLabel}>Lowest Rated Destination</Text>
                {worst ? (
                  <Text style={styles.metricHighlight}>
                    {worst.name} · {fmt2(worst.avgW)}
                  </Text>
                ) : (
                  <Text style={styles.muted}>—</Text>
                )}
              </View>
            </View>

            <View style={styles.metricsRow}>
              <View
                style={[
                  styles.metricCardWide,
                  { backgroundColor: cardBg, borderColor: outline, borderWidth: StyleSheet.hairlineWidth },
                ]}
              >
                <Text style={styles.metricLabel}>Most Rated Restaurant</Text>
                {mostFrequent ? (
                  <Text style={styles.metricHighlight}>
                    {mostFrequent.name} · {mostFrequent.n} rating{mostFrequent.n === 1 ? '' : 's'}
                  </Text>
                ) : (
                  <Text style={styles.muted}>—</Text>
                )}
              </View>
            </View>

            <View style={styles.metricsRow}>
              <View
                style={[
                  styles.metricCardWide,
                  { backgroundColor: cardBg, borderColor: outline, borderWidth: StyleSheet.hairlineWidth },
                ]}
              >
                <Text style={styles.metricLabel}>Closest Rating</Text>
                {ratingAlignment.closest ? (
                  <>
                    <Text style={styles.metricHighlight}>{ratingAlignment.closest.name}</Text>
                    <Text style={styles.alignmentLine}>
                      You: <Text style={styles.avgVal}>{fmt2(ratingAlignment.closest.yourAvg)}</Text>
                    </Text>
                    <Text style={styles.alignmentLine}>
                      Everyone: <Text style={styles.avgVal}>{fmt2(ratingAlignment.closest.groupAvg)}</Text>
                    </Text>
                    <Text style={styles.alignmentLine}>
                      Difference: <Text style={styles.avgVal}>{fmt2(ratingAlignment.closest.diff)}</Text>
                    </Text>
                  </>
                ) : (
                  <Text style={styles.muted}>—</Text>
                )}
              </View>

              <View
                style={[
                  styles.metricCardWide,
                  { backgroundColor: cardBg, borderColor: outline, borderWidth: StyleSheet.hairlineWidth },
                ]}
              >
                <Text style={styles.metricLabel}>Farthest Rating</Text>
                {ratingAlignment.farthest ? (
                  <>
                    <Text style={styles.metricHighlight}>{ratingAlignment.farthest.name}</Text>
                    <Text style={styles.alignmentLine}>
                      You: <Text style={styles.avgVal}>{fmt2(ratingAlignment.farthest.yourAvg)}</Text>
                    </Text>
                    <Text style={styles.alignmentLine}>
                      Everyone: <Text style={styles.avgVal}>{fmt2(ratingAlignment.farthest.groupAvg)}</Text>
                    </Text>
                    <Text style={styles.alignmentLine}>
                      Difference: <Text style={styles.avgVal}>{fmt2(ratingAlignment.farthest.diff)}</Text>
                    </Text>
                  </>
                ) : (
                  <Text style={styles.muted}>—</Text>
                )}
              </View>
            </View>

            <View
              style={[
                styles.metricCardWide,
                {
                  padding: 12,
                  marginTop: 8,
                  backgroundColor: cardBg,
                  borderColor: outline,
                  borderWidth: StyleSheet.hairlineWidth,
                },
              ]}
            >
              <Text style={[styles.metricLabel, { marginBottom: 6 }]}>Your Averages</Text>

              <View style={{ marginTop: 2 }}>
                <Text style={styles.avgLine}>
                  Experience: <Text style={styles.avgVal}>{fmt2(avgs.o)}</Text>
                </Text>
                <ProgressBar
                  progress={Number.isFinite(Number(avgs.o)) ? Math.min(1, Math.max(0, Number(avgs.o) / 10)) : 0}
                  style={styles.progress}
                />
              </View>

              <View style={{ marginTop: 10 }}>
                <Text style={styles.avgLine}>
                  Sauce: <Text style={styles.avgVal}>{fmt2(avgs.s)}</Text>
                </Text>
                <ProgressBar
                  progress={Number.isFinite(Number(avgs.s)) ? Math.min(1, Math.max(0, Number(avgs.s) / 10)) : 0}
                  style={styles.progress}
                />
              </View>

              <View style={{ marginTop: 10 }}>
                <Text style={styles.avgLine}>
                  Chicken Quality: <Text style={styles.avgVal}>{fmt2(avgs.m)}</Text>
                </Text>
                <ProgressBar
                  progress={Number.isFinite(Number(avgs.m)) ? Math.min(1, Math.max(0, Number(avgs.m) / 10)) : 0}
                  style={styles.progress}
                />
              </View>

              <View style={{ marginTop: 10 }}>
                <Text style={styles.avgLine}>
                  Crispiness: <Text style={styles.avgVal}>{fmt2(avgs.c)}</Text>
                </Text>
                <ProgressBar
                  progress={Number.isFinite(Number(avgs.c)) ? Math.min(1, Math.max(0, Number(avgs.c) / 10)) : 0}
                  style={styles.progress}
                />
              </View>
            </View>

              <View style={{ marginTop: 16 }}>
                {isViewingSelf && (
                  <Button
                    mode="contained-tonal"
                    icon="trophy"
                    style={{ borderRadius: 12, marginBottom: 10 }}
                    contentStyle={{ paddingVertical: 6 }}
                    onPress={() => {
                      trackEvent({
                        eventName: 'badge_viewed',
                        screen: 'profile_history',
                        userId: session?.user?.id ?? null,
                        metadata: { source_screen: 'profile_history', badge_id: null },
                      });
                      router.push('/profile/history/BadgesScreen');
                    }}
                  >
                    Badges
                  </Button>
                )}

                {isViewingSelf && (
                  <Button
                    mode="outlined"
                    style={{ borderRadius: 12 }}
                    contentStyle={{ paddingVertical: 6 }}
                    onPress={async () => {
                      if (viewUserId) await fetchAll(viewUserId);
                      setDialogMode('active');
                      setDialogOpen(true);
                    }}
                    disabled={activeCrawls.length === 0}
                  >
                    In Progress Crawls
                  </Button>
                )}
              </View>
            </ScrollView>
          )}

          {/* ✅ iOS-safe: unmount the overlay completely when closed */}
          {dialogOpen ? (
            <Card style={[styles.dialogCard, { backgroundColor: surfaceBg }]}>
              <View style={styles.dialogHeader}>
                <TouchableOpacity
                  onPress={() => setDialogOpen(false)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={styles.dialogBackBtn}
                >
                  <MaterialCommunityIcons name="arrow-left" size={26} color={theme.colors.primary} />
                </TouchableOpacity>

                <Text variant="titleMedium" numberOfLines={1} style={styles.dialogTitle}>
                  {dialogMode === 'active'
                    ? 'In Progress Crawls'
                    : dialogMode === 'completed'
                    ? 'Completed Crawls'
                    : 'Your Ratings (YTD)'}
                </Text>

                <View style={styles.dialogRightSpacer} />
              </View>

              <Divider />

              {dialogMode === 'ratings' ? (
                (() => {
                  const ytdRatings = ratings.filter((r) => {
                    const d = r?.created_at ? new Date(r.created_at) : null;
                    return d && !isNaN(d) && d.getFullYear() === nowYear;
                  });

                  if (!ytdRatings.length) {
                    return (
                      <View style={{ alignItems: 'center', padding: 16 }}>
                        <Text>No ratings yet this year.</Text>
                      </View>
                    );
                  }

                  return (
                    <FlatList
                      data={ytdRatings}
                      keyExtractor={(it, idx) =>
                        `${String(it.destination_id ?? 'dest')}-${String(it.created_at ?? idx)}-${idx}`
                      }
                      renderItem={({ item }) => <RatingRow item={item} />}
                      ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
                      contentContainerStyle={{ padding: 12, paddingBottom: 16 }}
                    />
                  );
                })()
              ) : listForDialog.length === 0 ? (
                <View style={{ alignItems: 'center', padding: 16 }}>
                  <Text>No crawls in this bucket.</Text>
                </View>
              ) : (
                <FlatList
                  data={listForDialog}
                  keyExtractor={(it, idx) => String(it?.crawl_id ?? it?.destination_id ?? it?.created_at ?? idx)}
                  renderItem={({ item }) => <CrawlRow item={item} />}
                  ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
                  contentContainerStyle={{ padding: 12, paddingBottom: 16 }}
                />
              )}
            </Card>
          ) : null}
        </View>
      </SafeAreaView>
    </HistoryErrorBoundary>
  );
}

/* ---------------- styles ---------------- */

const ORANGE = '#FF6F00';

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  card: { borderRadius: 16 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: { fontWeight: '700' },
  muted: { opacity: 0.7 },

  tileLabel: { fontWeight: '700', opacity: 0.75, letterSpacing: 0.2, fontSize: 12, lineHeight: 14 },
  tilesRow: { flexDirection: 'row', gap: 8, marginBottom: 8, alignItems: 'stretch' },

  metricValue: { fontWeight: '900', fontSize: 24, marginTop: 4 },

  tilePressable: {
    flex: 1,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    minWidth: 0,
  },
  tileClickable: {
    borderColor: ORANGE,
    shadowColor: ORANGE,
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  clickableLabel: { color: ORANGE },
  clickableValue: { color: ORANGE },

  metricsRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  metricCardWide: { flex: 1, borderRadius: 14, padding: 12 },

  ratingTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  ratingDate: { opacity: 0.7, fontSize: 11, maxWidth: '50%', textAlign: 'right' },
  ratingMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  ratingScorePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 111, 0, 0.16)',
  },
  ratingScoreText: { fontWeight: '800', fontSize: 13, color: ORANGE },

  dialogBackBtn: { padding: 6, borderRadius: 999 },
  dialogTitle: { flex: 1, textAlign: 'center', fontWeight: '800' },
  dialogRightSpacer: { width: 38 },

  ratingOverallText: { fontSize: 12, fontWeight: '600', opacity: 0.8 },
  ratingChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  ratingChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  ratingChipLabel: { fontSize: 11, opacity: 0.85 },
  ratingChipValue: { fontWeight: '800' },

  metricLabel: { fontWeight: '700', opacity: 0.8, letterSpacing: 0.2 },
  metricHighlight: { fontWeight: '900', fontSize: 16, marginTop: 4 },

  alignmentLine: { marginTop: 2, fontSize: 12 },
  avgLine: { fontWeight: '700', opacity: 0.85 },
  avgVal: { fontWeight: '900' },

  progress: { height: 8, borderRadius: 8, marginTop: 6 },

  dialogCard: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 0, elevation: 8 },
  dialogHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#ddd',
  },
});
