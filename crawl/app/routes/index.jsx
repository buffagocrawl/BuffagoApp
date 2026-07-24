// app/routes/index.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { View, FlatList, RefreshControl, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  Card,
  Text,
  Portal,
  Dialog,
  Button,
  Divider,
  Chip,
  ProgressBar,
  useTheme,
  TextInput,
  HelperText,
} from 'react-native-paper';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from '../../lib/platformMap';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../lib/supabase.js';
import { useLocationCtx } from '../../providers/LocationProvider';
import { useRouter } from 'expo-router';
import { getWalkingPath } from '../../utils/walkRoute';
import RoutesWelcomeWizard from '../../components/RoutesWelcomeWizard';

const SEARCH_RADIUS_M = 160934; // 100 miles

/** ---------------- session-scoped guest flag ---------------- */
let guestWizardShownThisSession = false;

/* ---------------- helpers ---------------- */
// Distance (meters)
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

/* ---------------- small UI bits ---------------- */
function OrderBadge({ n }) {
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{n}</Text>
    </View>
  );
}

/* ---------------- main ---------------- */
export default function RoutesIndex() {
  const { coords, status } = useLocationCtx();
  const router = useRouter();
  const { colors, dark } = useTheme();

  // ✅ prevents double-taps and helps ensure we never navigate to /routes/[id]
  const [selectingRoute, setSelectingRoute] = useState(false);

  // palette that adapts to dark/light
  const themed = React.useMemo(() => {
    const cardNeutral = colors.elevation?.level2 ?? colors.surface;
    const cardYellow = dark ? '#3A3212' : '#FFF9C4';
    const chipYellow = dark ? '#4A3F16' : '#FFF3CD';
    const onYellow = dark ? '#F4E7B3' : '#5C4A00';
    const cardGreen = dark ? '#133D2B' : '#C8E6C9';
    const chipGreen = dark ? '#174F39' : '#2E7D32';
    const onGreen = dark ? '#CFF3DD' : '#FFFFFF';
    const pillBg = colors.surfaceVariant;

    return {
      cardNeutral,
      cardYellow,
      onYellow,
      chipYellow,
      cardGreen,
      onGreen,
      chipGreen,
      pillBg,
      textMuted: colors.onSurface,
    };
  }, [colors, dark]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Catalog of route_travel_tag
  const [tags, setTags] = useState([]); // [{id, travel}]

  // Enriched routes (distance, tagLabel, stops array)
  const [routesRaw, setRoutesRaw] = useState([]);

  // Tag filter (null = All, or { key:'id', id })
  const [selectedTag, setSelectedTag] = useState(null);

  // ✅ status filter row (null = all)
  const [selectedStatus, setSelectedStatus] = useState(null); // null | 'completed' | 'in_progress' | 'not_started'

  // Dialogs / active route
  const [openDetails, setOpenDetails] = useState(false);
  const [active, setActive] = useState(null);

  const [openMap, setOpenMap] = useState(false);
  const [mapCoords, setMapCoords] = useState([]); // fallback straight segments
  const [mapPath, setMapPath] = useState([]); // walking polyline
  const mapRef = useRef(null);
  const [previewKey, setPreviewKey] = useState(0);

  // 🍗 Fun-fact loader state
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

  // ✅ Completed routes (turn cards green + show chip)
  const [completionsByRoute, setCompletionsByRoute] = useState({}); // { [route_id]: count }
  const hasCompleted = (routeId) => (completionsByRoute?.[routeId] ?? 0) > 0;

  // 🟡 In-progress crawls: { [route_id]: { crawl_id, hits, total } }
  const [activeProgressByRoute, setActiveProgressByRoute] = useState({});

  // 🔐 Auth session (needed for "Submit a Route" and welcome wizard)
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false); // resolved even if null (guest)

  /* ---------- Completed crawl overview modal ---------- */
  const [openHistory, setOpenHistory] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyRouteTitle, setHistoryRouteTitle] = useState('');
  const [historyCrawl, setHistoryCrawl] = useState(null); // { crawl_id, start_time, end_time }
  const [historyRows, setHistoryRows] = useState([]); // destination_ratings rows
  const [historyStats, setHistoryStats] = useState(null); // { avgOverall, avgCrisp, avgSauce, avgMeat }

  /* ---------- Routes welcome wizard state/handlers ---------- */
  const [welcomeVisible, setWelcomeVisible] = useState(false);
  const [welcomeChecked, setWelcomeChecked] = useState(false); // DB/guest decision completed

  const markRouteWelcomeSeen = useCallback(async () => {
    try {
      const uid = session?.user?.id;
      // Guests: mark session flag and close — no DB write
      if (!uid) {
        guestWizardShownThisSession = true;
        setWelcomeVisible(false);
        return;
      }

      // Upsert so multiple taps won’t error on PK (RLS must allow insert for auth.uid() = user_id)
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

  /* ---------- auth ---------- */
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(data.session ?? null);
      setAuthReady(true); // session resolved (may be null)
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s ?? null);
      setAuthReady(true);
    });
    return () => sub?.subscription?.unsubscribe?.();
  }, []);

  /* ---------- decide whether to show wizard ---------- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!authReady) return; // wait for session to resolve

      // Guest logic: show only once per app session
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

      // Signed-in: query DB once to see if they've seen it
      const { data, error } = await supabase
        .from('users_check_route')
        .select('user_id')
        .eq('user_id', session.user.id)
        .limit(1);

      if (cancelled) return;

      if (error) {
        console.warn('welcomeSeen check failed:', error.message || error);
        setWelcomeVisible(false); // safest -> no flicker
      } else {
        setWelcomeVisible(!(data && data.length > 0));
      }
      setWelcomeChecked(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [authReady, session?.user?.id]);

  /* ---------- load tags once ---------- */
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('route_travel_tag')
        .select('id, travel')
        .order('id', { ascending: true });
      if (!error && Array.isArray(data)) setTags(data);
    })();
  }, []);

  /* ---------- completed crawls for the current user ---------- */
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

  /* ---------- active/in_progress crawl progress ---------- */
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

  /* ---------- load routes ---------- */
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

    const allStopIds = Array.from(
      new Set(
        routeRows.flatMap((r) =>
          [r.stop1_id, r.stop2_id, r.stop3_id, r.stop4_id, r.stop5_id].filter(Boolean)
        )
      )
    );

    if (!allStopIds.length) {
      setRoutesRaw([]);
      return;
    }

    const { data: destRows, error: destErr } = await supabase
      .from('destinations')
      .select('id, name, address, city, lat, lng')
      .in('id', allStopIds);

    if (destErr) throw destErr;

    const destMap = new Map(destRows.map((d) => [d.id, d]));
    const tagMap = new Map(tags.map((t) => [t.id, t.travel]));

    const enriched = [];
    for (const r of routeRows) {
      const stopIds = [r.stop1_id, r.stop2_id, r.stop3_id, r.stop4_id, r.stop5_id].filter(Boolean);
      const stops = stopIds.map((id) => destMap.get(id)).filter(Boolean);
      const first = stops[0];

      let distanceM = null;
      if (coords?.latitude && coords?.longitude && first?.lat != null && first?.lng != null) {
        distanceM = haversineM(coords.latitude, coords.longitude, first.lat, first.lng);
      }

      const travelTagId = r.travel_tag_id ?? null;
      const tagText = travelTagId != null ? tagMap.get(travelTagId) ?? null : null;

      enriched.push({
        id: r.id,
        title: r.title || (first?.name ? `${first.name} & more` : `Route ${r.id}`),
        city: r.city || null,
        travel_tag_id: travelTagId,
        tagLabel: tagText,
        stops,
        distanceM,
        distanceMi: distanceM != null ? distanceM / 1609.34 : null,
      });
    }

    const withDist = enriched
      .filter((x) => typeof x.distanceM === 'number' && x.distanceM <= SEARCH_RADIUS_M)
      .sort((a, b) => a.distanceM - b.distanceM);
    const withoutDist = enriched.filter((x) => x.distanceM == null);

    setRoutesRaw([...withDist, ...withoutDist].slice(0, 50));
  }, [coords?.latitude, coords?.longitude, status, tags]);

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

  /* ---------- tag filtering + status filtering ---------- */
  const filtered = useMemo(() => {
    if (!routesRaw?.length) return [];
    let list = routesRaw;

    // Tag row
    if (selectedTag) {
      if (selectedTag.key === 'id') {
        list = list.filter((r) => r.travel_tag_id === selectedTag.id);
      }
    }

    // Status row
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

  /* ---------- map helpers (single route preview) ---------- */
  const buildMapPreview = useCallback(async (routeItem) => {
    if (!routeItem?.stops?.length) {
      setMapCoords([]);
      setMapPath([]);
      return;
    }
    const coordsList = routeItem.stops
      .filter((s) => s?.lat != null && s?.lng != null)
      .map((s) => ({ latitude: Number(s.lat), longitude: Number(s.lng) }));

    setMapCoords(coordsList);
    try {
      const path = await getWalkingPath(coordsList);
      setMapPath(Array.isArray(path) && path.length ? path : []);
    } catch (e) {
      console.warn('getWalkingPath failed:', e?.message || e);
      setMapPath([]);
    }
  }, []);

  const openMapDialog = useCallback(
    async (item) => {
      setOpenMap(false);
      setMapCoords([]);
      setMapPath([]);
      requestAnimationFrame(async () => {
        setPreviewKey((k) => k + 1);
        await buildMapPreview(item);
        setOpenMap(true);
      });
    },
    [buildMapPreview]
  );

  const fitPreviewMap = () => {
    const coordsToFit = mapPath.length >= 2 ? mapPath : mapCoords;
    if (mapRef.current && coordsToFit.length >= 2) {
      mapRef.current.fitToCoordinates(coordsToFit, {
        edgePadding: { top: 60, right: 60, bottom: 60, left: 60 },
        animated: false,
      });
    }
  };

  /* ---------- ✅ SELECT ROUTE (NO NAV TO /routes/[id]) ---------- */
  const saveSelectedRouteFromList = useCallback(
    async (routeItem) => {
      if (selectingRoute) return;
      if (!routeItem?.id || !routeItem?.stops?.length) return;

      setSelectingRoute(true);
      try {
        const destDto = (d) =>
          d
            ? {
                id: d.id,
                name: d.name,
                address: d.address,
                city: d.city,
                lat: d.lat ?? null,
                lng: d.lng ?? null,
              }
            : null;

        const stop1 = destDto(routeItem.stops[0]);

        const payload = {
          id: routeItem.id,
          title: routeItem.title ?? 'Selected Crawl',
          stop1,
          startOrd: 1,
          startDestination: stop1,
          stopsOrdered: routeItem.stops.map(destDto),
          savedAt: new Date().toISOString(),
        };

        await AsyncStorage.setItem('buffago:selectedRoute', JSON.stringify(payload));

        // close dialogs & clear timers to avoid any second modal flashes
        setOpenMap(false);
        setOpenDetails(false);
        setOpenHistory(false);
        setActive(null);
        setDetailsLoading(false);
        if (factTimerRef.current) {
          clearInterval(factTimerRef.current);
          factTimerRef.current = null;
        }

        // IMPORTANT: go straight to Home (tabs)
        const r = Date.now().toString();
        requestAnimationFrame(() => {
          router.replace({ pathname: '/(tabs)/home', params: { r } });
        });
      } catch (e) {
        console.warn('saveSelectedRouteFromList failed:', e?.message || e);
      } finally {
        // tiny delay prevents double-press on slower devices
        setTimeout(() => setSelectingRoute(false), 400);
      }
    },
    [router, selectingRoute]
  );

  /* ---------- completed crawl overview loader ---------- */
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

      // most recent completed crawl for this route
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

      // your ratings for that crawl + destination info
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

      // averages (your scores)
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

  /* ---------- details dialog flow ---------- */
  const handleOpenDetails = useCallback(
    async (item) => {
      const routeId = item?.id;
      const isActive = !!activeProgressByRoute[routeId];
      const isCompleted = hasCompleted(routeId);

      // ✅ Completed crawls: show overview ONLY (no crawl page, no preview page)
      if (isCompleted && !isActive) {
        await openCompletedOverview(item);
        return;
      }

      // Unchanged behavior for active + not started:
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

  /* ---------- submit-a-route dialog state ---------- */
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

  /* ---------- All-routes map overlay ---------- */
  const [openAllMap, setOpenAllMap] = useState(false);
  const allMapRef = useRef(null);
  const [allMarkers, setAllMarkers] = useState([]); // [{ route, coord }]

  const statusColorFor = useCallback(
    (routeId) => {
      if (activeProgressByRoute[routeId]) return '#F9A825'; // yellow (in progress)
      if (hasCompleted(routeId)) return '#2E7D32'; // green (completed)
      return '#D32F2F'; // red (not started)
    },
    [activeProgressByRoute, hasCompleted]
  );

  const openAllRoutesMap = useCallback(() => {
    const items = (filtered || [])
      .map((r) => {
        const first = r.stops?.[0];
        if (first?.lat != null && first?.lng != null) {
          return {
            route: r,
            coord: { latitude: Number(first.lat), longitude: Number(first.lng) },
          };
        }
        return null;
      })
      .filter(Boolean);

    setAllMarkers(items);
    setOpenAllMap(true);

    requestAnimationFrame(() => {
      if (allMapRef.current && items.length >= 2) {
        allMapRef.current.fitToCoordinates(items.map((i) => i.coord), {
          edgePadding: { top: 60, right: 60, bottom: 60, left: 60 },
          animated: false,
        });
      }
    });
  }, [filtered]);

  /* ---------- render item ---------- */
  const renderItem = ({ item }) => {
    const visited = hasCompleted(item.id);
    const progress = activeProgressByRoute[item.id];
    const isActive = !!progress;
    if (isActive) progress.total = item.stops.length;

    const cardBg = isActive ? themed.cardYellow : visited ? themed.cardGreen : themed.cardNeutral;

    return (
      <Card style={[styles.card, { backgroundColor: cardBg }]} mode="elevated" onPress={() => handleOpenDetails(item)}>
        <Card.Content style={styles.rowBetween}>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <Text variant="titleMedium" style={styles.name}>
              {item.title}
            </Text>

            {/* status chips row */}
            <View style={styles.statusRow}>
              {visited && !isActive ? (
                <Chip
                  compact
                  style={[styles.youRatedChip, { backgroundColor: themed.chipGreen }]}
                  textStyle={{ color: themed.onGreen, fontWeight: '700' }}
                  icon="check"
                >
                  You completed this crawl
                </Chip>
              ) : null}

              {isActive ? (
                <Chip
                  compact
                  style={[styles.inProgressChip, { backgroundColor: themed.chipYellow }]}
                  textStyle={{ color: themed.onYellow, fontWeight: '700' }}
                  icon="progress-clock"
                >
                  You&apos;ve stopped at {progress.hits} of {progress.total}
                </Chip>
              ) : null}
            </View>

            {/* meta line: tag pill (if present) + stop count + distance */}
            <View style={styles.metaRow}>
              {item.tagLabel ? (
                <View style={[styles.pill, { backgroundColor: themed.pillBg }]}>
                  <Text style={styles.pillText}>{item.tagLabel}</Text>
                </View>
              ) : null}

              <View
                style={[
                  styles.pill,
                  { marginLeft: item.tagLabel ? 6 : 0, backgroundColor: themed.pillBg },
                ]}
              >
                <Text style={styles.pillText}>
                  {item.stops.length} {item.stops.length === 1 ? 'stop' : 'stops'}
                </Text>
              </View>

              <Text style={[styles.muted, { color: themed.textMuted, opacity: 0.7 }]}>
                {Number.isFinite(Number(item.distanceMi)) ? ` • ${fmt1(item.distanceMi)} mi away` : ''}
              </Text>
            </View>
          </View>
        </Card.Content>
      </Card>
    );
  };

  /* ---------- header ---------- */
  const Header = () => {
    return (
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <View>
            <Text variant="headlineSmall" style={styles.title}>
              Closest Routes
            </Text>
            <Text variant="bodySmall" style={styles.subtitle}>
              Location based on the first stop
            </Text>
          </View>
          <Button mode="contained-tonal" icon="map" onPress={openAllRoutesMap} style={{ borderRadius: 12 }}>
            Map
          </Button>
        </View>

        {/* Tag filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginTop: 10 }}
          contentContainerStyle={{ paddingRight: 16 }}
        >
          <Chip selected={!selectedTag} onPress={() => setSelectedTag(null)} style={styles.chip}>
            All routes
          </Chip>

          {tags.map((t) => (
            <Chip
              key={t.id}
              selected={!!selectedTag && selectedTag.key === 'id' && selectedTag.id === t.id}
              onPress={() =>
                setSelectedTag(
                  selectedTag?.key === 'id' && selectedTag.id === t.id ? null : { key: 'id', id: t.id, label: t.travel }
                )
              }
              style={styles.chip}
            >
              {t.travel}
            </Chip>
          ))}
        </ScrollView>

        {/* Status filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginTop: 10 }}
          contentContainerStyle={{ paddingRight: 16 }}
        >
          <Chip selected={!selectedStatus} onPress={() => setSelectedStatus(null)} style={styles.chip}>
            All Statuses
          </Chip>

          <Chip
            selected={selectedStatus === 'completed'}
            onPress={() => setSelectedStatus(selectedStatus === 'completed' ? null : 'completed')}
            style={styles.chip}
            icon="check-circle"
          >
            Completed
          </Chip>

          <Chip
            selected={selectedStatus === 'in_progress'}
            onPress={() => setSelectedStatus(selectedStatus === 'in_progress' ? null : 'in_progress')}
            style={styles.chip}
            icon="progress-clock"
          >
            In progress
          </Chip>

          <Chip
            selected={selectedStatus === 'not_started'}
            onPress={() => setSelectedStatus(selectedStatus === 'not_started' ? null : 'not_started')}
            style={styles.chip}
            icon="play-circle-outline"
          >
            Not started
          </Chip>
        </ScrollView>
      </View>
    );
  };

  /* ---------- render ---------- */
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <Header />

      {/* Routes Welcome wizard: render only when fully decided */}
      {authReady && welcomeChecked && welcomeVisible && (
        <RoutesWelcomeWizard visible onDone={markRouteWelcomeSeen} onSkip={markRouteWelcomeSeen} />
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(it) => String(it.id)}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 24 }}>
              <Text>No routes found for this filter near you.</Text>
            </View>
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

      {/* Details dialog (stops + actions) - unchanged for active + not started */}
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
              mode="outlined"
              disabled={!active || selectingRoute}
              onPress={() => {
                if (!active) return;
                openMapDialog(active);
              }}
            >
              Map preview
            </Button>
            <Button
              mode="contained"
              loading={selectingRoute}
              disabled={!active || selectingRoute}
              onPress={() => {
                if (!active) return;
                // ✅ ONLY save + jump home. Never push to /routes/[id]
                saveSelectedRouteFromList(active);
              }}
            >
              Select this route
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {/* ✅ Completed Crawl Overview dialog (read-only) */}
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
                              Overall {r?.overall ?? '—'} • Crisp {r?.crispiness ?? '—'} • Sauce {r?.sauce ?? '—'} • Meat {r?.meat ?? '—'}
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

      {/* Map preview dialog (single route) */}
      <Portal>
        <Dialog visible={openMap} onDismiss={() => setOpenMap(false)} style={styles.dialog}>
          <Dialog.Title style={{ textAlign: 'center' }}>{active?.title ? `${active.title} • Map preview` : 'Map preview'}</Dialog.Title>
          <Dialog.Content>
            {!active ? (
              <View style={{ alignItems: 'center', paddingVertical: 12 }}>
                <ActivityIndicator />
              </View>
            ) : (
              <View style={{ height: 360, borderRadius: 12, overflow: 'hidden' }}>
                <MapView
                  key={`preview-${previewKey}-${active?.id || 'none'}`}
                  ref={mapRef}
                  style={{ flex: 1 }}
                  provider={PROVIDER_GOOGLE}
                  showsUserLocation={status === 'granted'}
                  onMapReady={fitPreviewMap}
                  onLayout={fitPreviewMap}
                >
                  {mapPath.length >= 2 ? (
                    <Polyline
                      coordinates={mapPath}
                      strokeWidth={5}
                      strokeColor="#FF6F00"
                      lineDashPattern={[10, 7]}
                      lineCap="round"
                      lineJoin="round"
                    />
                  ) : (
                    mapCoords.length >= 2 && (
                      <Polyline
                        coordinates={mapCoords}
                        strokeWidth={5}
                        strokeColor="#FF6F00"
                        lineDashPattern={[10, 7]}
                        lineCap="round"
                        lineJoin="round"
                        geodesic
                      />
                    )
                  )}

                  {active?.stops
                    ?.filter((s) => s?.lat != null && s?.lng != null)
                    ?.map((s, idx) => {
                      const latitude = Number(s.lat);
                      const longitude = Number(s.lng);
                      return (
                        <Marker
                          key={s.id || `${latitude}-${longitude}-${idx}`}
                          coordinate={{ latitude, longitude }}
                          title={`${idx + 1}. ${s.name}`}
                          description={s.address}
                        >
                          <OrderBadge n={idx + 1} />
                        </Marker>
                      );
                    })}
                </MapView>
              </View>
            )}
          </Dialog.Content>
          <Dialog.Actions style={{ justifyContent: 'space-between' }}>
            <Button onPress={() => setOpenMap(false)}>Close</Button>
            <Button
              mode="contained"
              loading={selectingRoute}
              disabled={!active || selectingRoute}
              onPress={() => {
                if (!active) return;
                saveSelectedRouteFromList(active);
              }}
            >
              Select this route
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {/* All routes map dialog */}
      <Portal>
        <Dialog visible={openAllMap} onDismiss={() => setOpenAllMap(false)} style={styles.dialog}>
          <Dialog.Title style={{ textAlign: 'center' }}>Routes Map</Dialog.Title>
          <Dialog.Content>
            <View style={{ height: 420, borderRadius: 12, overflow: 'hidden' }}>
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
                        handleOpenDetails(route); // ✅ completed -> overview dialog
                      }}
                    >
                      <View style={[styles.legendDot, { backgroundColor: color, borderColor: '#fff' }]} />
                    </Marker>
                  );
                })}
              </MapView>
            </View>

            {/* Legend */}
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
            <Button onPress={() => setOpenAllMap(false)}>Close</Button>
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
          <Dialog.Title style={{ textAlign: 'center' }}>Submit a Route</Dialog.Title>
          <Dialog.Content>
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
          </Dialog.Content>
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
              Submit
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </SafeAreaView>
  );
}

/* ---------------- styles ---------------- */
const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontWeight: '800' },
  subtitle: { opacity: 0.7, marginTop: 2 },

  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Card shape only; color comes from themed map
  card: { borderRadius: 16 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: { fontWeight: '700' },
  muted: { opacity: 0.7 },

  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },

  youRatedChip: {},
  inProgressChip: {},

  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },

  pill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  pillText: { fontSize: 12, opacity: 0.85 },

  dialog: { alignSelf: 'center', width: '92%', maxWidth: 520, borderRadius: 16 },

  chip: { marginRight: 8, borderRadius: 999 },

  // Map marker bubble
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

  // Fun-fact loader visuals
  loadingBar: { height: 8, borderRadius: 8 },
  funFact: { marginTop: 10, textAlign: 'center', opacity: 0.8 },

  // Legend + markers
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  legendSwatch: { width: 14, height: 14, borderRadius: 7 },
  legendDot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2 },
});
