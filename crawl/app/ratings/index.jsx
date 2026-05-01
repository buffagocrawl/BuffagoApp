// app/ratings/index.jsx
import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { View, FlatList, RefreshControl, StyleSheet, ScrollView, DeviceEventEmitter } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  Card,
  Text,
  Portal,
  Dialog,
  Button,
  Divider,
  Searchbar,
  Chip,
  ProgressBar,
  useTheme,
} from 'react-native-paper';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../lib/supabase.js';
import { useLocationCtx } from '../../providers/LocationProvider';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';

/* ---------------- helpers ---------------- */
const fmt2 = (n) => {
  if (n === null || n === undefined) return '—';
  const num = Number(n);
  return Number.isFinite(num) ? num.toFixed(2) : '—';
};

// Haversine distance (meters)
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

// Try to pull a US state code (e.g., CT, NJ) from an address string
const deriveStateCode = (address) => {
  if (!address || typeof address !== 'string') return null;

  // Common pattern: "..., City, ST 01234" or "..., City, ST"
  const m = address.match(/,\s*([A-Z]{2})\s+\d{5}(-\d{4})?/);
  if (m) return m[1];

  // Fallback: look at comma-separated segments from the end
  const parts = address.split(',');
  for (let i = parts.length - 1; i >= 0; i--) {
    const token = parts[i].trim();
    const m2 = token.match(/^([A-Z]{2})(\s*\d{5})?$/i);
    if (m2) return m2[1].toUpperCase();
  }

  return null;
};

/* ---------- compact UI bits for the drill-down ---------- */
function ScoreHeader({ value }) {
  const { colors, dark } = useTheme();
  const themed = React.useMemo(() => {
    const headerBg = dark ? colors.surfaceVariant : '#FFF4E9';
    const headerText = colors.onSurface;
    const accent = dark ? colors.primary : '#B84C00';
    const sub = dark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)';
    return { headerBg, headerText, accent, sub };
  }, [colors, dark]);

  return (
    <View style={[styles.scoreHeader, { backgroundColor: themed.headerBg }]}>
      <Text style={[styles.scoreHeaderLabel, { color: themed.headerText }]}>Buffago Score</Text>
      <Text style={[styles.scoreHeaderValue, { color: themed.accent }]}>{fmt2(value)}</Text>
      <Text style={[styles.scoreHeaderSub, { color: themed.sub }]}>Weighted out of 100</Text>
    </View>
  );
}

function MetricPretty({ label, value, max = 10 }) {
  const { colors, dark } = useTheme();
  const themed = React.useMemo(
    () => ({
      bg: dark ? '#1F2328' : '#F7F7F8',
      label: colors.onSurface,
      bar: colors.primary,
    }),
    [colors, dark]
  );
  const pct = Number.isFinite(Number(value)) ? Math.max(0, Math.min(1, Number(value) / max)) : 0;
  return (
    <View style={[styles.metricPretty, { backgroundColor: themed.bg }]}>
      <View style={styles.metricHeader}>
        <Text style={[styles.metricPrettyLabel, { color: themed.label }]}>{label}</Text>
        <Text style={[styles.metricPrettyVal, { color: themed.label }]}>{fmt2(value)}</Text>
      </View>
      <ProgressBar progress={pct} style={styles.metricBar} />
    </View>
  );
}

function TagChips({ items }) {
  const { colors } = useTheme();
  if (!items || items.length === 0) {
    return <Text style={{ opacity: 0.7 }}>No tag data yet.</Text>;
  }
  return (
    <View style={styles.tagChipWrap}>
      {items.map((t, i) => (
        <Chip
          key={`${t.id}-${i}`}
          style={[styles.tagChip, { backgroundColor: colors.surfaceVariant }]}
          compact
        >
          {t.name} <Text style={{ opacity: 0.75 }}> · {t.count}</Text>
        </Chip>
      ))}
    </View>
  );
}

/* ---------------- main ---------------- */
export default function PublicRatingsScreen() {
  const router = useRouter();
  const { coords, status } = useLocationCtx();
  const { colors, dark } = useTheme();

  const params = useLocalSearchParams();

  // Deep-link / cross-screen params
  const openDestinationId = params?.openDestinationId ? String(params.openDestinationId) : null;
  const qParam = params?.q != null ? String(params.q) : '';
  const tagParam = params?.tag != null ? String(params.tag) : ''; // expected: 'all' | 'my' | '<number>' | ''

  const lastAutoOpenedRef = useRef(null);
  const lastAppliedSearchRef = useRef(''); // prevent loops when params re-render

  // theme palette for this screen
  const themed = React.useMemo(() => {
    const neutralCard = colors.elevation?.level2 ?? colors.surface;

    const scoreBadgeBg = dark ? '#3A2A17' : '#FFE7D3';
    const scoreBadgeText = dark ? '#F5C19B' : '#B84C00';

    const ratedCardBg = dark ? '#133D2B' : '#E8F5E9';
    const ratedBorder = dark ? '#2B7A59' : '#9AD8A5';
    const ratedName = dark ? '#CFF3DD' : '#1B5E20';
    const ratedBadgeBg = dark ? '#174F39' : '#D1FADF';
    const ratedBadgeText = dark ? '#CFF3DD' : '#0F6B3E';
    const ratedChipBg = dark ? '#174F39' : '#DCFCE7';
    const ratedChipText = dark ? '#CFF3DD' : '#0F6B3E';

    const pillBg = colors.surfaceVariant;

    return {
      neutralCard,
      scoreBadgeBg,
      scoreBadgeText,
      ratedCardBg,
      ratedBorder,
      ratedName,
      ratedBadgeBg,
      ratedBadgeText,
      ratedChipBg,
      ratedChipText,
      pillBg,
      muted: colors.onSurface,
    };
  }, [colors, dark]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [rows, setRows] = useState([]);

  const [tagNameById, setTagNameById] = useState({});
  // selectedTagId:
  // - null       => no specific tag filter
  // - 'my'       => only places you've rated, sorted by your rating desc
  // - number(id) => filter by that tag, sort by overall score desc
  const [selectedTagId, setSelectedTagId] = useState(null);

  // Derived from GPS + nearest destination; used to filter by state via address
  const [currentState, setCurrentState] = useState(null);
  const [useStateFilter, setUseStateFilter] = useState(false);

  const [myRated, setMyRated] = useState(new Set());

  const RADIUS_OPTIONS = [5, 10, 25, 50, 100, 250];
  const [radiusMiles, setRadiusMiles] = useState(100);

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(null);

  const [query, setQuery] = useState('');

  const [routesForActive, setRoutesForActive] = useState([]);
  const [routesLoading, setRoutesLoading] = useState(false);

  const [openMap, setOpenMap] = useState(false);
  const allMapRef = useRef(null);

  useEffect(() => {
  const sub = DeviceEventEmitter.addListener('buffago:coins_refresh', async () => {
    // call whatever you already use to load coin balance
    await refreshCoins(); // <-- replace with your actual function name
  });

    return () => sub.remove();
  }, [refreshCoins]);
  

  // ✅ Apply Home->Ratings parameters:
  // - q: prefill search bar
  // - tag: 'all' => reset to All tags; 'my' => Rated by you; number => that tag
  // We do NOT force other facets (radius/state) so the user keeps their last preference.
  useEffect(() => {
    const signature = `${qParam}||${tagParam}`;
    if (signature === lastAppliedSearchRef.current) return;

    // Only apply if something meaningful is present
    if (!qParam && !tagParam) return;

    lastAppliedSearchRef.current = signature;

    // Apply query
    if (qParam) setQuery(String(qParam));

    // Apply tag
    if (!tagParam || tagParam === 'all') setSelectedTagId(null);
    else if (tagParam === 'my') setSelectedTagId('my');
    else {
      const n = Number(tagParam);
      if (Number.isFinite(n)) setSelectedTagId(n);
      else setSelectedTagId(null);
    }

    // Close any open dialogs; user is coming from another screen
    setOpen(false);
    setActive(null);
  }, [qParam, tagParam]);

  const statusColorFor = useCallback(
    (destinationId) => {
      if (myRated.has(destinationId)) return '#2E7D32';
      return '#D32F2F';
    },
    [myRated]
  );

  const openRestaurantsMap = useCallback(() => {
    setOpenMap(true);
    requestAnimationFrame(() => {
      const points = (filtered || [])
        .filter((r) => Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lng)))
        .map((r) => ({ latitude: Number(r.lat), longitude: Number(r.lng) }));
      if (allMapRef.current && points.length >= 2) {
        allMapRef.current.fitToCoordinates(points, {
          edgePadding: { top: 60, right: 60, bottom: 60, left: 60 },
          animated: false,
        });
      }
    });
  }, []); // filtered captured from render; no dep to avoid loops

  /* ---------- FACET PIPELINE ---------- */

  const rowsForFacetCounts = useMemo(() => {
    let data = rows;

    // radius OR state filter (for facet counts)
    if (useStateFilter && currentState) {
      data = data.filter((r) => r.stateCode === currentState);
    } else if (coords?.latitude && coords?.longitude && Number.isFinite(Number(radiusMiles))) {
      data = data.filter((r) =>
        Number.isFinite(Number(r.distanceMi)) ? r.distanceMi <= radiusMiles : true
      );
    }

    // search
    const q = query.trim().toLowerCase();
    if (q) {
      data = data.filter((r) => (r.name || '').toLowerCase().includes(q));
    }

    // ignore 'my' here so tags reflect full set; only apply when a numeric tag is selected
    if (typeof selectedTagId === 'number') {
      const tagIdStr = String(selectedTagId);
      data = data.filter((r) => r.countsByTag && Number(r.countsByTag[tagIdStr]) > 0);
    }

    return data;
  }, [
    rows,
    radiusMiles,
    coords?.latitude,
    coords?.longitude,
    query,
    selectedTagId,
    useStateFilter,
    currentState,
  ]);

  // tag chips
  const tagsForFilter = useMemo(() => {
    const mapSets = new Map();
    for (const d of rowsForFacetCounts) {
      if (!d?.countsByTag) continue;
      for (const [tidStr, cnt] of Object.entries(d.countsByTag)) {
        if (!cnt) continue;
        const tid = Number(tidStr);
        if (!mapSets.has(tid)) mapSets.set(tid, new Set());
        mapSets.get(tid).add(d.destination_id);
      }
    }
    return Array.from(mapSets.entries())
      .map(([id, idSet]) => ({
        id,
        name: tagNameById[id] ?? 'Unknown',
        distinctCount: idSet.size,
      }))
      .sort((a, b) => b.distinctCount - a.distinctCount)
      .slice(0, 25);
  }, [rowsForFacetCounts, tagNameById]);

  /* ---------- MAIN LIST (FILTER + SORT) ---------- */

  const filtered = useMemo(() => {
    let data = rows;

    // radius OR state filter
    if (useStateFilter && currentState) {
      data = data.filter((r) => r.stateCode === currentState);
    } else if (coords?.latitude && coords?.longitude && Number.isFinite(Number(radiusMiles))) {
      data = data.filter((r) =>
        Number.isFinite(Number(r.distanceMi)) ? r.distanceMi <= radiusMiles : true
      );
    }

    // search
    const q = query.trim().toLowerCase();
    if (q) {
      data = data.filter((r) => (r.name || '').toLowerCase().includes(q));
    }

    // "Rated by you": only those, sort by your avg (fallback overall)
    if (selectedTagId === 'my') {
      return data
        .filter((r) => r.ratedByMe)
        .slice()
        .sort((a, b) => {
          const aScore = a.myAvgWeight ?? a.avgWeight ?? 0;
          const bScore = b.myAvgWeight ?? b.avgWeight ?? 0;
          return bScore - aScore;
        });
    }

    // concrete tag: filter, sort by overall weighted desc
    if (typeof selectedTagId === 'number') {
      const tagIdStr = String(selectedTagId);
      return data
        .filter((r) => r.countsByTag && Number(r.countsByTag[tagIdStr]) > 0)
        .slice()
        .sort((a, b) => (b.avgWeight ?? 0) - (a.avgWeight ?? 0));
    }

    // default: rated spots first (by score), then unrated by distance
    return data.slice().sort((a, b) => {
      const aHas = (a.count ?? 0) > 0;
      const bHas = (b.count ?? 0) > 0;

      if (aHas && !bHas) return -1;
      if (!aHas && bHas) return 1;

      if (aHas && bHas) {
        return (b.avgWeight ?? 0) - (a.avgWeight ?? 0);
      }

      // both unrated -> sort by distance
      const aDist = Number.isFinite(Number(a.distanceMi)) ? a.distanceMi : Infinity;
      const bDist = Number.isFinite(Number(b.distanceMi)) ? b.distanceMi : Infinity;
      return aDist - bDist;
    });
  }, [
    rows,
    query,
    selectedTagId,
    radiusMiles,
    coords?.latitude,
    coords?.longitude,
    useStateFilter,
    currentState,
  ]);

  /* ---------- DATA LOAD ---------- */

  const fetchAll = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user ?? null;

    const { data: tags, error: tagsErr } = await supabase
      .from('destination_tags')
      .select('id, tag');
    if (tagsErr) throw tagsErr;

    const tagNameEntries = (tags || []).map((t) => [Number(t.id), t.tag]);
    const tagNameMapObj = Object.fromEntries(tagNameEntries);
    setTagNameById(tagNameMapObj);

    // 1) All ratings -> aggregate per destination
    const { data, error } = await supabase
      .from('destination_ratings')
      .select(`
        destination_id,
        user_id,
        crispiness, sauce, meat, overall, weight_score, tag_id,
        destinations!destination_ratings_destination_id_fkey ( name, lat, lng, address )
      `);
    if (error) throw error;

    const destMap = new Map();
    const myRatedSet = new Set();

    for (const r of data || []) {
      const id = r.destination_id;
      if (!id) continue;
      const name = r.destinations?.name || 'Unknown';
      const dLat = r.destinations?.lat;
      const dLng = r.destinations?.lng;
      const address = r.destinations?.address || null;
      const isMine = user?.id && r.user_id === user.id;

      const bucket =
        destMap.get(id) ||
        {
          destination_id: id,
          name,
          lat: Number.isFinite(Number(dLat)) ? Number(dLat) : null,
          lng: Number.isFinite(Number(dLng)) ? Number(dLng) : null,
          address,
          stateCode: deriveStateCode(address),
          count: 0,
          sumWeight: 0,
          sumCrisp: 0,
          sumSauce: 0,
          sumMeat: 0,
          sumOverall: 0,
          tagCounts: new Map(),
          myCount: 0,
          mySumWeight: 0,
        };

      // If we didn't have an address/state yet but this row does, set it
      if (!bucket.address && address) {
        bucket.address = address;
        bucket.stateCode = deriveStateCode(address);
      }

      bucket.count += 1;
      bucket.sumWeight += Number(r.weight_score ?? 0);
      bucket.sumCrisp += Number(r.crispiness ?? 0);
      bucket.sumSauce += Number(r.sauce ?? 0);
      bucket.sumMeat += Number(r.meat ?? 0);
      bucket.sumOverall += Number(r.overall ?? 0);

      const tid = r.tag_id == null ? null : Number(r.tag_id);
      if (tid != null) {
        bucket.tagCounts.set(tid, (bucket.tagCounts.get(tid) ?? 0) + 1);
      }

      if (isMine) {
        bucket.myCount += 1;
        bucket.mySumWeight += Number(r.weight_score ?? 0);
      }

      destMap.set(id, bucket);
    }

    const haveUserCoords = coords?.latitude && coords?.longitude;

    const ratedList = [];
    const ratedIds = new Set();

    for (const b of destMap.values()) {
      const tagEntries = Array.from(b.tagCounts.entries())
        .sort((a, b2) => b2[1] - a[1])
        .slice(0, 5)
        .map(([id, cnt]) => ({
          id,
          name: tagNameMapObj[id] ?? 'Unknown',
          count: cnt,
        }));

      const topTag = tagEntries[0] ?? null;

      const countsByTag = {};
      for (const [tid, cnt] of b.tagCounts.entries()) {
        countsByTag[String(tid)] = cnt;
      }

      let distanceMi = null;
      if (
        haveUserCoords &&
        Number.isFinite(Number(b.lat)) &&
        Number.isFinite(Number(b.lng))
      ) {
        const m = haversineM(coords.latitude, coords.longitude, b.lat, b.lng);
        distanceMi = m / 1609.34;
      }

      const myAvgWeight = b.myCount ? b.mySumWeight / b.myCount : null;
      if (b.myCount) myRatedSet.add(b.destination_id);

      ratedList.push({
        destination_id: b.destination_id,
        name: b.name,
        lat: b.lat,
        lng: b.lng,
        address: b.address ?? null,
        stateCode: b.stateCode ?? null,
        distanceMi,
        count: b.count,
        avgWeight: b.count ? b.sumWeight / b.count : null,
        avgCrisp: b.count ? b.sumCrisp / b.count : null,
        avgSauce: b.count ? b.sumSauce / b.count : null,
        avgMeat: b.count ? b.sumMeat / b.count : null,
        avgOverall: b.count ? b.sumOverall / b.count : null,
        topTag,
        topTags: tagEntries,
        countsByTag,
        myAvgWeight,
        ratedByMe: b.myCount > 0,
      });

      ratedIds.add(b.destination_id);
    }

    // 2) Unrated destinations (within same dataset), appended; sorted later
    const { data: allDest, error: destErr } = await supabase
      .from('destinations')
      .select('id, name, lat, lng, address');

    const unratedList = [];
    if (!destErr && Array.isArray(allDest)) {
      for (const d of allDest) {
        if (!d?.id) continue;
        if (ratedIds.has(d.id)) continue; // already in ratedList

        const lat = Number.isFinite(Number(d.lat)) ? Number(d.lat) : null;
        const lng = Number.isFinite(Number(d.lng)) ? Number(d.lng) : null;
        const addr = d.address || null;
        const stateCode = deriveStateCode(addr);
        let distanceMi = null;

        if (haveUserCoords && lat != null && lng != null) {
          const m = haversineM(coords.latitude, coords.longitude, lat, lng);
          distanceMi = m / 1609.34;
        }

        unratedList.push({
          destination_id: d.id,
          name: d.name || 'Unknown',
          lat,
          lng,
          address: addr,
          stateCode,
          distanceMi,
          count: 0,
          avgWeight: null,
          avgCrisp: null,
          avgSauce: null,
          avgMeat: null,
          avgOverall: null,
          topTag: null,
          topTags: [],
          countsByTag: {},
          myAvgWeight: null,
          ratedByMe: false,
        });
      }
    }

    const list = [...ratedList, ...unratedList];

    // initial sort: same as default sort in filtered()
    list.sort((a, b) => {
      const aHas = (a.count ?? 0) > 0;
      const bHas = (b.count ?? 0) > 0;

      if (aHas && !bHas) return -1;
      if (!aHas && bHas) return 1;

      if (aHas && bHas) {
        return (b.avgWeight ?? 0) - (a.avgWeight ?? 0);
      }

      const aDist = Number.isFinite(Number(a.distanceMi)) ? a.distanceMi : Infinity;
      const bDist = Number.isFinite(Number(b.distanceMi)) ? b.distanceMi : Infinity;
      return aDist - bDist;
    });

    setRows(list);
    setMyRated(myRatedSet);

    // Derive current state from nearest destination (by distance) that has a stateCode
    if (haveUserCoords && list.length > 0) {
      let nearest = null;
      for (const row of list) {
        if (!row.stateCode) continue;
        if (!Number.isFinite(Number(row.distanceMi))) continue;
        if (!nearest || row.distanceMi < nearest.distanceMi) {
          nearest = row;
        }
      }
      if (nearest?.stateCode) {
        setCurrentState(nearest.stateCode);
        setUseStateFilter(true); // default to current state mode
      }
    }
  }, [coords?.latitude, coords?.longitude]);

  const fetchRoutesForDestination = useCallback(async (destinationId) => {
    if (!destinationId) return setRoutesForActive([]);
    setRoutesLoading(true);
    try {
      const { data: mapRows } = await supabase
        .from('route_ordered_destinations')
        .select('route_id')
        .eq('destination_id', destinationId);

      const idsFromMap = (mapRows || []).map((r) => r?.route_id).filter(Boolean);

      const orClause = ['stop1_id', 'stop2_id', 'stop3_id', 'stop4_id', 'stop5_id']
        .map((col) => `${col}.eq.${destinationId}`)
        .join(',');

      const { data: viaLegacy } = await supabase
        .from('routes')
        .select('id, title, city')
        .or(orClause);

      let viaMapFull = [];
      if (idsFromMap.length > 0) {
        const { data: fullRoutes } = await supabase
          .from('routes')
          .select('id, title, city')
          .in('id', idsFromMap);
        viaMapFull = fullRoutes || [];
      }

      const merged = [...viaMapFull, ...(viaLegacy || [])];
      const byId = new Map();
      for (const r of merged) if (r?.id) byId.set(r.id, r);
      const finalList = Array.from(byId.values()).sort((a, b) =>
        (a.title || '').localeCompare(b.title || '')
      );

      setRoutesForActive(finalList);
    } finally {
      setRoutesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!openDestinationId) return;
    if (loading) return;
    if (!rows?.length) return;

    // prevent re-opening on every re-render
    if (lastAutoOpenedRef.current === openDestinationId) return;

    const found = rows.find((r) => String(r.destination_id) === openDestinationId);
    if (!found) return;

    lastAutoOpenedRef.current = openDestinationId;

    setActive(found);
    setOpen(true);
    fetchRoutesForDestination(found.destination_id);
  }, [openDestinationId, loading, rows, fetchRoutesForDestination]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        await fetchAll();
      } catch (e) {
        console.warn('ratings fetch failed', e?.message || e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [fetchAll]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchAll();
    } finally {
      setRefreshing(false);
    }
  }, [fetchAll]);

  /* ---------- RENDER ---------- */

  const renderItem = ({ item }) => {
    const ratedByMe = item.ratedByMe || myRated.has(item.destination_id);
    const hasRatings = (item.count ?? 0) > 0;
    const distText =
      Number.isFinite(Number(item.distanceMi)) ? ` • ${fmt2(item.distanceMi)} mi` : '';
    const myAvg = item.myAvgWeight;
    const ratingsLabel = hasRatings
      ? `${item.count} rating${item.count === 1 ? '' : 's'}`
      : 'No ratings yet';

    const displayAvg = hasRatings ? fmt2(item.avgWeight) : '—';

    return (
      <Card
        style={[
          styles.card,
          { backgroundColor: themed.neutralCard },
          ratedByMe && {
            backgroundColor: themed.ratedCardBg,
            borderWidth: 1,
            borderColor: themed.ratedBorder,
          },
        ]}
        mode="elevated"
        onPress={() => {
          setActive(item);
          setOpen(true);
          fetchRoutesForDestination(item.destination_id);
        }}
      >
        <Card.Content style={styles.rowBetween}>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <Text
              variant="titleMedium"
              style={[styles.name, ratedByMe && { color: themed.ratedName }]}
            >
              {item.name}
            </Text>

            <Text variant="bodySmall" style={[styles.muted, { color: themed.muted }]}>
              {ratingsLabel}
              {distText}
            </Text>

            {/* Tag context */}
            {hasRatings ? (
              typeof selectedTagId === 'number' ? (
                (() => {
                  const tagIdStr = String(selectedTagId);
                  const cnt = Number(item.countsByTag?.[tagIdStr] ?? 0);
                  const tagName =
                    tagsForFilter.find((t) => t.id === selectedTagId)?.name ?? 'Tag';
                  return (
                    <Text variant="bodySmall" style={styles.tagLine}>
                      {tagName}:{' '}
                      <Text style={styles.tagHighlight}>{cnt}</Text> tagged rating
                      {cnt === 1 ? '' : 's'}
                    </Text>
                  );
                })()
              ) : item.topTag ? (
                <Text variant="bodySmall" style={styles.tagLine}>
                  Most-used tag:{' '}
                  <Text style={styles.tagHighlight}>{item.topTag.name}</Text> (
                  {item.topTag.count})
                </Text>
              ) : (
                <Text variant="bodySmall" style={styles.tagLineMuted}>
                  No tags yet
                </Text>
              )
            ) : (
              <Text variant="bodySmall" style={styles.tagLineMuted}>
                Be the first to rate this spot
              </Text>
            )}

            {/* Single chip: you rated this + your avg */}
            {ratedByMe && (
              <View style={styles.inlineChipWrap}>
                <Chip
                  compact
                  style={[styles.youRatedChip, { backgroundColor: themed.ratedChipBg }]}
                  textStyle={{
                    color: themed.ratedChipText,
                    fontWeight: '700',
                  }}
                  icon="check"
                >
                  {Number.isFinite(myAvg)
                    ? `You rated this • ${fmt2(myAvg)}`
                    : 'You rated this'}
                </Chip>
              </View>
            )}
          </View>

          <View
            style={[
              styles.scoreBadge,
              { backgroundColor: themed.scoreBadgeBg },
              ratedByMe && { backgroundColor: themed.ratedBadgeBg },
            ]}
          >
            <Text
              style={[
                styles.scoreBadgeText,
                { color: themed.scoreBadgeText },
                ratedByMe && { color: themed.ratedBadgeText },
              ]}
            >
              {displayAvg}
            </Text>
            <Text style={styles.badgeSub}>overall</Text>
          </View>
        </Card.Content>
      </Card>
    );
  };

  const sortLabel =
    selectedTagId === 'my'
      ? 'your ratings (highest first)'
      : typeof selectedTagId === 'number'
      ? 'overall score for tag'
      : 'overall score';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <View>
            <Text variant="headlineSmall" style={styles.title}>
              Public Ratings
            </Text>
            <Text variant="bodySmall" style={styles.subtitle}>
              Sorted by {sortLabel}
            </Text>
          </View>
          <Button
            mode="contained-tonal"
            icon="map"
            onPress={openRestaurantsMap}
            style={{ borderRadius: 12 }}
          >
            Map
          </Button>
        </View>

        <Searchbar
          placeholder="Search destinations…"
          value={query}
          onChangeText={setQuery}
          style={{ marginTop: 10, borderRadius: 12 }}
        />

        {/* Distance / state filter */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginTop: 10 }}
          contentContainerStyle={{ paddingRight: 16 }}
        >
          {currentState && (
            <Chip
              selected={useStateFilter}
              onPress={() => setUseStateFilter((prev) => !prev)}
              style={styles.chip}
            >
              {`Current state: ${currentState}`}
            </Chip>
          )}

          {RADIUS_OPTIONS.map((mi) => (
            <Chip
              key={mi}
              selected={!useStateFilter && radiusMiles === mi}
              onPress={() => {
                setRadiusMiles(mi);
                setUseStateFilter(false);
              }}
              style={styles.chip}
            >
              {mi} mi
            </Chip>
          ))}
        </ScrollView>

        {/* Tag + "Rated by you" filters */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginTop: 6 }}
          contentContainerStyle={{ paddingRight: 16 }}
        >
          <Chip
            selected={selectedTagId == null}
            onPress={() => setSelectedTagId(null)}
            style={styles.chip}
          >
            All tags
          </Chip>

          <Chip
            selected={selectedTagId === 'my'}
            onPress={() =>
              setSelectedTagId(selectedTagId === 'my' ? null : 'my')
            }
            style={styles.chip}
          >
            Rated by you
          </Chip>

          {tagsForFilter.map((t) => (
            <Chip
              key={t.id}
              selected={selectedTagId === t.id}
              onPress={() =>
                setSelectedTagId(selectedTagId === t.id ? null : t.id)
              }
              style={styles.chip}
            >
              {t.name} ({t.distinctCount})
            </Chip>
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(it) => String(it.destination_id)}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 24 }}>
              <Text>No ratings yet.</Text>
            </View>
          }
        />
      )}

      {/* Drill-down dialog */}
      <Portal>
        <Dialog
          visible={open}
          onDismiss={() => setOpen(false)}
          style={styles.dialog}
        >
          <Dialog.Title style={{ textAlign: 'center' }}>
            {active?.name ?? 'Details'}
          </Dialog.Title>
          <Dialog.Content>
            {!active ? (
              <View
                style={{
                  alignItems: 'center',
                  paddingVertical: 12,
                }}
              >
                <ActivityIndicator />
              </View>
            ) : (
              <>
                <ScoreHeader value={active.avgWeight} />

                <Divider
                  style={{
                    marginVertical: 12,
                  }}
                />

                <Text style={styles.sectionTitle}>Averages</Text>
                <View style={styles.metricsGrid}>
                  <MetricPretty label="Crispiness" value={active.avgCrisp} />
                  <MetricPretty label="Sauce" value={active.avgSauce} />
                  <MetricPretty label="Chicken Quality" value={active.avgMeat} />
                  <MetricPretty label="Experience" value={active.avgOverall} />
                </View>

                <Divider
                  style={{
                    marginVertical: 12,
                  }}
                />

                <Text style={styles.sectionTitle}>Top tags</Text>
                <TagChips items={active.topTags} />

                <Divider
                  style={{
                    marginVertical: 12,
                  }}
                />

                <Text style={styles.sectionTitle}>In Crawls</Text>
                {routesLoading ? (
                  <View
                    style={{
                      alignItems: 'center',
                      paddingVertical: 8,
                    }}
                  >
                    <ActivityIndicator />
                  </View>
                ) : routesForActive.length === 0 ? (
                  <Text style={{ opacity: 0.7 }}>
                    This restaurant isn’t in any crawls yet.
                  </Text>
                ) : (
                  <View style={styles.tagChipWrap}>
                    {routesForActive.map((r) => (
                      <Chip
                        key={r.id}
                        style={[
                          styles.tagChip,
                          {
                            backgroundColor: colors.surfaceVariant,
                          },
                        ]}
                        compact
                        onPress={() => {
                          // close dialog before navigating
                          setOpen(false);
                          setActive(null);
                          router.push({
                            pathname: `/routes/${r.id}`,
                            params: {
                              returnTo: '/ratings',
                            },
                          });
                        }}
                      >
                        {r.title}
                        {r.city ? ` · ${r.city}` : ''}
                      </Chip>
                    ))}
                  </View>
                )}
              </>
            )}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setOpen(false)}>Close</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {/* Restaurants Map dialog */}
      <Portal>
        <Dialog
          visible={openMap}
          onDismiss={() => setOpenMap(false)}
          style={styles.dialog}
        >
          <Dialog.Title style={{ textAlign: 'center' }}>
            Restaurants Map
          </Dialog.Title>
          <Dialog.Content>
            <View
              style={{
                height: 420,
                borderRadius: 12,
                overflow: 'hidden',
              }}
            >
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
                {filtered
                  .filter(
                    (r) =>
                      Number.isFinite(Number(r.lat)) &&
                      Number.isFinite(Number(r.lng))
                  )
                  .map((r) => {
                    const color = statusColorFor(r.destination_id);
                    return (
                      <Marker
                        key={r.destination_id}
                        coordinate={{
                          latitude: Number(r.lat),
                          longitude: Number(r.lng),
                        }}
                        onPress={() => {
                          setActive(r);
                          setOpen(true);
                          setOpenMap(false);
                          fetchRoutesForDestination(r.destination_id);
                        }}
                      >
                        <View
                          style={[
                            styles.legendDot,
                            {
                              backgroundColor: color,
                              borderColor: '#fff',
                            },
                          ]}
                        />
                      </Marker>
                    );
                  })}
              </MapView>
            </View>

            <View style={{ marginTop: 10 }}>
              <View style={styles.legendRow}>
                <View
                  style={[
                    styles.legendSwatch,
                    {
                      backgroundColor: '#D32F2F',
                    },
                  ]}
                />
                <Text>Not rated by you</Text>
              </View>
              <View style={styles.legendRow}>
                <View
                  style={[
                    styles.legendSwatch,
                    {
                      backgroundColor: '#2E7D32',
                    },
                  ]}
                />
                <Text>Rated by you</Text>
              </View>
            </View>
          </Dialog.Content>
          <Dialog.Actions
            style={{
              justifyContent: 'space-between',
            }}
          >
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
            <Button onPress={() => setOpenMap(false)}>Close</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </SafeAreaView>
  );
}

/* ---------------- styles ---------------- */
const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { fontWeight: '800' },
  subtitle: { opacity: 0.7, marginTop: 2 },

  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  card: { borderRadius: 16 },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  name: { fontWeight: '700' },
  muted: { opacity: 0.7, marginTop: 2 },

  tagLine: { marginTop: 4 },
  tagLineMuted: { marginTop: 4, opacity: 0.6 },
  tagHighlight: { fontWeight: '800' },

  scoreBadge: {
    minWidth: 74,
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  scoreBadgeText: { fontWeight: '900', fontSize: 18 },
  badgeSub: { fontSize: 11, opacity: 0.7 },

  dialog: {
    alignSelf: 'center',
    width: '92%',
    maxWidth: 520,
    borderRadius: 16,
  },

  chip: { marginRight: 8, borderRadius: 999 },

  scoreHeader: {
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 12,
  },
  scoreHeaderLabel: {
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  scoreHeaderValue: {
    fontWeight: '900',
    fontSize: 28,
    marginTop: 2,
  },
  scoreHeaderSub: { fontSize: 12, marginTop: 2 },

  sectionTitle: { fontWeight: '800', marginBottom: 8 },

  metricsGrid: { gap: 10 },
  metricPretty: {
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  metricHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  metricPrettyLabel: { fontWeight: '700' },
  metricPrettyVal: { fontWeight: '900' },
  metricBar: { height: 8, borderRadius: 8 },

  tagChipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tagChip: { borderRadius: 999 },

  inlineChipWrap: { marginTop: 6 },
  youRatedChip: { borderRadius: 999 },

  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  legendSwatch: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  legendDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
  },
});
