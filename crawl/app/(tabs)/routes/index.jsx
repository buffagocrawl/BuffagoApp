// app/(tabs)/routes/index.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { View, FlatList, RefreshControl, StyleSheet, ScrollView, Alert, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ActivityIndicator,
  IconButton,
  Card,
  Text,
  Portal,
  Dialog,
  Button,
  Divider,
  ProgressBar,
  useTheme,
  TextInput,
  HelperText,
} from 'react-native-paper';
import MapView, { Marker, PROVIDER_GOOGLE } from '../../../lib/platformMap';
import { mapCoordinate } from '../../../lib/mapSafety';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../../lib/supabase.js';
import { useLocationCtx } from '../../../providers/LocationProvider';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { createSoloCrawl } from '../../../utils/crawls';
import { fetchRandomFunFact } from '../../../utils/funFacts';
import RoutesWelcomeWizard from '../../../components/RoutesWelcomeWizard';
import FeedbackState from '../../../components/ui/FeedbackState';
import RoutePreview from '../../../components/RoutePreview';
import { featuredRecommendation } from '../../../lib/routePreview';
import { trackEvent } from '../../../lib/analytics';
import { SectionHeader, StatusBadge, LoadingSkeleton, SelectionChip as Chip } from '../../../components/ui/OperationUI';

const SEARCH_RADIUS_M = 160934; // 100 miles

/** ---------------- session-scoped guest flag ---------------- */
let guestWizardShownThisSession = false;

/* ---------------- helpers ---------------- */
const haversineM = (lat1, lon1, lat2, lon2) => {
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

const fmt1 = (n) => (Number.isFinite(Number(n)) ? Number(n).toFixed(1) : '—');
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const fmtDateTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString();
};

/* ---------------- main ---------------- */
export default function RoutesIndex() {
  const { coords, status } = useLocationCtx();
  const router = useRouter();

  const params = useLocalSearchParams();
  const openRouteIdParam = params?.openRouteId ? String(params.openRouteId) : null;

  const [pendingOpenRouteId, setPendingOpenRouteId] = useState(null);

  useEffect(() => {
    if (openRouteIdParam) setPendingOpenRouteId(openRouteIdParam);
  }, [openRouteIdParam]);

  const { colors, dark } = useTheme();

  // ---------------- prevents double-taps ----------------
  const [selectingRoute, setSelectingRoute] = useState(false);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [tags, setTags] = useState([]); // [{id, travel}]
  const [routesRaw, setRoutesRaw] = useState([]);
  const [selectedTag, setSelectedTag] = useState(null);
  const [selectedStatus, setSelectedStatus] = useState(null); // null | 'completed' | 'in_progress' | 'not_started'

  // dialogs / active route
  const [openDetails, setOpenDetails] = useState(false);
  const [active, setActive] = useState(null);



  // fun-fact loader
  const FUN_FACTS = useRef([
    'Buffalo wings were invented at Anchor Bar in 1964.',
    'Traditional Buffalo sauce is hot sauce + butter.',
    '“Drums or flats?” is the eternal question.',
    'Celery + blue cheese was the original pairing.',
    'A perfect crisp needs hot oil and a dry surface.',
    'Dry rubs can boost crispiness without extra oil.',
    'Wing size affects cook time and moisture.',
  ]).current;

  const [detailsLoading, setDetailsLoading] = useState(false);
  const [factIndex, setFactIndex] = useState(0);
  const FACT_ROTATE_MS = 3000;
  const MIN_DETAILS_LOAD_MS = 4000;
  const factTimerRef = useRef(null);

  // completed routes
  const [completionsByRoute, setCompletionsByRoute] = useState({});
  const hasCompleted = useCallback((routeId) => (completionsByRoute?.[routeId] ?? 0) > 0, [completionsByRoute]);

  // in-progress crawls
  const [activeProgressByRoute, setActiveProgressByRoute] = useState({});
  const actionLabel = active && activeProgressByRoute?.[active.id] ? 'Resume Crawl' : 'Begin Crawl';

  // auth session
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  // completed crawl overview modal
  const [openHistory, setOpenHistory] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyRouteTitle, setHistoryRouteTitle] = useState('');
  const [historyCrawl, setHistoryCrawl] = useState(null);
  const [historyRows, setHistoryRows] = useState([]);
  const [historyStats, setHistoryStats] = useState(null);

  // welcome wizard
  const [welcomeVisible, setWelcomeVisible] = useState(false);
  const [welcomeChecked, setWelcomeChecked] = useState(false);

  const markRouteWelcomeSeen = useCallback(async () => {
    try {
      const uid = session?.user?.id;
      if (!uid) {
        guestWizardShownThisSession = true;
        setWelcomeVisible(false);
        return;
      }

      const { error } = await supabase
        .from('users_check_route')
        .upsert({ user_id: uid, seen_at: new Date().toISOString() }, { onConflict: 'user_id' });

      if (error) throw error;
    } catch (e) {
      console.warn('welcomeSeen upsert failed:', e?.message || e);
    } finally {
      setWelcomeVisible(false);
    }
  }, [session?.user?.id]);

  // auth
  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(data.session ?? null);
      setAuthReady(true);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s ?? null);
      setAuthReady(true);
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  // decide wizard
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!authReady) return;

      if (!session?.user?.id) {
        if (!guestWizardShownThisSession) {
          if (!cancelled) {
            setWelcomeVisible(true);
            setWelcomeChecked(true);
          }
        } else {
          if (!cancelled) {
            setWelcomeVisible(false);
            setWelcomeChecked(true);
          }
        }
        return;
      }

      const { data, error } = await supabase
        .from('users_check_route')
        .select('user_id')
        .eq('user_id', session.user.id)
        .limit(1);

      if (cancelled) return;

      if (error) {
        console.warn('welcomeSeen check failed:', error.message || error);
        setWelcomeVisible(false);
      } else {
        setWelcomeVisible(!(data && data.length > 0));
      }
      setWelcomeChecked(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [authReady, session?.user?.id]);

  // load tags
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from('route_travel_tag').select('id, travel').order('id', { ascending: true });
      if (!error && Array.isArray(data)) setTags(data);
    })();
  }, []);

  // completed crawls for user
  const fetchCompletions = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id || null;

    if (!userId) {
      setCompletionsByRoute({});
      return;
    }

    const { data, error } = await supabase
      .from('crawls')
      .select('route_id, status')
      .eq('user_id', userId)
      .eq('status', 'completed');

    if (error) {
      console.warn('completions fetch failed', error.message || error);
      setCompletionsByRoute({});
      return;
    }

    const map = {};
    for (const row of data || []) {
      const rid = row.route_id;
      if (!rid) continue;
      map[rid] = (map[rid] || 0) + 1;
    }
    setCompletionsByRoute(map);
  }, []);

  // active progress
  const fetchActiveProgress = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id || null;

    if (!userId) {
      setActiveProgressByRoute({});
      return;
    }

    const { data: crawls, error: crawlErr } = await supabase
      .from('crawls')
      .select('crawl_id, route_id, status')
      .eq('user_id', userId)
      .in('status', ['active', 'in_progress']);

    if (crawlErr) {
      console.warn('active crawls fetch failed', crawlErr.message || crawlErr);
      setActiveProgressByRoute({});
      return;
    }
    if (!crawls?.length) {
      setActiveProgressByRoute({});
      return;
    }

    const crawlIds = crawls.map((c) => c.crawl_id);

    const { data: ratings, error: ratingsErr } = await supabase
      .from('destination_ratings')
      .select('crawl_id, destination_id')
      .in('crawl_id', crawlIds)
      .eq('user_id', userId);

    if (ratingsErr) {
      console.warn('ratings fetch for progress failed', ratingsErr.message || ratingsErr);
      setActiveProgressByRoute({});
      return;
    }

    const destSetByCrawl = new Map();
    for (const r of ratings || []) {
      const cid = r.crawl_id;
      if (!cid) continue;
      if (!destSetByCrawl.has(cid)) destSetByCrawl.set(cid, new Set());
      destSetByCrawl.get(cid).add(r.destination_id);
    }

    const byRoute = {};
    for (const c of crawls) {
      const hits = destSetByCrawl.get(c.crawl_id)?.size ?? 0;
      const existing = byRoute[c.route_id];
      if (!existing || hits > existing.hits) {
        byRoute[c.route_id] = { crawl_id: c.crawl_id, hits, total: 0 };
      }
    }
    setActiveProgressByRoute(byRoute);
  }, []);

  // mapping-first stops
  const fetchStopsByRouteIds = useCallback(async (routeIds) => {
    if (!routeIds?.length) return new Map();

    const { data: mapRows, error: mapErr } = await supabase
      .from('route_ordered_destinations')
      .select('route_id, destination_id, stop_order')
      .in('route_id', routeIds)
      .order('route_id', { ascending: true })
      .order('stop_order', { ascending: true });

    if (mapErr) {
      console.warn('route_ordered_destinations fetch failed', mapErr.message || mapErr);
      return new Map();
    }

    const rows = Array.isArray(mapRows) ? mapRows : [];
    if (!rows.length) return new Map();

    const destIds = Array.from(new Set(rows.map((r) => r.destination_id).filter(Boolean)));

    const { data: destRows, error: destErr } = await supabase
      .from('destinations')
      .select('id, name, address, city, lat, lng')
      .in('id', destIds);

    if (destErr) {
      console.warn('destinations fetch for mapping failed', destErr.message || destErr);
      return new Map();
    }

    const destMap = new Map((destRows || []).map((d) => [d.id, d]));

    const out = new Map();
    for (const r of rows) {
      const rid = r.route_id;
      const did = r.destination_id;
      const dest = destMap.get(did);
      if (!rid || !dest?.id) continue;

      if (!out.has(rid)) out.set(rid, []);
      out.get(rid).push(dest);
    }

    return out;
  }, []);

  // load routes
  const fetchRoutes = useCallback(async () => {
    if (!coords || status !== 'granted') return;

    const { data: routeRows, error: routeErr } = await supabase
      .from('routes')
      .select('id, title, city, travel_tag_id, stop1_id, stop2_id, stop3_id, stop4_id, stop5_id');

    if (routeErr) throw routeErr;

    if (!routeRows?.length) {
      setRoutesRaw([]);
      return;
    }

    const routeIds = routeRows.map((r) => r.id).filter(Boolean);

    const stopsByRouteFromMap = await fetchStopsByRouteIds(routeIds);

    const legacyRoutes = routeRows.filter((r) => !(stopsByRouteFromMap.get(r.id)?.length > 0));
    const allLegacyStopIds = Array.from(
      new Set(
        legacyRoutes.flatMap((r) => [r.stop1_id, r.stop2_id, r.stop3_id, r.stop4_id, r.stop5_id].filter(Boolean))
      )
    );

    let legacyDestMap = new Map();
    if (allLegacyStopIds.length) {
      const { data: destRows, error: destErr } = await supabase
        .from('destinations')
        .select('id, name, address, city, lat, lng')
        .in('id', allLegacyStopIds);

      if (destErr) throw destErr;
      legacyDestMap = new Map((destRows || []).map((d) => [d.id, d]));
    }

    const tagMap = new Map(tags.map((t) => [t.id, t.travel]));

    const enriched = [];
    for (const r of routeRows) {
      const mappedStops = stopsByRouteFromMap.get(r.id) || [];
      let stops = mappedStops;

      if (!stops?.length) {
        const stopIds = [r.stop1_id, r.stop2_id, r.stop3_id, r.stop4_id, r.stop5_id].filter(Boolean);
        stops = stopIds.map((id) => legacyDestMap.get(id)).filter(Boolean);
      }

      const first = stops?.[0] ?? null;

      let distanceM = null;
      if (coords?.latitude && coords?.longitude && first?.lat != null && first?.lng != null) {
        distanceM = haversineM(coords.latitude, coords.longitude, Number(first.lat), Number(first.lng));
      }

      const travelTagId = r.travel_tag_id ?? null;
      const tagText = travelTagId != null ? tagMap.get(travelTagId) ?? null : null;

      enriched.push({
        id: r.id,
        title: r.title || (first?.name ? `${first.name} & more` : `Route ${r.id}`),
        city: r.city || null,
        travel_tag_id: travelTagId,
        tagLabel: tagText,
        stops: Array.isArray(stops) ? stops : [],
        distanceM,
        distanceMi: distanceM != null ? distanceM / 1609.34 : null,
      });
    }

    const withStops = enriched.filter((x) => x.stops?.length);
    const withoutStops = enriched.filter((x) => !x.stops?.length);

    const withDist = withStops
      .filter((x) => typeof x.distanceM === 'number' && x.distanceM <= SEARCH_RADIUS_M)
      .sort((a, b) => a.distanceM - b.distanceM);

    const withoutDist = withStops.filter((x) => x.distanceM == null);

    setRoutesRaw([...withDist, ...withoutDist, ...withoutStops].slice(0, 50));
  }, [coords, status, tags, fetchStopsByRouteIds]);

  // initial load
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        await fetchCompletions();
        await fetchActiveProgress();
        await fetchRoutes();
      } catch (e) {
        console.warn('routes fetch failed', e?.message || e);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [fetchRoutes, fetchCompletions, fetchActiveProgress]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchCompletions();
      await fetchActiveProgress();
      await fetchRoutes();
    } finally {
      setRefreshing(false);
    }
  }, [fetchRoutes, fetchCompletions, fetchActiveProgress]);

  // filtering
  const filtered = useMemo(() => {
    if (!routesRaw?.length) return [];
    let list = routesRaw;

    if (selectedTag?.key === 'id') {
      list = list.filter((r) => r.travel_tag_id === selectedTag.id);
    }

    if (selectedStatus) {
      list = list.filter((r) => {
        const rid = r.id;
        const isActive = !!activeProgressByRoute[rid];
        const isCompleted = hasCompleted(rid);
        const isNotStarted = !isActive && !isCompleted;

        if (selectedStatus === 'completed') return isCompleted && !isActive;
        if (selectedStatus === 'in_progress') return isActive;
        if (selectedStatus === 'not_started') return isNotStarted;
        return true;
      });
    }

    return list;
  }, [routesRaw, selectedTag, selectedStatus, activeProgressByRoute, hasCompleted]);

  useEffect(() => {
    if (loading) return;
    if (filtered.length) return;
    trackEvent({
      eventName: 'empty_state_shown',
      screen: 'routes',
      userId: session?.user?.id ?? null,
      metadata: {
        state: 'routes_no_results',
        selected_status: selectedStatus ?? null,
        selected_tag: selectedTag?.label ?? null,
      },
    });
  }, [filtered.length, loading, selectedStatus, selectedTag?.label, session?.user?.id]);

  // start or resume crawl
  const startOrResumeCrawlFromList = useCallback(
    async (routeItem) => {
      if (selectingRoute) return;
      if (!routeItem?.id || !routeItem?.stops?.length) return;

      setSelectingRoute(true);

      try {
        await trackEvent({
          eventName: 'primary_cta_clicked',
          screen: 'routes',
          userId: session?.user?.id ?? null,
          routeId: routeItem.id,
          metadata: {
            cta_name: activeProgressByRoute?.[routeItem.id] ? 'resume_crawl' : 'begin_crawl',
            source_screen: 'routes',
            city: routeItem?.city ?? null,
          },
        });

        let prefact = '';
        try {
          prefact = (await fetchRandomFunFact()) || '';
        } catch {
          prefact = FUN_FACTS?.[factIndex] || '';
        }

        const destDto = (d) =>
          d
            ? { id: d.id, name: d.name, address: d.address, city: d.city, lat: d.lat ?? null, lng: d.lng ?? null }
            : null;

        const stopsOrdered = routeItem.stops.map(destDto);
        const stop1 = stopsOrdered[0] ?? null;

        const payload = {
          id: routeItem.id,
          title: routeItem.title ?? 'Selected Crawl',
          stop1,
          startOrd: 1,
          startDestination: stop1,
          stopsOrdered,
          savedAt: new Date().toISOString(),
        };

        await AsyncStorage.setItem('buffago:selectedRoute', JSON.stringify(payload));

        setOpenDetails(false);
        setOpenHistory(false);
        setActive(null);
        setDetailsLoading(false);

        if (factTimerRef.current) {
          clearInterval(factTimerRef.current);
          factTimerRef.current = null;
        }

        const progress = activeProgressByRoute?.[routeItem.id];
        const existingCrawlId = progress?.crawl_id ?? null;

        if (existingCrawlId) {
          await trackEvent({
            eventName: 'crawl_started',
            screen: 'routes',
            userId: session?.user?.id ?? null,
            routeId: routeItem.id,
            crawlId: existingCrawlId,
            metadata: { flow_step: 'resume_existing', source_screen: 'routes' },
          });
          router.replace({ pathname: `/crawl/${existingCrawlId}`, params: { prefact } });
          return;
        }

        const { data: userData } = await supabase.auth.getUser();
        const userId = userData?.user?.id || null;

        if (userId && hasCompleted(routeItem.id)) {
          Alert.alert('Already completed', 'You already completed this crawl. Pick another one.');
          return;
        }

        const row = await createSoloCrawl({ routeId: routeItem.id, userId: userId || null });
        await trackEvent({
          eventName: 'crawl_started',
          screen: 'routes',
          userId: userId ?? null,
          routeId: routeItem.id,
          crawlId: row?.crawl_id ?? null,
          metadata: { flow_step: 'created', source_screen: 'routes' },
        });

        router.replace({ pathname: `/crawl/${row.crawl_id}`, params: { prefact } });
      } catch (e) {
        console.warn('startOrResumeCrawlFromList failed:', e?.message || e);
        await trackEvent({
          eventName: 'error_shown',
          screen: 'routes',
          userId: session?.user?.id ?? null,
          routeId: routeItem?.id ?? null,
          metadata: {
            error_message: e?.message || String(e),
            source: 'start_or_resume_crawl',
          },
        });
        Alert.alert('Error', e?.message ?? 'Could not start the crawl.');
      } finally {
        setTimeout(() => setSelectingRoute(false), 400);
      }
    },
    [router, selectingRoute, activeProgressByRoute, hasCompleted, FUN_FACTS, factIndex, session?.user?.id]
  );

  // completed overview
  const openCompletedOverview = useCallback(async (routeItem) => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id || null;
      if (!userId || !routeItem?.id) return;

      setHistoryLoading(true);
      setHistoryRouteTitle(routeItem.title ?? 'Crawl Overview');
      setHistoryCrawl(null);
      setHistoryRows([]);
      setHistoryStats(null);
      setOpenHistory(true);

      const { data: crawls, error: crawlErr } = await supabase
        .from('crawls')
        .select('crawl_id, start_time, end_time')
        .eq('user_id', userId)
        .eq('route_id', routeItem.id)
        .eq('status', 'completed')
        .order('end_time', { ascending: false })
        .limit(1);

      if (crawlErr) throw crawlErr;

      const crawl = crawls?.[0];
      if (!crawl?.crawl_id) {
        setHistoryLoading(false);
        return;
      }
      setHistoryCrawl(crawl);

      const { data: rows, error: rErr } = await supabase
        .from('destination_ratings')
        .select(
          `
            destination_id,
            overall,
            crispiness,
            sauce,
            meat,
            created_at,
            destination:destination_id ( id, name, address, city )
          `
        )
        .eq('crawl_id', crawl.crawl_id)
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

      if (rErr) throw rErr;

      const safe = Array.isArray(rows) ? rows : [];
      setHistoryRows(safe);

      const nums = (arr) => arr.filter((n) => typeof n === 'number' && Number.isFinite(n));
      const avg = (arr) => {
        const a = nums(arr);
        if (!a.length) return null;
        return a.reduce((x, y) => x + y, 0) / a.length;
      };

      setHistoryStats({
        avgOverall: avg(safe.map((x) => x.overall)),
        avgCrisp: avg(safe.map((x) => x.crispiness)),
        avgSauce: avg(safe.map((x) => x.sauce)),
        avgMeat: avg(safe.map((x) => x.meat)),
      });
    } catch (e) {
      console.warn('openCompletedOverview failed:', e?.message || e);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  // details dialog flow
  const handleOpenDetails = useCallback(
    async (item) => {
      const routeId = item?.id;
      const isActive = !!activeProgressByRoute[routeId];
      const isCompleted = hasCompleted(routeId);

      if (isCompleted && !isActive) {
        await openCompletedOverview(item);
        return;
      }

      setActive(item);
      setOpenDetails(true);

      setDetailsLoading(true);
      setFactIndex((i) => (i + 1) % FUN_FACTS.length);

      if (factTimerRef.current) clearInterval(factTimerRef.current);
      factTimerRef.current = setInterval(() => {
        setFactIndex((i) => (i + 1) % FUN_FACTS.length);
      }, FACT_ROTATE_MS);

      await sleep(MIN_DETAILS_LOAD_MS);

      setDetailsLoading(false);
      if (factTimerRef.current) {
        clearInterval(factTimerRef.current);
        factTimerRef.current = null;
      }
    },
    [FUN_FACTS.length, activeProgressByRoute, hasCompleted, openCompletedOverview]
  );

  // auto-open route from params
  useEffect(() => {
    if (!pendingOpenRouteId) return;
    if (!routesRaw?.length) return;

    const match = routesRaw.find((r) => String(r.id) === String(pendingOpenRouteId));
    if (!match) return;

    handleOpenDetails(match);

    setPendingOpenRouteId(null);
    try {
      router.setParams({ openRouteId: undefined, returnTo: undefined });
    } catch {}
  }, [pendingOpenRouteId, routesRaw, handleOpenDetails, router]);

  // submit route dialog
  const [showSubmit, setShowSubmit] = useState(false);
  const [savingSubmit, setSavingSubmit] = useState(false);
  const [submitErr, setSubmitErr] = useState('');
  const [stop1, setStop1] = useState('');
  const [stop2, setStop2] = useState('');
  const [stop3, setStop3] = useState('');
  const [stop4, setStop4] = useState('');
  const [stop5, setStop5] = useState('');
  const hasAnyStop = !!(stop1.trim() || stop2.trim() || stop3.trim() || stop4.trim() || stop5.trim());

  const openSubmit = useCallback(() => {
    if (!session?.user?.id) {
      router.push('/auth/login');
      return;
    }
    setShowSubmit(true);
  }, [session?.user?.id, router]);

  const resetSubmit = () => {
    setStop1('');
    setStop2('');
    setStop3('');
    setStop4('');
    setStop5('');
    setSubmitErr('');
    setSavingSubmit(false);
  };

  const handleSubmitRoute = async () => {
    setSubmitErr('');
    if (!session?.user?.id) {
      setShowSubmit(false);
      return;
    }
    if (!hasAnyStop) {
      setSubmitErr('Please enter at least one restaurant.');
      return;
    }

    setSavingSubmit(true);
    try {
      const payload = {
        user_id: session.user.id,
        stop1: stop1.trim() || null,
        stop2: stop2.trim() || null,
        stop3: stop3.trim() || null,
        stop4: stop4.trim() || null,
        stop5: stop5.trim() || null,
      };
      const { error } = await supabase.from('route_submissions').insert(payload);
      if (error) throw error;
      resetSubmit();
      setShowSubmit(false);
    } catch (e) {
      setSubmitErr(e?.message || String(e));
    } finally {
      setSavingSubmit(false);
    }
  };

  // all routes map overlay
  const [openAllMap, setOpenAllMap] = useState(false);
  const allMapRef = useRef(null);
  const [allMarkers, setAllMarkers] = useState([]);

  const statusColorFor = useCallback(
    (routeId) => {
      if (activeProgressByRoute[routeId]) return '#F9A825';
      if (hasCompleted(routeId)) return '#2E7D32';
      return '#D32F2F';
    },
    [activeProgressByRoute, hasCompleted]
  );

  const openAllRoutesMap = useCallback(() => {
    const items = (filtered || [])
      .map((r) => {
        const first = r.stops?.[0];
        if (mapCoordinate(first)) {
          return { route: r, coord: { latitude: Number(first.lat), longitude: Number(first.lng) } };
        }
        return null;
      })
      .filter(Boolean);

    setAllMarkers(items);
    trackEvent({
      eventName: 'map_opened',
      screen: 'routes',
      userId: session?.user?.id ?? null,
      metadata: {
        source: 'routes_all_map',
        result_count: items.length,
        selected_status: selectedStatus ?? null,
        selected_tag: selectedTag?.label ?? null,
      },
    });
    setOpenAllMap(true);

    // The shared map fits current valid markers only after onMapReady.
  }, [filtered, selectedStatus, selectedTag?.label, session?.user?.id]);

  // Compact cards preserve all existing route data and actions.
  const routeTravelLabel = (item) => tags.find((tag) => tag.id === item.travel_tag_id)?.travel || item.tagLabel;
  const renderItem = ({ item }) => {
    const visited = hasCompleted(item.id);
    const progress = activeProgressByRoute[item.id];
    const isActive = !!progress;
    const totalStops = item.stops?.length ?? 0;
    const hits = progress?.hits ?? 0;
    return (
      <Card mode="outlined" style={[styles.card, { backgroundColor: isActive ? (dark ? '#281A0D' : '#FFF3E0') : visited ? (dark ? '#112619' : '#E8F5E9') : colors.surface, borderColor: isActive ? colors.primary : visited ? '#39794B' : colors.outlineVariant }]}
        onPress={() => handleOpenDetails(item)}>
        <Card.Content style={styles.routeCardContent}>
          <View style={styles.routeTitleRow}>
            <Text variant="titleMedium" style={[styles.name, styles.routeName]}>{item.title}</Text>
            <StatusBadge label={isActive ? 'Active' : visited ? 'Completed' : 'Discover'} status={isActive ? 'active' : visited ? 'completed' : 'neutral'} />
          </View>
          {item.city ? <Text variant="bodySmall" style={styles.muted}>{item.city}</Text> : null}
          <View style={styles.metaRow}>
            <Text variant="bodySmall" style={styles.muted}>{totalStops} {totalStops === 1 ? 'stop' : 'stops'}</Text>
            {routeTravelLabel(item) ? <Text variant="bodySmall" style={styles.muted}> / {routeTravelLabel(item)}</Text> : null}
            {item.distanceMi != null && Number.isFinite(Number(item.distanceMi)) ? <Text variant="bodySmall" style={styles.muted}> / {fmt1(item.distanceMi)} mi to first stop</Text> : null}
          </View>
          {isActive ? <>
            <View style={[styles.rowBetween, { marginTop: 10 }]}>
              <Text variant="labelSmall" style={styles.muted}>Stops rated</Text>
              <Text variant="labelSmall">{hits} / {totalStops}</Text>
            </View>
            <View style={styles.routeProgress}>
              <ProgressBar progress={totalStops > 0 ? Math.max(0, Math.min(1, hits / totalStops)) : 0} color="#E7AD43" style={{ height: 7, borderRadius: 999 }} />
            </View>
          </> : null}
          <Button mode={isActive ? 'contained' : 'outlined'} icon={isActive ? 'play' : visited ? 'check-circle-outline' : 'arrow-right'}
            style={{ marginTop: 12, borderRadius: 10, alignSelf: isActive ? 'stretch' : 'flex-start' }} disabled={selectingRoute}
            onPress={() => isActive ? startOrResumeCrawlFromList(item) : handleOpenDetails(item)}>
            {isActive ? 'Resume crawl' : visited ? 'Review crawl' : 'View route'}
          </Button>
        </Card.Content>
      </Card>
    );
  };

  const featured = !selectedStatus || selectedStatus === 'not_started' ? featuredRecommendation(filtered, activeProgressByRoute, hasCompleted) : null;
  const listedRoutes = featured ? filtered.filter((route) => route.id !== featured.id) : filtered;
  const renderFeatured = (item) => (
    <Card mode="outlined" style={[styles.card, { borderColor: colors.outlineVariant, marginBottom: 18 }]} onPress={() => handleOpenDetails(item)}>
      <View style={styles.featureHeading}><Text variant="titleMedium" style={styles.name}>Recommended near you</Text></View>
      <RoutePreview stops={item.stops} />
      <Card.Content style={styles.featureContent}>
        <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="titleMedium" style={styles.name}>{item.title}</Text>
        <Text variant="bodySmall" style={styles.featureMeta}>{item.stops?.length ?? 0} stops / {item.distanceMi != null && Number.isFinite(Number(item.distanceMi)) ? fmt1(item.distanceMi) + ' mi to first stop' : 'Distance unavailable'}</Text>
          {routeTravelLabel(item) ? <Text variant="labelSmall" style={styles.muted}>{routeTravelLabel(item)}</Text> : null}
        </View>
        <IconButton mode="contained" icon="arrow-right" accessibilityLabel="View crawl" style={{ backgroundColor: colors.primary, margin: 0 }} iconColor={colors.onPrimary} onPress={() => handleOpenDetails(item)} />
      </Card.Content>
    </Card>
  );

  // header
  const Header = () => {
    return (
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <View style={{ flex: 1, minWidth: 100 }}>
            <Text variant="titleLarge" style={styles.title}>
              Crawls
            </Text>
          </View>
          <IconButton icon="map-outline" mode="outlined" accessibilityLabel="Open routes map" onPress={openAllRoutesMap} style={{ margin: 0, marginRight: 6 }} />
          <Button mode="contained" icon="plus" compact onPress={openSubmit} style={{ borderRadius: 12 }} contentStyle={{ minHeight: 44 }} labelStyle={{ marginHorizontal: 10 }}>Create crawl</Button>
        </View>
        <Text variant="bodySmall" style={styles.subtitle}>Plan. Explore. Conquer.</Text>



        <View style={[styles.discoverySegments, { backgroundColor: colors.surfaceVariant }]}>
          {[[null, 'Nearby'], ['in_progress', 'My Crawls'], ['completed', 'Completed']].map(([value, label]) => (
            <Pressable key={label} accessibilityRole="button" accessibilityState={{ selected: selectedStatus === value }}
              onPress={() => setSelectedStatus(value)}
              style={[styles.segment, { backgroundColor: selectedStatus === value ? colors.primary : 'transparent' }]}>
              <Text variant="labelMedium" style={{ textAlign: 'center', color: selectedStatus === value ? colors.onPrimary : colors.onSurface }}>{label}</Text>
            </Pressable>
          ))}
        </View>
        <View style={[styles.filterRail, { marginTop: 10 }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginRight: 36 }} contentContainerStyle={{ paddingRight: 36 }}>
          <Chip selected={!selectedTag} maxFontSizeMultiplier={1.2} accessibilityLabel="All routes" onPress={() => setSelectedTag(null)} style={styles.chip}>
            All routes
          </Chip>

          {tags.map((t) => (
            <Chip
              key={t.id}
              selected={!!selectedTag && selectedTag.key === 'id' && selectedTag.id === t.id}
              maxFontSizeMultiplier={1.2}
              accessibilityLabel={t.travel}
              onPress={() =>
                setSelectedTag(
                  selectedTag?.key === 'id' && selectedTag.id === t.id ? null : { key: 'id', id: t.id, label: t.travel }
                )
              }
              style={styles.chip}
            >
              {t.travel === 'Walkable and Short Drive' ? 'Walk + drive' : t.travel}
            </Chip>
          ))}
          <Chip selected={selectedStatus === 'not_started'} maxFontSizeMultiplier={1.2} accessibilityLabel="Not started" onPress={() => setSelectedStatus(selectedStatus === 'not_started' ? null : 'not_started')} style={styles.chip}>Not started</Chip>
        </ScrollView>
        <LinearGradient pointerEvents="none" colors={['transparent', colors.background]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.filterRailHint}>
          <MaterialCommunityIcons name="chevron-right" size={20} color={colors.onSurfaceVariant} />
        </LinearGradient>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Welcome wizard */}
      {authReady && welcomeChecked && welcomeVisible && (
        <RoutesWelcomeWizard visible onDone={markRouteWelcomeSeen} onSkip={markRouteWelcomeSeen} />
      )}

      {loading ? (
        <View style={{ padding: 16, gap: 12 }}><Header /><LoadingSkeleton height={160} /><LoadingSkeleton height={130} /></View>
      ) : (
        <FlatList
          data={listedRoutes}
          keyExtractor={(it) => String(it.id)}
          renderItem={renderItem}
          contentContainerStyle={{
            padding: 16,
            paddingBottom: 20,
            paddingTop: 4,
          }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={<>
            <Header />
            {featured ? renderFeatured(featured) : null}
            <SectionHeader title={selectedStatus === 'in_progress' ? 'Continue your crawls' : selectedStatus === 'completed' ? 'Completed crawls' : selectedStatus === 'not_started' ? 'Discover more crawls' : 'Your crawls & more'}
              subtitle={listedRoutes.length + ' routes / within 100 miles when distance is available'} />
          </>}
          ListEmptyComponent={featured ? null :
            <FeedbackState
              style={{ marginTop: 24 }}
              icon="map-marker-path"
              title="No crawls match this view"
              body="Clear a filter, open the map, or submit a route that deserves to become a wing quest."
              actionLabel="Submit route"
              onAction={() => {
                trackEvent({
                  eventName: 'primary_cta_clicked',
                  screen: 'routes',
                  userId: session?.user?.id ?? null,
                  metadata: { cta_name: 'submit_route_empty', source_screen: 'routes' },
                });
                openSubmit();
              }}
              secondaryLabel="View map"
              onSecondary={openAllRoutesMap}
            />
          }
          ListFooterComponent={
            <View style={{ paddingTop: 16, paddingBottom: 24 }}>
              <Divider style={{ marginBottom: 12 }} />
              <Button mode="contained" style={{ borderRadius: 14 }} onPress={openSubmit}>
                Submit a Route
              </Button>
              <Text style={{ marginTop: 6, opacity: 0.7, textAlign: 'center' }}>Suggest up to five restaurants!</Text>
            </View>
          }
        />
      )}

      {/* Details dialog */}
      <Portal>
        <Dialog
          visible={openDetails}
          onDismiss={() => {
            setOpenDetails(false);
            setDetailsLoading(false);
            if (factTimerRef.current) {
              clearInterval(factTimerRef.current);
              factTimerRef.current = null;
            }
          }}
          style={styles.dialog}
        >
          <Dialog.Title style={{ textAlign: 'center' }}>{active?.title ?? 'Route'}</Dialog.Title>
          <Dialog.Content>
            {!active || detailsLoading ? (
              <View style={{ paddingVertical: 12 }}>
                <ProgressBar indeterminate style={styles.loadingBar} />
                <Text style={styles.funFact}>{FUN_FACTS[factIndex]}</Text>
                <View style={{ alignItems: 'center', marginTop: 10 }}>
                  <ActivityIndicator />
                </View>
              </View>
            ) : (
              <>
                <Text variant="bodySmall" style={{ opacity: 0.7 }}>
                  {Number.isFinite(Number(active?.distanceMi)) ? `${fmt1(active.distanceMi)} mi to first stop` : 'Distance unknown'}
                </Text>

                <Divider style={{ marginVertical: 10 }} />

                <Text style={styles.sectionTitle}>Stops</Text>
                <View style={{ maxHeight: 320 }}>
                  <ScrollView>
                    {active?.stops?.map((s, idx) => (
                      <View key={s?.id || idx} style={styles.stopRow}>
                        <Text style={styles.stopNum}>{idx + 1}.</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.stopName}>{s?.name ?? 'Unknown'}</Text>
                          <Text style={styles.stopAddr} numberOfLines={1}>
                            {s?.address}
                            {s?.city ? `, ${s.city}` : ''}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </ScrollView>
                </View>
              </>
            )}
          </Dialog.Content>
          <Dialog.Actions style={{ gap: 8 }}>
            <Button
              mode="contained"
              loading={selectingRoute}
              disabled={!active || selectingRoute}
              onPress={() => {
                if (!active) return;
                startOrResumeCrawlFromList(active);
              }}
            >
              {actionLabel}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {/* Completed Crawl Overview dialog */}
      <Portal>
        <Dialog visible={openHistory} onDismiss={() => setOpenHistory(false)} style={styles.dialog}>
          <Dialog.Title style={{ textAlign: 'center' }}>{historyRouteTitle || 'Crawl Overview'}</Dialog.Title>

          <Dialog.Content>
            {historyLoading ? (
              <View style={{ paddingVertical: 12 }}>
                <ProgressBar indeterminate style={styles.loadingBar} />
                <Text style={styles.funFact}>Loading your crawl overview…</Text>
                <View style={{ alignItems: 'center', marginTop: 10 }}>
                  <ActivityIndicator />
                </View>
              </View>
            ) : (
              <>
                <Text variant="bodySmall" style={{ opacity: 0.7 }}>
                  {historyCrawl?.end_time ? `Completed: ${fmtDateTime(historyCrawl.end_time)}` : 'Completed crawl'}
                </Text>

                {!!historyStats && (
                  <View style={{ marginTop: 10 }}>
                    <Text style={styles.sectionTitle}>Your averages</Text>
                    <Text style={{ opacity: 0.85 }}>
                      Overall: {historyStats.avgOverall != null ? historyStats.avgOverall.toFixed(1) : '—'} • Crisp:{' '}
                      {historyStats.avgCrisp != null ? historyStats.avgCrisp.toFixed(1) : '—'} • Sauce:{' '}
                      {historyStats.avgSauce != null ? historyStats.avgSauce.toFixed(1) : '—'} • Meat:{' '}
                      {historyStats.avgMeat != null ? historyStats.avgMeat.toFixed(1) : '—'}
                    </Text>
                  </View>
                )}

                <Divider style={{ marginVertical: 10 }} />

                <Text style={styles.sectionTitle}>Your ratings</Text>
                <View style={{ maxHeight: 360 }}>
                  <ScrollView>
                    {historyRows?.length ? (
                      historyRows.map((r, idx) => (
                        <View key={`${r.destination_id}-${idx}`} style={styles.stopRow}>
                          <Text style={styles.stopNum}>{idx + 1}.</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.stopName}>{r?.destination?.name ?? 'Unknown'}</Text>
                            <Text style={styles.stopAddr} numberOfLines={1}>
                              {r?.destination?.address}
                              {r?.destination?.city ? `, ${r.destination.city}` : ''}
                            </Text>
                            <Text style={{ marginTop: 2, opacity: 0.85 }}>
                              Overall {r?.overall ?? '—'} • Crisp {r?.crispiness ?? '—'} • Sauce {r?.sauce ?? '—'} • Meat{' '}
                              {r?.meat ?? '—'}
                            </Text>
                          </View>
                        </View>
                      ))
                    ) : (
                      <Text style={{ opacity: 0.7 }}>No ratings found for this crawl.</Text>
                    )}
                  </ScrollView>
                </View>
              </>
            )}
          </Dialog.Content>

          <Dialog.Actions>
            <Button onPress={() => setOpenHistory(false)}>Close</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {/* All routes map dialog */}
      <Portal>
        <Dialog visible={openAllMap} onDismiss={() => setOpenAllMap(false)} style={styles.dialog}>
          <Dialog.Title style={{ textAlign: 'center' }}>Routes Map</Dialog.Title>
          <Dialog.Content>
            <View style={{ height: 280, borderRadius: 12, overflow: 'hidden' }}>
              <MapView
                ref={allMapRef}
                style={{ flex: 1 }}
                provider={PROVIDER_GOOGLE}
                showsUserLocation={status === 'granted'}
                initialRegion={{
                  latitude: coords?.latitude ?? 41.7677,
                  longitude: coords?.longitude ?? -72.6748,
                  latitudeDelta: 0.4,
                  longitudeDelta: 0.4,
                }}
              >
                {allMarkers.map(({ route, coord }) => {
                  const color = statusColorFor(route.id);
                  return (
                    <Marker
                      key={route.id}
                      coordinate={coord}
                      onPress={() => {
                        setOpenAllMap(false);
                        handleOpenDetails(route);
                      }}
                    >
                      <View style={[styles.legendDot, { backgroundColor: color, borderColor: '#fff' }]} />
                    </Marker>
                  );
                })}
              </MapView>
            </View>

            <View style={{ marginTop: 10 }}>
              <View style={styles.legendRow}>
                <View style={[styles.legendSwatch, { backgroundColor: '#D32F2F' }]} />
                <Text>Not started</Text>
              </View>
              <View style={styles.legendRow}>
                <View style={[styles.legendSwatch, { backgroundColor: '#F9A825' }]} />
                <Text>In progress</Text>
              </View>
              <View style={styles.legendRow}>
                <View style={[styles.legendSwatch, { backgroundColor: '#2E7D32' }]} />
                <Text>Completed</Text>
              </View>
            </View>
          </Dialog.Content>
          <Dialog.Actions style={{ justifyContent: 'space-between' }}>
            <Button
              mode="outlined"
              onPress={() => {
                if (!coords || !allMapRef.current) return;
                allMapRef.current.animateToRegion(
                  {
                    latitude: coords.latitude,
                    longitude: coords.longitude,
                    latitudeDelta: 0.12,
                    longitudeDelta: 0.12,
                  },
                  300
                );
              }}
            >
              My location
            </Button>
            <Button contentStyle={{ minHeight: 44 }} onPress={() => setOpenAllMap(false)}>Close</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {/* Submit a Route dialog */}
      <Portal>
        <Dialog
          visible={showSubmit}
          onDismiss={() => {
            resetSubmit();
            setShowSubmit(false);
          }}
          style={styles.dialog}
        >
          <Dialog.Title style={{ textAlign: 'center' }}>Suggest a Crawl</Dialog.Title>
          <Text style={{ marginHorizontal: 24, marginBottom: 12 }}>Propose a crawl for review. Submission does not create a playable route immediately.</Text>
          <Dialog.ScrollArea>
            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 280 }} contentContainerStyle={{ paddingVertical: 12 }}>
            <Text style={{ marginBottom: 8 }}>Add up to five restaurants you think should be a wing crawl.</Text>

            <TextInput label="Stop 1" value={stop1} onChangeText={setStop1} style={{ marginBottom: 8 }} />
            <TextInput label="Stop 2" value={stop2} onChangeText={setStop2} style={{ marginBottom: 8 }} />
            <TextInput label="Stop 3" value={stop3} onChangeText={setStop3} style={{ marginBottom: 8 }} />
            <TextInput label="Stop 4" value={stop4} onChangeText={setStop4} style={{ marginBottom: 8 }} />
            <TextInput label="Stop 5" value={stop5} onChangeText={setStop5} style={{ marginBottom: 8 }} />

            <HelperText type={hasAnyStop ? 'info' : 'error'} visible>
              {hasAnyStop ? 'Optional: you don’t need all five.' : 'At least one stop is required.'}
            </HelperText>

            {submitErr ? <Text style={{ color: colors.error }}>{submitErr}</Text> : null}
                      </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions style={{ justifyContent: 'space-between' }}>
            <Button
              onPress={() => {
                resetSubmit();
                setShowSubmit(false);
              }}
            >
              Cancel
            </Button>
            <Button mode="contained" onPress={handleSubmitRoute} disabled={!hasAnyStop || savingSubmit} loading={savingSubmit}>
              Submit suggestion
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </SafeAreaView>
  );
}

/* ---------------- styles ---------------- */
const styles = StyleSheet.create({
  filterRail: { position: 'relative' },
  filterRailHint: { position: 'absolute', top: 0, right: 0, bottom: 0, width: 36, alignItems: 'center', justifyContent: 'center' },
  header: { paddingTop: 8, paddingBottom: 16 },
  featureHeading: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8 },
  featureContent: { paddingVertical: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  featureMeta: { marginTop: 5, marginBottom: 6, opacity: 0.8 },
  discoverySegments: { marginTop: 14, borderRadius: 14, flexDirection: 'row', padding: 3, gap: 3 },
  segment: { flex: 1, borderRadius: 12, minHeight: 44, justifyContent: 'center', paddingHorizontal: 3, paddingVertical: 8 },
  headerTopRow: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 6, alignItems: 'center', justifyContent: 'space-between' },
  title: { fontWeight: '800' },
  subtitle: { opacity: 0.7, marginTop: 2 },

  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  card: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: { fontWeight: '700' },
  muted: { opacity: 0.7 },
  routeCardContent: { paddingVertical: 14, paddingHorizontal: 14 },
  routeName: { flex: 1, minWidth: 0, paddingRight: 8 },
  routeTitleRow: { flexDirection: 'row', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' },
  routeCtaPill: {
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 8,
    minWidth: 54,
    maxWidth: 76,
    flexShrink: 0,
    alignItems: 'center',
  },
  routeCtaText: { color: '#fff', fontWeight: '900', fontSize: 11 },
  routeProgress: { height: 7, borderRadius: 999, marginTop: 10 },

  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },

  youRatedChip: {},
  inProgressChip: {},

  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 6 },

  pill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  pillText: { fontSize: 12, opacity: 0.85 },

  dialog: { alignSelf: 'center', width: '92%', maxWidth: 520, borderRadius: 16 },

  chip: { marginRight: 8, borderRadius: 999, minHeight: 44, justifyContent: 'center' },

  badge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#0B64C0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontWeight: '900', fontSize: 12 },

  sectionTitle: { fontWeight: '800', marginBottom: 8 },

  stopRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  stopNum: { width: 22, textAlign: 'right', marginRight: 8, fontWeight: '800', opacity: 0.8 },
  stopName: { fontWeight: '700' },
  stopAddr: { opacity: 0.7 },

  loadingBar: { height: 8, borderRadius: 8 },
  funFact: { marginTop: 10, textAlign: 'center', opacity: 0.8 },

  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  legendSwatch: { width: 14, height: 14, borderRadius: 7 },
  legendDot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2 },
});
