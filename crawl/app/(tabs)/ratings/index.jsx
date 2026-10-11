// app/ratings/index.jsx
// BuffaGo — Public Ratings (Wingdex) + Buffacoins (token-based rating in current state)

import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  View,
  RefreshControl,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  Alert,
  Share,
  Animated,
  Modal,
  useWindowDimensions,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Slider from '@react-native-community/slider';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  Card,
  Text,
  Portal,
  Dialog,
  Button,
  Divider,
  Searchbar,
  ProgressBar,
  useTheme,
} from 'react-native-paper';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import RatingWizardDialog from '../../../components/RatingWizardDialog';
import WingmanAddDialog from '../../../components/WingmanAddDialog';
import FeedbackState from '../../../components/ui/FeedbackState';
import { WingShotImage, LoadingSkeleton, SelectionChip as Chip } from '../../../components/ui/OperationUI';
import { operationTokens as tokens } from '../../../src/theme/operationTokens';
import { supabase } from '../../../lib/supabase.js';
import { trackEvent } from '../../../lib/analytics';
import { submitBuffacoinRatingTransaction } from '../../../lib/buffacoinRatingTransaction';
import { useLocationCtx } from '../../../providers/LocationProvider';
import MapView, { Marker, PROVIDER_GOOGLE } from '../../../lib/platformMap';
import { mapCoordinate } from '../../../lib/mapSafety';
import WingdexPhotoGallery from '../../../components/WingdexPhotoGallery';
import { loadWingdexGallery } from '../../../lib/wingdexGallery';
import { useLegendaryFeed } from '../../../hooks/useLegendaryFeed';
import { useSavedDestinations } from '../../../hooks/useSavedDestinations';
import { ENABLE_SAVED_DESTINATIONS } from '../../../config/features';
import { saveSavedDestinationIntent } from '../../../lib/savedDestinations.js';
import { accountBoundRpc, accountUserId, createAccountScope, lookupAccount } from '../../../lib/accountBoundary.js';
import { normalizeDestination, openDestinationDirections } from '../../../lib/destinationNavigation.js';
import { persistHomeDestination } from '../../../lib/homeDestination.js';
import {
  LegendaryDetailBanner,
  LegendaryMapMarker,
} from '../../../components/buffaverse/LegendarySurfaces';

const WINGDEX_HINT_DISMISSED_KEY = 'buffago:wingdex_hint_dismissed';

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

const US_STATES = [
  { code: 'AL', name: 'Alabama' },
  { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' },
  { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' },
  { code: 'DE', name: 'Delaware' },
  { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' },
  { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' },
  { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' },
  { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' },
];

/* ---------- compact UI bits for the drill-down ---------- */
function ScoreHeader({ value, label = 'BuffaGo Score', subLabel = 'Weighted out of 100' }) {
  const { colors, dark } = useTheme();
  const themed = useMemo(() => {
    // surfaceVariant can be too light depending on theme config, so pin dark mode to elevation/surface.
    const headerBg = dark ? (colors.elevation?.level2 ?? colors.surface) : '#FFF4E9';
    const headerText = colors.onSurface;
    const accent = dark ? colors.primary : '#B84C00';
    const sub = dark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)';
    return { headerBg, headerText, accent, sub };
  }, [colors, dark]);

  return (
    <View style={[styles.scoreHeader, { backgroundColor: themed.headerBg }]}>
      <Text style={[styles.scoreHeaderLabel, { color: themed.headerText }]}>{label}</Text>
      <Text style={[styles.scoreHeaderValue, { color: themed.accent }]}>{fmt2(value)}</Text>
      <Text style={[styles.scoreHeaderSub, { color: themed.sub }]}>{subLabel}</Text>
    </View>
  );
}

function MetricPretty({ label, value, max = 10 }) {
  const { colors, dark } = useTheme();
  const themed = useMemo(
    () => ({
      bg: dark ? '#1F2328' : '#F7F7F8',
      label: colors.onSurface,
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

/* Color helper: green → yellow/orange → red */
function lerpColor(a, b, t) {
  const ah = parseInt(a.replace('#', ''), 16);
  const ar = (ah >> 16) & 0xff;
  const ag = (ah >> 8) & 0xff;
  const ab = ah & 0xff;

  const bh = parseInt(b.replace('#', ''), 16);
  const br = (bh >> 16) & 0xff;
  const bg = (bh >> 8) & 0xff;
  const bb = bh & 0xff;

  const rr = Math.round(ar + (br - ar) * t);
  const rg = Math.round(ag + (bg - ag) * t);
  const rb = Math.round(ab + (bb - ab) * t);

  return `rgb(${rr}, ${rg}, ${rb})`;
}

function pepperColorForValue(value) {
  const t = Math.max(0, Math.min(1, (value - 1) / 9));
  const green = '#2e7d32';
  const mid = '#FFB300';
  const red = '#c62828';
  if (t <= 0.5) return lerpColor(green, mid, t / 0.5);
  return lerpColor(mid, red, (t - 0.5) / 0.5);
}

/* Pepper-style slider row */
function SliderRowPretty({ label, value, onChange, description, badLabel, goodLabel }) {
  const theme = useTheme();
  const progress = Math.max(0, Math.min(1, (value - 1) / 9));
  const pepperColor = pepperColorForValue(value);

  return (
    <View style={{ marginBottom: 24 }}>
      <Text style={[styles.stepTitle, { color: theme.colors.onSurface }]}>{label}</Text>

      {(badLabel || goodLabel) ? (
        <View style={styles.pepperLabelsRow}>
          <Text style={[styles.pepperEdgeLabel, { color: theme.colors.onSurface }]}>
            {badLabel ?? ''}
          </Text>
          <Text style={[styles.pepperEdgeLabel, { color: theme.colors.onSurface }]}>
            {goodLabel ?? ''}
          </Text>
        </View>
      ) : null}

      <View style={styles.pepperOuter}>
        <View style={styles.pepperVisualWrapper} pointerEvents="none">
          <View style={styles.pepperBodyBase}>
            <View
              style={[
                styles.pepperFill,
                { width: `${progress * 100}%`, backgroundColor: pepperColor },
              ]}
            />
          </View>

          <View pointerEvents="none" style={[styles.pepperArrowContainer, { left: `${progress * 100}%` }]}>
            <View style={styles.pepperArrow} />
          </View>
        </View>

        <Slider
          value={value}
          minimumValue={1}
          maximumValue={10}
          step={1}
          onValueChange={(v) => onChange(Math.round(v))}
          minimumTrackTintColor="transparent"
          maximumTrackTintColor="transparent"
          thumbTintColor="rgba(255,255,255,0.001)"
          style={styles.pepperSliderGesture}
        />
      </View>

      {description ? (
        <Text style={[styles.sliderDescription, { color: theme.colors.onSurface }]}>{description}</Text>
      ) : null}
    </View>
  );
}

//Town
const deriveTown = (address) => {
  if (!address || typeof address !== 'string') return null;
  const parts = address.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return parts[parts.length - 2]; // usually the city/town
  return null;
};

const formatRatingDate = (value) => {
  if (!value) return 'Recently';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently';

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

/* ---------- Buffacoin rating wizard UI ---------- */
const clamp01 = (n) => Math.max(0, Math.min(1, n));

function StepTitle({ children }) {
  return <Text style={styles.stepTitle}>{children}</Text>;
}

function StepDesc({ children }) {
  return <Text style={styles.stepDescription}>{children}</Text>;
}

/* ---------------- main ---------------- */
export default function PublicRatingsScreen() {
  const { width: viewportWidth, height: viewportHeight, fontScale } = useWindowDimensions();
  const compactMapAction = viewportWidth < 360 || fontScale > 1.2;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // Reserve space for the title, two scalable legend rows, and dialog actions.
  // A fixed 420dp map pushed the actions outside the dialog on short/scaled screens.
  const mapDialogMaxHeight = viewportHeight - insets.top - insets.bottom - 24;
  const mapCanvasHeight = Math.min(420, Math.max(240, mapDialogMaxHeight - 365 * Math.max(1, fontScale)));
  const { byRestaurant: legendaryByRestaurant } = useLegendaryFeed({ limit: 50 });

  const { map: requestedMap, savedAction, savedDestinationId, savedActionState, savedActionUserId } = useLocalSearchParams();
  const savedFeatureEnabled = ENABLE_SAVED_DESTINATIONS;
  const saved = useSavedDestinations({ client: supabase, enabled: savedFeatureEnabled });
  const loadSavedList = saved.loadList;
  const [savedView, setSavedView] = useState('discover');
  const pendingIntentRef = useRef('');
  const accountScope = useRef(createAccountScope()).current;
  const accountRef = useRef(undefined);
  const fetchRequestRef = useRef(0);
  const recentRequestRef = useRef(0);
  const fetchAllRef = useRef(null);
  const destinationActionRef = useRef(false);
  const [headerHeight, setHeaderHeight] = useState(0);

  const { coords, status, askPermission } = useLocationCtx();
  const { colors, dark } = useTheme();

  // ✅ celebration + delayed coin apply
  const [coinCelebrateOpen, setCoinCelebrateOpen] = useState(false);
  const [pendingCoinBalance, setPendingCoinBalance] = useState(null);
  const [pendingSummary, setPendingSummary] = useState(null); // { weightScore, sauce, crispiness, meat, overall }
  
  // ✅ red -1 animation
  const coinDeltaOpacity = useRef(new Animated.Value(0)).current;
  const coinDeltaY = useRef(new Animated.Value(0)).current;
  const [coinDeltaText, setCoinDeltaText] = useState(null); // e.g. "-1"

  const coinImg = useMemo(() => {
    try {
      return require('../../../assets/Buffago-token.png');
    } catch (e) {
      return null;
    }
  }, []);

  const playCoinDelta = useCallback((text = '-1') => {
    setCoinDeltaText(text);
    coinDeltaOpacity.setValue(0);
    coinDeltaY.setValue(0);
  
    Animated.parallel([
      Animated.timing(coinDeltaOpacity, {
        toValue: 1,
        duration: 120,
        useNativeDriver: true,
      }),
      Animated.timing(coinDeltaY, {
        toValue: -14,
        duration: 520,
        useNativeDriver: true,
      }),
    ]).start(() => {
      Animated.timing(coinDeltaOpacity, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }).start(() => setCoinDeltaText(null));
    });
  }, [coinDeltaOpacity, coinDeltaY]);

  /* ---------- DATA LOAD ---------- */
  const fetchBuffacoinBalance = useCallback(async (u) => {
    const epoch = accountScope.capture();
    const isCurrent = () => accountScope.current(epoch) && accountUserId(u) === accountRef.current;
    if (!isCurrent()) return;
    if (!u?.id) {
      setBuffacoinBalance(0);
      return;
    }

    const { data, error } = await supabase
      .from('buffacoin_wallets')
      .select('balance')
      .eq('user_id', u.id)
      .maybeSingle();

    if (!isCurrent()) return;
    if (error) {
      console.warn('buffacoin_wallets fetch failed', error.message || error);
      setBuffacoinBalance(0);
      return;
    }

    setBuffacoinBalance(Number(data?.balance ?? 0));
  }, [accountScope]);

  const refreshCoins = useCallback(async () => {
  const epoch = accountScope.capture();
  const u = await lookupAccount(supabase);
  if (!accountScope.current(epoch) || accountUserId(u) !== accountRef.current) return;
  await fetchBuffacoinBalance(u);
  }, [accountScope, fetchBuffacoinBalance]);

  useFocusEffect(
  useCallback(() => {
    // refresh coin count any time Wingdex gains focus
      refreshCoins();
      trackEvent({
        eventName: 'wingdex_opened',
        screen: 'ratings',
        userId: user?.id ?? null,
        metadata: {
          source_screen: 'tab_bar',
          location_mode: locationMode,
          state: currentState ?? stateCodeFilter ?? null,
        },
      });
    }, [refreshCoins])
  );

  // theme palette for this screen
  const themed = useMemo(() => {
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
      muted: colors.onSurface,
    };
  }, [colors, dark]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [rows, setRows] = useState([]);
  const [pictureCounts, setPictureCounts] = useState({});
  const [pictureCountsStatus, setPictureCountsStatus] = useState('loading');
  const [approvedThumbnails, setApprovedThumbnails] = useState({});
  const [photoRevision, setPhotoRevision] = useState(0);
  const [discoverySort, setDiscoverySort] = useState('overall');
  const [galleryRestaurant, setGalleryRestaurant] = useState(null);
  const pictureRequestRef = useRef(0);
  useEffect(() => {
    const request = ++pictureRequestRef.current;
    setPictureCounts({});
    setPictureCountsStatus('loading');
    void loadWingdexGallery(rows.map((row) => row.destination_id), supabase).then((result) => {
      if (request === pictureRequestRef.current) {
        setPictureCounts(Object.fromEntries(Object.entries(result).map(([id, value]) => [id, value.count])));
        setApprovedThumbnails(Object.fromEntries(Object.entries(result).map(([id, value]) => [id, value.images[0]?.signed_url])));
        setPictureCountsStatus('ready');
      }
    }).catch(() => {
      if (request === pictureRequestRef.current) setPictureCountsStatus('error');
      console.warn('[Wingdex] picture counts unavailable');
    });
    return () => { pictureRequestRef.current += 1; };
  }, [rows, photoRevision]);
  useFocusEffect(useCallback(() => {
    setPhotoRevision((n) => n + 1);
    const timer = setInterval(() => setPhotoRevision((n) => n + 1), 240000);
    return () => clearInterval(timer);
  }, []));

  const [tagNameById, setTagNameById] = useState({});
  const ratingTagOptions = useMemo(
    () =>
      Object.entries(tagNameById).map(([id, tag]) => ({
        id: Number(id),
        tag,
      })),
    [tagNameById]
  );
  // selectedTagId:
  // - null       => no specific tag filter
  // - 'my'       => only places you've rated, sorted by your rating desc
  // - number(id) => filter by that tag, sort by overall score desc
  const [selectedTagId, setSelectedTagId] = useState(null);

  // Derived from GPS + nearest destination; used to show current state chip
  const [currentState, setCurrentState] = useState(null);

  const [myRated, setMyRated] = useState(new Set());
  // ✅ destinations you've already rated with a Buffacoin (ever)
  const [myCoinRated, setMyCoinRated] = useState(new Set());


  const RADIUS_OPTIONS = [5, 10, 25, 50, 100, 250];
  const [radiusMiles, setRadiusMiles] = useState(5); // default 5mi

  // location filtering modes:
  // - 'radius' => apply radiusMiles
  // - 'state'  => apply stateCodeFilter
  // - 'all'    => no location filter
  const [locationMode, setLocationMode] = useState('radius');
  const [stateCodeFilter, setStateCodeFilter] = useState(null);

  const [statePickerOpen, setStatePickerOpen] = useState(false);
  const [wingmanOpen, setWingmanOpen] = useState(false);
  const [wingmanStateCtx, setWingmanStateCtx] = useState(null);

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(null);

  const [query, setQuery] = useState('');
  const lastTrackedQueryRef = useRef('');
  const lastSearchStartedRef = useRef('');
  const lastEmptyStateCtaShownRef = useRef('');

  const [routesForActive, setRoutesForActive] = useState([]);
  const [routesLoading, setRoutesLoading] = useState(false);
  const [recentRatings, setRecentRatings] = useState([]);
  const [recentRatingsLoading, setRecentRatingsLoading] = useState(false);

  const [openMap, setOpenMap] = useState(false);
  const allMapRef = useRef(null);

  // map legend filter
  const [mapLegendFilter, setMapLegendFilter] = useState(null);

  // Buffacoin state
  const [user, setUser] = useState(null);
  const [buffacoinBalance, setBuffacoinBalance] = useState(0);
  const buffacoinOperationRef = useRef(null);

  // ✅ per-destination escalating cost (1 + # of my prior coin ratings for that destination)
  const [coinCostByDest, setCoinCostByDest] = useState({});
  const [coinCostForActive, setCoinCostForActive] = useState(1);

  // Buffacoin dialogs + rating wizard
  const [coinInfoOpen, setCoinInfoOpen] = useState(false);
  const [coinOutOpen, setCoinOutOpen] = useState(false);
  const [coinRateOpen, setCoinRateOpen] = useState(false);
  const [coinRatingDest, setCoinRatingDest] = useState(null);
  const [coinSubmitting, setCoinSubmitting] = useState(false);
  const [wingdexHintVisible, setWingdexHintVisible] = useState(false);

  useEffect(() => {
    let alive = true;
    let revision = 0;
    accountScope.activate();
    const accept = (u) => {
      if (!alive) return;
      const changed = accountScope.update(u);
      accountRef.current = accountUserId(u);
      setUser(accountRef.current ? u : null);
      if (!changed) return;
      fetchRequestRef.current += 1;
      recentRequestRef.current += 1;
      setRows([]); setMyRated(new Set()); setMyCoinRated(new Set());
      setRecentRatings([]); setRecentRatingsLoading(false); setActive(null); setOpen(false);
      setBuffacoinBalance(0); setCoinCostByDest({}); setCoinCostForActive(1);
      setCoinRatingDest(null); setCoinRateOpen(false); setCoinCelebrateOpen(false);
      setPendingSummary(null); setPendingCoinBalance(null); setCoinSubmitting(false);
      buffacoinOperationRef.current = null;
      pendingIntentRef.current = '';
      Promise.resolve().then(() => { if (alive) void fetchAllRef.current?.().catch(() => {}); });
    };
    lookupAccount(supabase).then((u) => { if (!revision) accept(u); }).catch(() => {});
    const { data } = supabase.auth.onAuthStateChange((_event, session) => { revision += 1; accept(session?.user || null); });
    return () => { alive = false; accountScope.dispose(); data?.subscription?.unsubscribe?.(); };
  }, [accountScope]);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const dismissed = await AsyncStorage.getItem(WINGDEX_HINT_DISMISSED_KEY);
        if (alive && dismissed !== 'true') setWingdexHintVisible(true);
      } catch {
        if (alive) setWingdexHintVisible(true);
      }
    })();

    return () => {
      alive = false;
    };
  }, [user?.id]);

  const dismissWingdexHint = useCallback(async () => {
    setWingdexHintVisible(false);
    try {
      await AsyncStorage.setItem(WINGDEX_HINT_DISMISSED_KEY, 'true');
    } catch {
      // Non-critical. The hint can show again if persistence fails.
    }
  }, []);

  const openSavedAuthPrompt = useCallback(async (item, kind) => {
    const epoch = accountScope.capture();
    const isCurrent = () => accountScope.current(epoch);
    Alert.alert(
      'Save this restaurant',
      'Found wings worth trying? Sign in to save this restaurant.',
      [
        { text: 'Not Now', style: 'cancel' },
        { text: 'Sign In / Create Account', onPress: async () => {
          if (!isCurrent()) return;
          const stored = await saveSavedDestinationIntent({ destinationId: item?.destination_id, kind, saved: true }, AsyncStorage, isCurrent).catch(() => false);
          if (stored && isCurrent()) router.push('/auth/login');
        } },
      ],
    );
  }, [accountScope, router]);

  const handleSavedAction = useCallback(async (item, kind, nextSaved) => {
    const epoch = accountScope.capture();
    const isCurrent = () => accountScope.current(epoch);
    if (!item?.destination_id) return;
    if (!user?.id) {
      await openSavedAuthPrompt(item, kind);
      return;
    }
    try {
      await saved.mutate({ kind, destinationId: item.destination_id, saved: nextSaved, expectedUserId: accountRef.current });
      if (!isCurrent()) return;
      if (savedView !== 'discover') await saved.loadList(savedView);
    } catch (error) {
      if (!isCurrent()) return;
      const message = error?.code === 'FAVORITE_REQUIRES_RATING'
        ? 'Rate this restaurant before adding it to Favorites.'
        : error?.code === 'WANT_TO_TRY_REQUIRES_UNRATED'
          ? 'Want to Try is only available before your first rating.'
          : error?.message || 'We could not update your saved restaurants. Try again.';
      Alert.alert('Could not update saved restaurants', message);
    }
  }, [accountScope, openSavedAuthPrompt, saved, savedView, user?.id]);

  const getWingmanStateContext = useCallback(async () => {
    const stateCode = currentState || stateCodeFilter || null;
    if (!stateCode) return null;

    const { data, error } = await supabase
      .from('states')
      .select('state_id, state_code')
      .eq('state_code', stateCode)
      .maybeSingle();

    if (error) {
      console.warn('Wingdex state lookup failed', error.message || error);
      return { stateId: null, stateCode };
    }

    return {
      stateId: data?.state_id ? Number(data.state_id) : null,
      stateCode: data?.state_code ? String(data.state_code) : stateCode,
    };
  }, [currentState, stateCodeFilter]);

  const openWingman = useCallback(async (source = 'wingdex') => {
    trackEvent({
      eventName: 'add_restaurant_opened',
      screen: 'ratings',
      userId: user?.id ?? null,
      metadata: {
        source,
        visible_result_count: filteredRef.current?.length ?? 0,
        location_mode: locationMode,
      },
    });
    const ctx = await getWingmanStateContext();
    setWingmanStateCtx(ctx);
    setWingmanOpen(true);
  }, [getWingmanStateContext, locationMode, user?.id]);


  const statusColorFor = useCallback(
    (destinationId) => {
      if (myRated.has(destinationId)) return '#2E7D32';
      return '#D32F2F';
    },
    [myRated]
  );

  const filteredRef = useRef([]);
  const openRestaurantsMap = useCallback(() => {
    setMapLegendFilter(null);
    trackEvent({
      eventName: 'map_opened',
      screen: 'ratings',
      userId: user?.id ?? null,
      metadata: {
        source: 'wingdex',
        result_count: filteredRef.current?.length ?? 0,
        location_mode: locationMode,
      },
    });
    setOpenMap(true);

    // The shared map fits current valid markers only after onMapReady.
  }, [locationMode, user?.id]);

  useEffect(() => {
    if (requestedMap !== '1') return;
    openRestaurantsMap();
    router.setParams({ map: undefined });
  }, [requestedMap, openRestaurantsMap, router]);

  const applyLocationFilter = useCallback(
    (dataIn) => {
      let data = dataIn;

      // state mode
      if (locationMode === 'state' && stateCodeFilter) {
        return data.filter((r) => r.stateCode === stateCodeFilter);
      }

      // radius mode
      if (
        locationMode === 'radius' &&
        coords?.latitude &&
        coords?.longitude &&
        Number.isFinite(Number(radiusMiles))
      ) {
        return data.filter((r) =>
          Number.isFinite(Number(r.distanceMi)) ? r.distanceMi <= radiusMiles : true
        );
      }

      // all mode => no filter
      return data;
    },
    [locationMode, stateCodeFilter, radiusMiles, coords?.latitude, coords?.longitude]
  );

  /* ---------- FACET PIPELINE ---------- */
  const rowsForFacetCounts = useMemo(() => {
    let data = applyLocationFilter(rows);

    // search
    const q = query.trim().toLowerCase();
    if (q) data = data.filter((r) => (r.name || '').toLowerCase().includes(q));

    // apply numeric tag only (avoid “my” affecting facet counts)
    if (typeof selectedTagId === 'number') {
      const tagIdStr = String(selectedTagId);
      data = data.filter((r) => r.countsByTag && Number(r.countsByTag[tagIdStr]) > 0);
    }

    return data;
  }, [rows, applyLocationFilter, query, selectedTagId]);

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
    let data = applyLocationFilter(rows);

    // search
    const q = query.trim().toLowerCase();
    if (q) data = data.filter((r) => (r.name || '').toLowerCase().includes(q));

    // "Rated by you"
    if (selectedTagId === 'my') {
      return data
        .filter((r) => r.ratedByMe)
        .slice()
        .sort((a, b) => (b.myAvgWeight ?? b.avgWeight ?? 0) - (a.myAvgWeight ?? a.avgWeight ?? 0));
    }

    // concrete tag
    if (typeof selectedTagId === 'number') {
      const tagIdStr = String(selectedTagId);
      return data
        .filter((r) => r.countsByTag && Number(r.countsByTag[tagIdStr]) > 0)
        .slice()
        .sort((a, b) => (b.avgWeight ?? 0) - (a.avgWeight ?? 0));
    }

    // default: rated spots first by score; then unrated by distance
    return data.slice().sort((a, b) => {
      const aHas = (a.count ?? 0) > 0;
      const bHas = (b.count ?? 0) > 0;

      if (aHas && !bHas) return -1;
      if (!aHas && bHas) return 1;

      if (aHas && bHas) return (b.avgWeight ?? 0) - (a.avgWeight ?? 0);

      const aDist = Number.isFinite(Number(a.distanceMi)) ? a.distanceMi : Infinity;
      const bDist = Number.isFinite(Number(b.distanceMi)) ? b.distanceMi : Infinity;
      return aDist - bDist;
    });
  }, [rows, applyLocationFilter, query, selectedTagId]);

  const discoveryRows = useMemo(() => {
    if (discoverySort === 'overall') return filtered;
    return filtered.slice().sort((a, b) => {
      if (discoverySort === 'nearest') {
        const distance = (row) => row.distanceMi != null && Number.isFinite(Number(row.distanceMi)) ? Number(row.distanceMi) : Infinity;
        return distance(a) - distance(b);
      }
      if (discoverySort === 'photos') return (pictureCounts[String(b.destination_id)] || 0) - (pictureCounts[String(a.destination_id)] || 0);
      return (b.count || 0) - (a.count || 0);
    });
  }, [filtered, discoverySort, pictureCounts]);

  const savedRows = useMemo(() => (saved.listRows || []).map((row) => ({
    ...row,
    stateCode: row.stateCode || deriveStateCode(row.address),
    town: row.town || deriveTown(row.address),
    distanceMi: null,
  })), [saved.listRows]);

  const savedVisibleRows = useMemo(() => {
    const text = query.trim().toLowerCase();
    return savedRows.filter((row) => {
      if (!text) return true;
      return [row.name, row.address, row.town, row.stateCode]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(text));
    });
  }, [query, savedRows]);

  const displayedRows = savedView === 'discover' ? discoveryRows : savedVisibleRows;

  useEffect(() => {
    filteredRef.current = filtered;
  }, [filtered]);

  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) return;

    const t = setTimeout(() => {
      if (lastSearchStartedRef.current !== text) {
        lastSearchStartedRef.current = text;
        trackEvent({
          eventName: 'restaurant_search_started',
          screen: 'ratings',
          userId: user?.id ?? null,
          metadata: {
            source: 'wingdex',
            query_length: text.length,
            location_mode: locationMode,
          },
        });
      }

      const key = `${text}:${filtered.length}:${locationMode}:${selectedTagId ?? 'none'}`;
      if (lastTrackedQueryRef.current === key) return;
      lastTrackedQueryRef.current = key;

      trackEvent({
        eventName: filtered.length ? 'restaurant_search_results_viewed' : 'restaurant_search_empty',
        screen: 'ratings',
        userId: user?.id ?? null,
        metadata: {
          source: 'wingdex',
          query_length: text.length,
          result_count: filtered.length,
          location_mode: locationMode,
          selected_tag_id: selectedTagId ?? null,
        },
      });
    }, 700);

    return () => clearTimeout(t);
  }, [query, filtered.length, locationMode, selectedTagId, user?.id]);

  useEffect(() => {
    if (loading || filtered.length) {
      lastEmptyStateCtaShownRef.current = '';
      return;
    }

    const emptyStateKey = [
      query.trim(),
      locationMode,
      stateCodeFilter ?? 'none',
      selectedTagId ?? 'none',
      radiusMiles,
    ].join(':');
    if (lastEmptyStateCtaShownRef.current === emptyStateKey) return;
    lastEmptyStateCtaShownRef.current = emptyStateKey;

    trackEvent({
      eventName: 'empty_state_cta_shown',
      screen: 'ratings',
      userId: user?.id ?? null,
      metadata: {
        state: 'wingdex_no_results',
        cta_name: 'add_restaurant_empty_wingdex',
        query_length: query.trim().length,
        location_mode: locationMode,
        state_code: stateCodeFilter ?? null,
        radius_miles: locationMode === 'radius' ? radiusMiles : null,
        selected_tag_id: selectedTagId ?? null,
      },
    });
  }, [
    filtered.length,
    loading,
    locationMode,
    query,
    radiusMiles,
    selectedTagId,
    stateCodeFilter,
    user?.id,
  ]);

  const fetchAll = useCallback(async () => {
    const epoch = accountScope.capture();
    const request = ++fetchRequestRef.current;
    const isCurrent = () => accountScope.current(epoch) && request === fetchRequestRef.current;
    const u = await lookupAccount(supabase);
    if (!isCurrent() || accountUserId(u) !== accountRef.current) return;
    await fetchBuffacoinBalance(u);
    if (!isCurrent()) return;

    const { data: tags, error: tagsErr } = await supabase.from('destination_tags').select('id, tag');
    if (!isCurrent()) return;
    if (tagsErr) throw tagsErr;

    const tagNameMapObj = Object.fromEntries((tags || []).map((t) => [Number(t.id), t.tag]));
    setTagNameById(tagNameMapObj);

    // ratings
    const { data, error } = await supabase.from('destination_ratings').select(`
      destination_id,
      user_id,
      crispiness, sauce, meat, overall, weight_score, tag_id, is_buffacoin,
      destinations!destination_ratings_destination_id_fkey ( name, lat, lng, address )
    `);
    if (error) throw error;

    if (!isCurrent()) return;
    const coinCountsByDest = new Map();
    const myCoinRatedSet = new Set();
    
    for (const r of data || []) {
      const id = r.destination_id;
      if (!id) continue;
    
      const isMine = u?.id && r.user_id === u.id;
    
      // ✅ count ONLY *my* prior buffacoin ratings for this destination
      if (isMine && r.is_buffacoin === true) {
        const key = String(id);
        coinCountsByDest.set(key, (coinCountsByDest.get(key) ?? 0) + 1);
        myCoinRatedSet.add(id); // keep as raw uuid (same type as myRated uses)
      }
    }

    // ✅ used to hide Rate button if you've already coin-rated this destination
    setMyCoinRated(myCoinRatedSet);

    const destMap = new Map();
    const myRatedSet = new Set();

    for (const r of data || []) {
      const id = r.destination_id;
      if (!id) continue;

      const name = r.destinations?.name || 'Unknown';
      const dLat = r.destinations?.lat;
      const dLng = r.destinations?.lng;
      const address = r.destinations?.address || null;
      const isMine = u?.id && r.user_id === u.id;

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
      if (tid != null) bucket.tagCounts.set(tid, (bucket.tagCounts.get(tid) ?? 0) + 1);

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
      for (const [tid, cnt] of b.tagCounts.entries()) countsByTag[String(tid)] = cnt;

      let distanceMi = null;
      if (haveUserCoords && Number.isFinite(Number(b.lat)) && Number.isFinite(Number(b.lng))) {
        distanceMi = haversineM(coords.latitude, coords.longitude, b.lat, b.lng) / 1609.34;
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
        town: deriveTown(b.address ?? null),
      });

      ratedIds.add(b.destination_id);
    }

    // unrated destinations
    const { data: allDest, error: destErr } = await supabase
      .from('destinations')
      .select('id, name, lat, lng, address');

    if (!isCurrent()) return;
    const unratedList = [];
    if (!destErr && Array.isArray(allDest)) {
      for (const d of allDest) {
        if (!d?.id) continue;
        if (ratedIds.has(d.id)) continue;

        const lat = Number.isFinite(Number(d.lat)) ? Number(d.lat) : null;
        const lng = Number.isFinite(Number(d.lng)) ? Number(d.lng) : null;
        const addr = d.address || null;
        const stateCode = deriveStateCode(addr);

        let distanceMi = null;
        if (haveUserCoords && lat != null && lng != null) {
          distanceMi = haversineM(coords.latitude, coords.longitude, lat, lng) / 1609.34;
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
          town: deriveTown(addr),
        });
      }
    }

    // ✅ build "next cost" map: 1 + my coin rating count for that destination
    const nextCostObj = {};
    for (const [destId, cnt] of coinCountsByDest.entries()) {
      nextCostObj[String(destId)] = 1 + Number(cnt || 0);
    }
    setCoinCostByDest(nextCostObj);


    const list = [...ratedList, ...unratedList];
    setRows(list);
    setMyRated(myRatedSet);

    // derive current state from nearest destination with a stateCode
    if (haveUserCoords && list.length > 0) {
      let nearest = null;
      for (const row of list) {
        if (!row.stateCode) continue;
        if (!Number.isFinite(Number(row.distanceMi))) continue;
        if (!nearest || row.distanceMi < nearest.distanceMi) nearest = row;
      }
      if (nearest?.stateCode) setCurrentState(nearest.stateCode);
    }
  }, [accountScope, coords?.latitude, coords?.longitude, fetchBuffacoinBalance]);

  fetchAllRef.current = fetchAll;

  const fetchRoutesForDestination = useCallback(async (destinationId) => {
    if (!destinationId) {
      setRoutesForActive([]);
      return;
    }

    setRoutesLoading(true);
    try {
      const { data: mapRows, error: mapErr } = await supabase
        .from('route_ordered_destinations')
        .select('route_id')
        .eq('destination_id', destinationId);

      if (mapErr) {
        console.warn('route_ordered_destinations fetch failed', mapErr.message || mapErr);
        setRoutesForActive([]);
        return;
      }

      const idsFromMap = (mapRows || []).map((r) => r?.route_id).filter(Boolean);

      const orClause = ['stop1_id', 'stop2_id', 'stop3_id', 'stop4_id', 'stop5_id']
        .map((col) => `${col}.eq.${destinationId}`)
        .join(',');

      const { data: viaLegacy, error: legacyErr } = await supabase
        .from('routes')
        .select('id, title, city')
        .or(orClause);

      if (legacyErr) console.warn('routes legacy OR fetch failed', legacyErr.message || legacyErr);

      let viaMapFull = [];
      if (idsFromMap.length) {
        const { data: fullRoutes, error: fullErr } = await supabase
          .from('routes')
          .select('id, title, city')
          .in('id', idsFromMap);

        if (fullErr) console.warn('routes via map ids fetch failed', fullErr.message || fullErr);
        else viaMapFull = fullRoutes || [];
      }

      const merged = [...viaMapFull, ...(viaLegacy || [])];
      const byId = new Map();
      for (const r of merged) if (r?.id) byId.set(r.id, r);

      setRoutesForActive(
        Array.from(byId.values()).sort((a, b) => (a.title || '').localeCompare(b.title || ''))
      );
    } finally {
      setRoutesLoading(false);
    }
  }, []);

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
      if (savedFeatureEnabled && savedView !== 'discover') await loadSavedList(savedView);
    } finally {
      setRefreshing(false);
    }
  }, [fetchAll, loadSavedList, savedFeatureEnabled, savedView]);

  // ✅ coin-rate for any nearby restaurant 
  useFocusEffect(
    useCallback(() => {
      if (!savedFeatureEnabled || savedView === 'discover') return undefined;
      void loadSavedList(savedView).catch(() => {});
      return undefined;
    }, [loadSavedList, savedFeatureEnabled, savedView])
  );

  useEffect(() => {
    if (!savedFeatureEnabled || !user?.id || !savedAction || !savedDestinationId) return;
    const kind = Array.isArray(savedAction) ? savedAction[0] : savedAction;
    const destinationId = Array.isArray(savedDestinationId) ? savedDestinationId[0] : savedDestinationId;
    const actionState = Array.isArray(savedActionState) ? savedActionState[0] : savedActionState;
    const claimedUserId = Array.isArray(savedActionUserId) ? savedActionUserId[0] : savedActionUserId;
    if (!['favorites', 'wantToTry'].includes(kind) || claimedUserId !== user.id || accountRef.current !== user.id) return;
    const epoch = accountScope.capture();
    const isCurrent = () => accountScope.current(epoch);
    const key = `${user.id}:${kind}:${destinationId}:${actionState || 'save'}`;
    if (pendingIntentRef.current === key) return;
    pendingIntentRef.current = key;
    void saved.mutate({ kind, destinationId, saved: actionState !== 'remove', expectedUserId: claimedUserId })
      .then(() => {
        if (!isCurrent()) return;
        setSavedView(kind === 'favorites' ? 'favorites' : 'wantToTry');
        Alert.alert('Saved', 'Your saved restaurant is ready in Wingdex.');
      })
      .catch((error) => { if (isCurrent()) Alert.alert('Could not save restaurant', error?.message || 'Try again from Wingdex.'); })
      .finally(() => {
        if (!isCurrent()) return;
        router.setParams({ savedAction: undefined, savedDestinationId: undefined, savedActionState: undefined, savedActionUserId: undefined });
      });
  }, [accountScope, router, saved, savedAction, savedActionUserId, savedActionState, savedDestinationId, savedFeatureEnabled, user?.id]);

  const canRateWithCoins = useCallback(
    (item) => {
      if (!item?.destination_id) return false;
      // ✅ if already coin-rated this destination, no Rate option
      if (myCoinRated.has(item.destination_id)) return false;
      return true;
    },
    [myCoinRated]
  );


  const onPressCoinRate = useCallback(
    async (item) => {
      try {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } catch {}

      // compute next cost for this destination for this user
      const destId = item?.destination_id ? String(item.destination_id) : null;
      const cost = Math.max(1, Number(destId ? coinCostByDest[destId] : 1) || 1);

      if (item?.destination_id && myCoinRated.has(item.destination_id)) {
        // Shouldn't happen because button is hidden, but keep it safe.
        return;
      }
      

      setCoinCostForActive(cost);

      // 1) Not signed in
      if (!user?.id) {
        setCoinRatingDest(item);
        setCoinInfoOpen(true);
        return;
      }

      // 2) Signed in but not enough coins for THIS destination
      if ((buffacoinBalance ?? 0) < cost) {
        setCoinRatingDest(item);
        setCoinOutOpen(true);
        return;
      }

      // 3) Has enough coins
      setCoinRatingDest(item);
      await trackEvent({
        eventName: 'primary_cta_clicked',
        screen: 'ratings',
        userId: user.id,
        destinationId: item.destination_id,
        metadata: { cta_name: 'rate_with_buffacoin', source_screen: 'ratings', coin_cost: cost },
      });
      await trackEvent({
        eventName: 'rating_started',
        screen: 'ratings',
        userId: user.id,
        destinationId: item.destination_id,
        metadata: { source: 'wingdex_buffacoin', coin_cost: cost },
      });
      setCoinRateOpen(true);
    },
    [user?.id, buffacoinBalance, coinCostByDest, myCoinRated]
  );

  const shareRating = useCallback(async (item) => {
    const score = Number(item?.myAvgWeight);
    if (!item?.name || !Number.isFinite(score)) return;

    const place = [item.town, item.stateCode].filter(Boolean).join(', ');
    const message = [
      `I rated ${item.name} ${fmt2(score)}/100 on BuffaGo.`,
      place ? `Location: ${place}.` : null,
    ]
      .filter(Boolean)
      .join('\n');

    try {
      await Share.share({
        title: `My BuffaGo rating for ${item.name}`,
        message,
      });
      await trackEvent({
        eventName: 'share_completed',
        screen: 'ratings',
        userId: user?.id ?? null,
        destinationId: item.destination_id ?? null,
        metadata: { content_type: 'rating', source: 'wingdex' },
      });
    } catch (e) {
      await trackEvent({
        eventName: 'share_failed',
        screen: 'ratings',
        userId: user?.id ?? null,
        destinationId: item.destination_id ?? null,
        metadata: { content_type: 'rating', error: e?.message || String(e) },
      });
      console.warn('share rating failed', e?.message || e);
    }
  }, [user?.id]);

  const fetchRecentRatingsForDestination = useCallback(async (destinationId) => {
    const epoch = accountScope.capture();
    const request = ++recentRequestRef.current;
    const isCurrent = () => accountScope.current(epoch) && request === recentRequestRef.current;
    if (!destinationId) {
      setRecentRatings([]);
      return;
    }

    setRecentRatingsLoading(true);
    try {
      const { data: ratings, error } = await supabase
        .from('destination_ratings')
        .select('user_id, weight_score, crispiness, sauce, meat, overall, created_at, is_buffacoin')
        .eq('destination_id', destinationId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (!isCurrent()) return;
      if (error) {
        console.warn('recent ratings fetch failed', error.message || error);
        setRecentRatings([]);
        return;
      }

      const userIds = Array.from(
        new Set((ratings || []).map((r) => r?.user_id).filter(Boolean))
      );
      const namesByUser = new Map();

      if (userIds.length) {
        const { data: users, error: usersErr } = await supabase
          .from('users')
          .select('user_id, username')
          .in('user_id', userIds);

        if (usersErr) {
          console.warn('recent rating users fetch failed', usersErr.message || usersErr);
        } else {
          for (const u of users || []) {
            if (u?.user_id) namesByUser.set(u.user_id, u?.username || null);
          }
        }
      }

      if (!isCurrent()) return;
      setRecentRatings(
        (ratings || []).map((r) => ({
          ...r,
          displayName:
            r?.user_id && user?.id && r.user_id === user.id
              ? 'You'
              : namesByUser.get(r?.user_id)?.trim?.() || 'BuffaGo user',
        }))
      );
    } finally {
      if (isCurrent()) setRecentRatingsLoading(false);
    }
  }, [accountScope, user?.id]);

  const openDestinationDetail = useCallback(
    (item) => {
      setActive(item);
      setOpen(true);
      trackEvent({
        eventName: 'restaurant_profile_viewed',
        screen: 'ratings',
        userId: user?.id ?? null,
        destinationId: item?.destination_id ?? null,
        metadata: {
          source: 'wingdex_list',
          rating_count: item?.count ?? null,
          avg_weight_score: item?.avgWeight ?? null,
          distance_miles: item?.distanceMi ?? null,
        },
      });
      trackEvent({
        eventName: 'restaurant_selected',
        screen: 'ratings',
        userId: user?.id ?? null,
        destinationId: item?.destination_id ?? null,
        metadata: {
          source_screen: 'ratings',
          source: 'wingdex_list',
          rating_count: item?.count ?? null,
          distance_from_user: item?.distanceMi != null ? Number(item.distanceMi) * 1609.34 : null,
          distance_miles: item?.distanceMi ?? null,
        },
      });
      fetchRoutesForDestination(item.destination_id);
      fetchRecentRatingsForDestination(item.destination_id);
    },
    [fetchRecentRatingsForDestination, fetchRoutesForDestination, user?.id]
  );

  const expandRadius = useCallback(() => {
    const currentIndex = RADIUS_OPTIONS.findIndex((mi) => mi === radiusMiles);
    const nextRadius = RADIUS_OPTIONS[Math.min(RADIUS_OPTIONS.length - 1, Math.max(0, currentIndex) + 1)];

    setRadiusMiles(nextRadius ?? 25);
    setLocationMode('radius');
    setStateCodeFilter(null);
  }, [RADIUS_OPTIONS, radiusMiles]);

  const handleWingmanPickDestination = useCallback(
    async (row) => {
      setWingmanOpen(false);
      await fetchAll();

      if (!row?.id) return;

      let stateCode = wingmanStateCtx?.stateCode || currentState || stateCodeFilter || null;
      if (!stateCode && row?.state_id) {
        const { data, error } = await supabase
          .from('states')
          .select('state_code')
          .eq('state_id', row.state_id)
          .maybeSingle();

        if (error) {
          console.warn('Wingdex destination state lookup failed', error.message || error);
        }

        stateCode = data?.state_code ? String(data.state_code) : null;
      }

      const item = {
        destination_id: row.id,
        name: row.name || 'New restaurant',
        lat: Number.isFinite(Number(row.lat)) ? Number(row.lat) : null,
        lng: Number.isFinite(Number(row.lng)) ? Number(row.lng) : null,
        address: row.address ?? null,
        stateCode,
        distanceMi: null,
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
        town: deriveTown(row.address ?? null) || row.city || null,
      };

      await onPressCoinRate(item);
    },
    [currentState, fetchAll, onPressCoinRate, stateCodeFilter, wingmanStateCtx?.stateCode]
  );

  const computeWeightScoreFromScores = useCallback((inputScores) => {
    const sauce = Number(inputScores?.sauce ?? 0);
    const crispiness = Number(inputScores?.crispiness ?? 0);
    const meat = Number(inputScores?.meat ?? 0);
    const overall = Number(inputScores?.overall ?? 0);

    const raw = (sauce * 2) + (crispiness * 2) + (meat * 2) + (overall * 4);
    const safe = Number.isFinite(raw) ? raw : 0;

    return Math.max(0, Math.min(100, Math.round(safe)));
  }, []);

  const setHomeDestination = useCallback(async (item, { returnHome = true } = {}) => {
    if (destinationActionRef.current) return false;
    destinationActionRef.current = true;
    try {
      const payload = normalizeDestination({
        id: item?.destination_id,
        name: item?.name,
        address: item?.address,
        city: item?.town ?? item?.city,
        lat: item?.lat,
        lng: item?.lng,
        source: 'wingdex_want_to_try',
      });
      await persistHomeDestination(payload);
      await trackEvent({
        eventName: 'primary_cta_clicked',
        screen: 'ratings',
        userId: user?.id ?? null,
        destinationId: item.destination_id,
        metadata: {
          cta_name: 'want_this_spot_next',
          source_screen: 'ratings',
          source: 'wingdex_detail',
          distance_miles: item?.distanceMi ?? null,
        },
      });
      setOpen(false);
      if (returnHome) router.push('/(tabs)/home');
      return true;
    } catch (e) {
      console.warn('pickAsHomeNextSpot failed', e?.message || e);
      Alert.alert('Could not set destination', e?.message || 'Try again in a moment.');
      return false;
    } finally {
      destinationActionRef.current = false;
    }
  }, [router, user?.id]);

  const pickAsHomeNextSpot = useCallback((item) => setHomeDestination(item), [setHomeDestination]);

  const takeMeThere = useCallback(async (item) => {
    const selected = await setHomeDestination(item, { returnHome: false });
    if (!selected) return;
    try {
      await openDestinationDirections({ destination: item });
    } catch (error) {
      Alert.alert('Directions unavailable', error?.message || 'We could not open directions on this device.');
    }
  }, [setHomeDestination]);


  const submitCoinRating = useCallback(async (payload) => {
  if (!user?.id || !coinRatingDest?.destination_id) return;
  const epoch = accountScope.capture();
  const isCurrent = () => accountScope.current(epoch) && accountRef.current === user.id;
  if (!isCurrent()) return;

  if (payload?.wouldOrderAgain === null) {
    Alert.alert('Quick one', 'Would you go back again? 👍 / 👎');
    return;
  }

  const stateCode = coinRatingDest?.stateCode || currentState || stateCodeFilter || null;
  if (!stateCode) {
    Alert.alert('Missing state', 'We couldn’t determine your current state for this rating.');
    return;
  }

  setCoinSubmitting(true);
  try {
    const spendTimes = Math.max(1, Number(coinCostForActive || 1));
    const operationId = buffacoinOperationRef.current || Crypto.randomUUID();
    buffacoinOperationRef.current = operationId;
    const startedAt = Date.now();
    await trackEvent({
      eventName: 'rating_submission_started',
      screen: 'ratings',
      userId: user.id,
      destinationId: coinRatingDest.destination_id,
      metadata: {
        event_id: Crypto.randomUUID(),
        operation_id: operationId,
        actor_type: 'authenticated',
        crawl_creation_intended: true,
        retry_count_bucket: 'unknown',
      },
    });

    const finalScores = payload?.scores ?? {};
    const weightScore = computeWeightScoreFromScores(finalScores);

    const safeWingsEaten = payload?.wingsEaten == null ? null : Math.max(0, Number(payload.wingsEaten));
    const safeSauceStyle = payload?.sauceStyle == null ? null : Number(payload.sauceStyle);
    const safeFlavorVibe = Array.isArray(payload?.flavorVibe)
      ? payload.flavorVibe.map((v) => Number(v)).filter((v) => Number.isFinite(v)).slice(0, 2)
      : [];
    const safeSpiceLevel = payload?.spiceLevel == null ? null : Number(payload.spiceLevel);

    const ratingPayload = {
      sauce: Number(finalScores.sauce),
      crispiness: Number(finalScores.crispiness),
      meat: Number(finalScores.meat),
      overall: Number(finalScores.overall),
      would_order_again: payload?.wouldOrderAgain == null ? null : Boolean(payload.wouldOrderAgain),
      tag_id: payload.selectedTagId ?? null,
      wings_eaten: Number.isFinite(safeWingsEaten) ? safeWingsEaten : null,
      sauce_style: Number.isFinite(safeSauceStyle) ? safeSauceStyle : null,
      flavor_vibe: safeFlavorVibe.length ? safeFlavorVibe : null,
      spice_level: Number.isFinite(safeSpiceLevel) ? safeSpiceLevel : null,
    };
    if (!isCurrent()) return;
    const transactionClient = await accountBoundRpc(supabase, user.id, isCurrent);
    if (!isCurrent()) return;
    const committed = await submitBuffacoinRatingTransaction({
      supabase: transactionClient,
      operationId,
      destinationId: coinRatingDest.destination_id,
      stateCode,
      coinCost: spendTimes,
      rating: ratingPayload,
    });
    if (!isCurrent()) return;
    const crawlId = committed.crawl_id;
    setBuffacoinBalance(committed.new_balance);
    playCoinDelta(`-${spendTimes}`);
    buffacoinOperationRef.current = null;
    await trackEvent({
      eventName: 'rating_transaction_succeeded',
      screen: 'ratings',
      userId: user.id,
      destinationId: coinRatingDest.destination_id,
      crawlId,
      metadata: {
        event_id: Crypto.randomUUID(),
        operation_id: operationId,
        actor_type: 'authenticated',
        result_code: 'committed',
        rating_id_present: true,
        crawl_id_present: true,
        debit_committed: true,
        latency_bucket: Date.now() - startedAt < 1000 ? 'lt_1s' : 'gte_1s',
      },
    });

    // ✅ keep "rated by me" sets correct immediately
    await trackEvent({
      eventName: 'rating_completed',
      screen: 'ratings',
      userId: user.id,
      destinationId: coinRatingDest.destination_id,
      crawlId,
      metadata: {
        source: 'wingdex_buffacoin',
        state_code: stateCode,
        coin_cost: spendTimes,
        weight_score: weightScore,
        tag_id: payload.selectedTagId ?? null,
        would_order_again: payload?.wouldOrderAgain == null ? null : Boolean(payload.wouldOrderAgain),
      },
    });
    await trackEvent({
      eventName: 'rating_submitted',
      screen: 'ratings',
      userId: user.id,
      destinationId: coinRatingDest.destination_id,
      crawlId,
      metadata: {
        source: 'wingdex_buffacoin',
        state: stateCode,
        coin_cost: spendTimes,
        weight_score: weightScore,
        tag_id: payload.selectedTagId ?? null,
        would_order_again: payload?.wouldOrderAgain == null ? null : Boolean(payload.wouldOrderAgain),
      },
    });

    if (!isCurrent()) return;
    setMyCoinRated((prev) => {
      const next = new Set(prev);
      next.add(coinRatingDest.destination_id);
      return next;
    });
    
    setMyRated((prev) => {
      const next = new Set(prev);
      next.add(coinRatingDest.destination_id);
      return next;
    });
    
    // ✅ optimistic rating update (list + drilldown) so it feels instant
    const destId = coinRatingDest.destination_id;
    // The database trigger is authoritative for Want to Try cleanup; refresh the
    // client cache only after the rating transaction has committed.
    await saved.invalidateAfterRating(destId);
    await fetchRecentRatingsForDestination(destId);
    if (!isCurrent()) return;
    
    setRows((prev) =>
      (prev || []).map((r) => {
        if (r.destination_id !== destId) return r;
    
        const prevCount = Number(r.count ?? 0);
        const nextCount = prevCount + 1;
    
        const prevAvg = Number.isFinite(Number(r.avgWeight)) ? Number(r.avgWeight) : null;
        const nextAvg =
          prevAvg == null ? weightScore : (prevAvg * prevCount + weightScore) / nextCount;
    
        const bumpAvg10 = (prevVal10, newVal10) => {
          const pv = Number.isFinite(Number(prevVal10)) ? Number(prevVal10) : null;
          return pv == null ? newVal10 : (pv * prevCount + newVal10) / nextCount;
        };
    
        return {
          ...r,
          count: nextCount,
          avgWeight: nextAvg,
          avgSauce: bumpAvg10(r.avgSauce, Number(finalScores.sauce)),
          avgCrisp: bumpAvg10(r.avgCrisp, Number(finalScores.crispiness)),
          avgMeat: bumpAvg10(r.avgMeat, Number(finalScores.meat)),
          avgOverall: bumpAvg10(r.avgOverall, Number(finalScores.overall)),
          ratedByMe: true,
          myAvgWeight: weightScore,
        };
      })
    );
    
    setActive((prev) => {
      if (!prev || prev.destination_id !== destId) return prev;
    
      const prevCount = Number(prev.count ?? 0);
      const nextCount = prevCount + 1;
    
      const prevAvg = Number.isFinite(Number(prev.avgWeight)) ? Number(prev.avgWeight) : null;
      const nextAvg =
        prevAvg == null ? weightScore : (prevAvg * prevCount + weightScore) / nextCount;
    
      const bumpAvg10 = (prevVal10, newVal10) => {
        const pv = Number.isFinite(Number(prevVal10)) ? Number(prevVal10) : null;
        return pv == null ? newVal10 : (pv * prevCount + newVal10) / nextCount;
      };
    
      return {
        ...prev,
        count: nextCount,
        avgWeight: nextAvg,
        avgSauce: bumpAvg10(prev.avgSauce, Number(finalScores.sauce)),
        avgCrisp: bumpAvg10(prev.avgCrisp, Number(finalScores.crispiness)),
        avgMeat: bumpAvg10(prev.avgMeat, Number(finalScores.meat)),
        avgOverall: bumpAvg10(prev.avgOverall, Number(finalScores.overall)),
        ratedByMe: true,
        myAvgWeight: weightScore,
      };
    });
    

    // ✅ hide Rate button immediately for this destination
    setMyCoinRated((prev) => {
      const next = new Set(prev);
      next.add(coinRatingDest.destination_id);
      return next;
    });


    // 5) Determine new balance (don’t apply yet; show celebration first)
    const safeNewBal = committed.new_balance;

    // 6) Close wizard immediately
    setCoinRateOpen(false);

    // 7) Open celebration modal with summary + pending balance
    setPendingCoinBalance(safeNewBal);
    setPendingSummary({
      weightScore,
      sauce: Number(finalScores.sauce),
      crispiness: Number(finalScores.crispiness),
      meat: Number(finalScores.meat),
      overall: Number(finalScores.overall),
    });
    setCoinCelebrateOpen(true);
  } catch (error) {
    if (!isCurrent()) return;
    await trackEvent({
      eventName: 'rating_transaction_failed',
      screen: 'ratings',
      userId: user.id,
      destinationId: coinRatingDest.destination_id,
      metadata: {
        event_id: Crypto.randomUUID(),
        operation_id: buffacoinOperationRef.current || 'not_created',
        actor_type: 'authenticated',
        result_code: error?.message || 'transaction_failed',
        rating_id_present: false,
        crawl_id_present: false,
        debit_committed: false,
      },
    });
    if (!isCurrent()) return;
    Alert.alert(
      'Rating not confirmed',
      'Nothing will be retried through the old path. Try again to safely check this same operation.'
    );
  } finally {
    if (isCurrent()) setCoinSubmitting(false);
  }
}, [
  accountScope,
  user?.id,
  coinRatingDest?.destination_id,
  currentState,
  stateCodeFilter,
  coinRatingDest?.stateCode,
  coinCostForActive,
  computeWeightScoreFromScores,
  fetchRecentRatingsForDestination,
  playCoinDelta,
  saved,
]);


  /* ---------- RENDER ---------- */
  const renderItem = ({ item }) => {
    const ratedByMe = item.ratedByMe || myRated.has(item.destination_id) || saved.ratedIds.has(item.destination_id);
    const isFavorite = saved.favoriteIds.has(item.destination_id);
    const isWantToTry = saved.wantToTryIds.has(item.destination_id);
    const favoritePending = saved.isPending('favorites', item.destination_id);
    const wantToTryPending = saved.isPending('wantToTry', item.destination_id);
    const hasRatings = (item.count ?? 0) > 0;
    const distText =
      locationMode === 'radius' && Number.isFinite(Number(item.distanceMi))
        ? ` • ${fmt2(item.distanceMi)} mi`
        : '';    const ratingsLabel = hasRatings
      ? `${item.count} rating${item.count === 1 ? '' : 's'}`
      : 'No ratings yet';

    const displayAvg = hasRatings ? fmt2(item.avgWeight) : '—';
    const showCoinRate = canRateWithCoins(item);
    const ratedWithCoin = myCoinRated.has(item.destination_id);

    const destIdStr = String(item.destination_id);
    const coinCost = Math.max(1, Number(coinCostByDest?.[destIdStr] ?? 1));

    return (
      <Card
        style={[
          styles.card,
          { backgroundColor: themed.neutralCard },
          ratedByMe && {
            backgroundColor: themed.neutralCard,
            borderWidth: 1,
            borderColor: themed.ratedBorder,
          },
        ]}
        mode="outlined"
        onPress={() => openDestinationDetail(item)}
      >
      <Card.Content style={styles.cardContent}>
        {approvedThumbnails[destIdStr] ? <WingShotImage approved uri={approvedThumbnails[destIdStr]} style={{ width: '100%', height: undefined, aspectRatio: 16 / 9, borderRadius: 12, marginBottom: 10 }} /> : null}
        <View style={styles.compactRestaurantRow}>
          <View style={styles.restaurantIdentity}>
            <Text variant="titleSmall" style={styles.nameCentered}>{item.name}</Text>
            <Text variant="bodySmall" numberOfLines={2} style={[styles.locationLine, { opacity: 1, color: dark ? colors.onSurface : colors.onSurfaceVariant }]}>
              {[item.town, item.stateCode].filter(Boolean).join(', ') || 'Location pending'}{distText}
            </Text>
            <View style={styles.restaurantMetrics}>
              <Text style={[styles.compactScore, { color: dark ? tokens.colors.orange : '#9B3B00', backgroundColor: colors.surface, borderRadius: 6, paddingHorizontal: 4 }]}>{displayAvg} <Text style={[styles.compactMetric, { color: dark ? colors.onSurface : colors.onSurfaceVariant }]}>overall</Text></Text>
              <Text style={[styles.compactMetric, { color: dark ? colors.onSurface : colors.onSurfaceVariant }]}>{ratingsLabel}</Text>
            </View>
          </View>
        </View>
        <View style={styles.restaurantActions}>
          {pictureCountsStatus === 'loading' ? (
            <Button icon="image-multiple-outline" compact disabled contentStyle={{ minHeight: 44 }} labelStyle={styles.compactMetric}>Checking photos…</Button>
          ) : pictureCountsStatus === 'error' ? (
            <Button icon="image-multiple-outline" compact contentStyle={{ minHeight: 44 }} labelStyle={styles.compactMetric} onPress={(event) => {
              event?.stopPropagation?.(); setGalleryRestaurant(item);
            }}>Photos unavailable</Button>
          ) : (pictureCounts[destIdStr] || 0) > 0 ? (
            <Button icon="image-multiple-outline" compact labelStyle={[styles.compactMetric, { color: dark ? colors.onSurface : colors.onSurfaceVariant }]} contentStyle={{ minHeight: 44 }} onPress={(event) => {
              event?.stopPropagation?.(); setGalleryRestaurant(item);
            }}>{pictureCounts[destIdStr]} photos</Button>
          ) : (
            <Button
              icon="camera-plus-outline"
              compact
              contentStyle={{ minHeight: 44 }}
              labelStyle={[styles.compactMetric, { color: dark ? colors.onSurface : colors.onSurfaceVariant, fontSize: 11 }]}
              accessibilityLabel={`Share the first Wing Shot for ${item.name}`}
              accessibilityHint={ratedByMe ? 'Opens Journey to attach a photo to your existing rating' : 'Selects this restaurant on Home so you can rate it and share a Wing Shot'}
              onPress={(event) => {
                event?.stopPropagation?.();
                if (ratedByMe) router.push('/(tabs)/journey');
                else void pickAsHomeNextSpot(item);
              }}
            >
              Be the first to share a Wing Shot
            </Button>
          )}
          {showCoinRate ? (
            <Button mode="contained" icon={({ size }) => <TokenIcon size={size + 4} />}
              onPress={(event) => { event?.stopPropagation?.(); onPressCoinRate(item); }}
              style={styles.rateBtnInline} contentStyle={styles.rateBtnInlineContent} labelStyle={styles.rateBtnInlineLabel}>
              {'Rate · ' + coinCost}
            </Button>
          ) : ratedByMe ? (
            <View style={[styles.ratedInlineChip, { backgroundColor: themed.ratedChipBg }]}>
              <Text style={[styles.ratedInlineChipText, { color: themed.ratedChipText }]}>{ratedWithCoin ? 'Rated with coin' : 'Rated'}</Text>
            </View>
          ) : (
            <Button mode="outlined" compact onPress={(event) => { event?.stopPropagation?.(); openDestinationDetail(item); }}>View</Button>
          )}
        </View>
        {savedFeatureEnabled ? (
          <View style={styles.savedActionRow}>
            <Button
              mode={isFavorite ? 'contained-tonal' : 'outlined'}
              compact
              icon={isFavorite ? 'heart' : 'heart-outline'}
              disabled={favoritePending || (!ratedByMe && !isFavorite)}
              loading={favoritePending}
              accessibilityLabel={ratedByMe ? `${isFavorite ? 'Remove from' : 'Add to'} Favorites: ${item.name}` : `Rate ${item.name} to add it to Favorites`}
              onPress={(event) => {
                event?.stopPropagation?.();
                void handleSavedAction(item, 'favorites', !isFavorite);
              }}
              style={styles.savedActionButton}
              contentStyle={styles.savedActionContent}
              labelStyle={styles.savedActionLabel}
            >
              {ratedByMe ? (isFavorite ? 'Favorited' : 'Favorite') : 'Rate to favorite'}
            </Button>
            <Button
              mode={isWantToTry ? 'contained-tonal' : 'outlined'}
              compact
              icon={isWantToTry ? 'bookmark' : 'bookmark-outline'}
              disabled={wantToTryPending || ratedByMe}
              loading={wantToTryPending}
              accessibilityLabel={ratedByMe ? `${item.name} is already rated` : `${isWantToTry ? 'Remove from' : 'Save to'} Want to Try: ${item.name}`}
              onPress={(event) => {
                event?.stopPropagation?.();
                void handleSavedAction(item, 'wantToTry', !isWantToTry);
              }}
              style={styles.savedActionButton}
              contentStyle={styles.savedActionContent}
              labelStyle={styles.savedActionLabel}
            >
              {ratedByMe ? 'Already rated' : (isWantToTry ? 'Saved' : 'Want to Try')}
            </Button>
          </View>
        ) : null}
        {savedFeatureEnabled && savedView === 'wantToTry' ? (
          <View style={styles.destinationActionRow}>
            <Button
              mode="contained-tonal"
              compact
              icon="map-marker-check-outline"
              accessibilityLabel={`Set ${item.name} as your Home destination`}
              onPress={(event) => {
                event?.stopPropagation?.();
                void pickAsHomeNextSpot(item);
              }}
              style={styles.destinationActionButton}
              contentStyle={styles.savedActionContent}
              labelStyle={styles.savedActionLabel}
            >
              Set Destination
            </Button>
            <Button
              mode="outlined"
              compact
              icon="navigation-variant-outline"
              accessibilityLabel={`Take me to ${item.name}`}
              onPress={(event) => {
                event?.stopPropagation?.();
                void takeMeThere(item);
              }}
              style={styles.destinationActionButton}
              contentStyle={styles.savedActionContent}
              labelStyle={styles.savedActionLabel}
            >
              Take Me There
            </Button>
          </View>
        ) : null}
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
  
  const locationLabel = useMemo(() => {
    if (locationMode === 'all') return 'All locations';
    if (locationMode === 'state' && stateCodeFilter) return `State: ${stateCodeFilter}`;
    if (locationMode === 'radius') return `${radiusMiles} mi`;
    return 'Location';
  }, [locationMode, stateCodeFilter, radiusMiles]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (query.trim()) count += 1;
    if (selectedTagId != null) count += 1;
    if (locationMode !== 'all') count += 1;
    return count;
  }, [locationMode, query, selectedTagId]);

  const wingdexContextLabel = useMemo(() => {
    if (locationMode === 'all') return 'Showing all places';
    if (locationMode === 'state' && stateCodeFilter) return `Showing ${stateCodeFilter}`;
    if (locationMode === 'radius') return `Showing places within ${radiusMiles} mi`;
    return 'Showing Wingdex places';
  }, [locationMode, radiusMiles, stateCodeFilter]);

  const dashboardMetrics = useMemo(() => {
    const visibleCount = filtered.length;
    const ratedVisible = filtered.filter((r) => (r.count ?? 0) > 0).length;
    const completedVisible = filtered.filter((r) => r.ratedByMe || myRated.has(r.destination_id)).length;
    const scored = filtered
      .map((r) => Number(r.avgWeight))
      .filter((n) => Number.isFinite(n));
    const avgScore = scored.length
      ? scored.reduce((sum, n) => sum + n, 0) / scored.length
      : null;

    return {
      visibleCount,
      ratedVisible,
      completedVisible,
      avgScore,
    };
  }, [filtered, myRated]);

  const showCoinHeader = Boolean(user?.id);
  const TokenIcon = useCallback(
  ({ size = 16 }) =>
    coinImg ? (
      <Image
        source={coinImg}
        style={{ width: size, height: size }}
        resizeMode="contain"
      />
    ) : (
      <Text style={{ fontSize: size }}>🪙</Text>
    ),
  [coinImg]
);


  return (
    <SafeAreaView edges={["top", "left", "right"]} style={{ flex: 1, backgroundColor: colors.background }}>
        <Animated.View
          collapsable={false}
          onLayout={(e) => {
            const h = e?.nativeEvent?.layout?.height ?? 0;            if (h && h !== headerHeight) setHeaderHeight(h);
          }}
          style={[
            styles.header,
            {
              // The header is absolutely positioned, so SafeAreaView's padding
              // does not offset it. Apply the native inset directly here.
              top: insets.top,
              paddingTop: 8,
              zIndex: 10,
              backgroundColor: colors.background,
            },
          ]}
        >
        <View style={styles.headerTopRow}>
          <View style={{ flex: 1, minWidth: 140 }}>
            <Text variant="titleLarge" style={styles.title}>
              Wingdex
            </Text>
          </View>
          <View style={{ position: 'relative' }}>
            <Pressable
              onPress={() => setCoinInfoOpen(true)}
              style={[styles.coinPill, { backgroundColor: colors.surfaceVariant }]}
            >
              {coinImg ? (
                <Image source={coinImg} style={styles.coinImg} resizeMode="contain" />
              ) : (
                <Text style={{ fontSize: 16 }}>🪙</Text>
              )}
              <Text style={styles.coinCount}>{showCoinHeader ? buffacoinBalance : '—'}</Text>
            </Pressable>
          
            {coinDeltaText ? (
              <Animated.View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  right: 6,
                  top: -6,
                  opacity: coinDeltaOpacity,
                  transform: [{ translateY: coinDeltaY }],
                }}
              >
                <Text style={{ color: '#D32F2F', fontWeight: '900' }}>{coinDeltaText}</Text>
              </Animated.View>
            ) : null}
          </View>
          {compactMapAction ? <Pressable accessibilityRole="button" accessibilityLabel="Open Wingdex map" onPress={openRestaurantsMap} style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.surfaceVariant, alignItems: 'center', justifyContent: 'center' }}><MaterialCommunityIcons name="map" size={22} color={colors.onSurface} /></Pressable> : <Button
            compact
            mode="contained-tonal"
            icon="map"
            onPress={openRestaurantsMap}
            style={{ borderRadius: 12 }}
            labelStyle={{ fontSize: 12 }}
          >
            Map
          </Button>}
        </View>
        <Text variant="bodySmall" style={styles.subtitle}>{wingdexContextLabel} · sorted by {discoverySort === 'overall' ? sortLabel : discoverySort === 'nearest' ? 'nearest' : discoverySort === 'ratings' ? 'most ratings' : 'most photos'}</Text>

        {savedFeatureEnabled ? (
          <View style={styles.savedDestinationRail} accessibilityRole="tablist">
            {[
              ['discover', 'Discover', 'compass-outline'],
              ['favorites', 'Favorites', 'heart-outline'],
              ['wantToTry', 'Want to Try', 'bookmark-outline'],
            ].map(([value, label, icon]) => (
              <Chip
                key={value}
                selected={savedView === value}
                icon={icon}
                accessibilityRole="tab"
                accessibilityState={{ selected: savedView === value }}
                accessibilityLabel={`Show ${label}`}
                onPress={() => setSavedView(value)}
                style={styles.savedDestinationChip}
              >
                {label}
              </Chip>
            ))}
          </View>
        ) : null}

        <Searchbar
          placeholder="Search destinations…"
          value={query}
          onChangeText={setQuery}
          style={{ marginTop: 8, borderRadius: 12, minHeight: Math.max(48, 48 * fontScale) }}
          inputStyle={{ minHeight: 0 }}
        />

        {wingdexHintVisible ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text variant="bodySmall" style={{ flex: 1, color: colors.onSurfaceVariant }}>Add missing spots and rate past visits with coins.</Text>
          <Button compact onPress={dismissWingdexHint}>Got it</Button>
        </View> : null}
        <View style={styles.filterSectionHeader}>
          <Text style={styles.filterSectionTitle}>Location</Text>
          <Text style={styles.filterSectionSub}>
            {locationLabel}{activeFilterCount ? ` · Filters ${activeFilterCount}` : ''}
          </Text>
        </View>

        <View style={[styles.filterRail, { marginTop: 8 }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginRight: 60 }} contentContainerStyle={{ paddingRight: 60 }}>
          {RADIUS_OPTIONS.map((mi) => (
            <Chip
              key={mi}
              selected={locationMode === 'radius' && radiusMiles === mi}
              maxFontSizeMultiplier={1}
              accessibilityLabel={`${mi} miles`}
              onPress={() => {
                setRadiusMiles(mi);
                setLocationMode('radius');
                setStateCodeFilter(null);
              }}
              style={[styles.chip, styles.filterChip, styles.radiusChip]}
              textStyle={styles.radiusChipText}
            >
              {mi} mi
            </Chip>
          ))}

          {currentState && (
            <Chip
              selected={locationMode === 'state' && stateCodeFilter === currentState}
              maxFontSizeMultiplier={1}
              accessibilityLabel={`Current state: ${currentState}`}
              onPress={() => {
                setLocationMode('state');
                setStateCodeFilter(currentState);
              }}
              style={[styles.chip, styles.filterChip]}
            >
              {`Current state: ${currentState}`}
            </Chip>
          )}

          <Chip
            selected={locationMode === 'state' && stateCodeFilter && stateCodeFilter !== currentState}
            maxFontSizeMultiplier={1}
            accessibilityLabel="Choose your state"
            onPress={() => setStatePickerOpen(true)}
            style={[styles.chip, styles.filterChip]}
            icon="map-search"
          >
            Choose your state
          </Chip>

          <Chip
            selected={locationMode === 'all'}
            maxFontSizeMultiplier={1}
            accessibilityLabel="All locations"
            onPress={() => {
              setLocationMode('all');
              setStateCodeFilter(null);
            }}
            style={[styles.chip, styles.filterChip]}
            icon="earth"
          >
            All
          </Chip>
        </ScrollView>
        <LinearGradient pointerEvents="none" colors={[colors.background, colors.background]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.filterRailHint}>
          <MaterialCommunityIcons name="chevron-right" size={20} color={colors.onSurfaceVariant} />
        </LinearGradient>
        </View>

        <View style={[styles.filterRail, { marginTop: 4 }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginRight: 60 }} contentContainerStyle={{ paddingVertical: 6, paddingRight: 60 }}>
          {[['overall', 'Score', 'Overall score'], ['nearest', 'Near', 'Nearest'], ['ratings', 'Votes', 'Most ratings'], ['photos', 'Photos', 'Most photos']].map(([value, label, accessibilityLabel]) => (
            <Chip key={value} maxFontSizeMultiplier={1} accessibilityLabel={accessibilityLabel} selected={discoverySort === value} onPress={() => setDiscoverySort(value)} style={[styles.chip, styles.filterChip]}>{label}</Chip>
          ))}
          <Chip maxFontSizeMultiplier={1} accessibilityLabel="Rated by you" selected={selectedTagId === 'my'} onPress={() => setSelectedTagId(selectedTagId === 'my' ? null : 'my')} style={[styles.chip, styles.filterChip]}>My ratings</Chip>
          {tagsForFilter.map((tag) => <Chip key={tag.id} maxFontSizeMultiplier={1} accessibilityLabel={tag.name} selected={selectedTagId === tag.id} onPress={() => setSelectedTagId(selectedTagId === tag.id ? null : tag.id)} style={[styles.chip, styles.filterChip]}>{tag.name}</Chip>)}
        </ScrollView>
        <LinearGradient pointerEvents="none" colors={[colors.background, colors.background]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.filterRailHint}>
          <MaterialCommunityIcons name="chevron-right" size={20} color={colors.onSurfaceVariant} />
        </LinearGradient>
        </View>
        <Divider style={{ marginTop: 10, marginBottom: 6 }} />
      </Animated.View>

      {loading || (savedView !== 'discover' && saved.listStatus === 'loading' && displayedRows.length === 0) ? (
        <View style={styles.center}>
          <LoadingSkeleton rows={3} style={{ width: "90%", paddingTop: headerHeight }} />
        </View>
      ) : (
        <Animated.FlatList
          data={displayedRows}
          viewabilityConfig={{ itemVisiblePercentThreshold: 20 }}
          keyExtractor={(it) => String(it.destination_id)}
          renderItem={renderItem}
          contentContainerStyle={{
            padding: 16,
            paddingBottom: 24,
            paddingTop: headerHeight,
          }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            savedView !== 'discover' && saved.listStatus === 'error' ? (
              <FeedbackState
                style={styles.emptyState}
                icon="cloud-alert-outline"
                title={`Could not load ${savedView === 'favorites' ? 'Favorites' : 'Want to Try'}`}
                body={saved.listError || 'Check your connection and try again.'}
                actionLabel="Try again"
                onAction={() => void saved.loadList(savedView)}
              />
            ) : savedView !== 'discover' ? (
              <FeedbackState
                style={styles.emptyState}
                icon={savedView === 'favorites' ? 'heart-outline' : 'bookmark-outline'}
                title={savedView === 'favorites' ? 'No Favorites yet' : 'Nothing in Want to Try yet'}
                body={savedView === 'favorites'
                  ? 'Rate a restaurant, then save it here for an easy return.'
                  : 'Save unrated restaurants here when you find wings worth trying.'}
              />
            ) : (
              <FeedbackState
                style={styles.emptyState}
                icon="map-search-outline"
                title={locationMode === 'radius' ? 'No wing spots in this radius' : 'No Wingdex matches'}
                body="Broaden the search, jump to a state, or add the missing restaurant so your local Wingdex gets better."
                actionLabel="Add restaurant"
                onAction={() => {
                  trackEvent({
                    eventName: 'empty_state_cta_clicked',
                    screen: 'ratings',
                    userId: user?.id ?? null,
                    metadata: {
                      state: 'wingdex_no_results',
                      cta_name: 'add_restaurant_empty_wingdex',
                      source_screen: 'ratings',
                      query_length: query.trim().length,
                      location_mode: locationMode,
                      state_code: stateCodeFilter ?? null,
                      radius_miles: locationMode === 'radius' ? radiusMiles : null,
                      selected_tag_id: selectedTagId ?? null,
                    },
                  });
                  openWingman('wingdex_empty_state');
                }}
                secondaryLabel={locationMode === 'radius' ? 'Expand radius' : 'View all'}
                onSecondary={() => {
                  if (locationMode === 'radius') {
                    expandRadius();
                    return;
                  }
                  setLocationMode('all');
                  setStateCodeFilter(null);
                }}
              />
            )
          }
          scrollEventThrottle={16}
        />
      )}

      {!loading && status !== 'granted' ? (
        <View
          pointerEvents="box-none"
          style={[
            styles.bottomCtaWrap,
            {
              paddingBottom: Math.max(10, insets.bottom + 6),
              backgroundColor: colors.background,
            },
          ]}
        >
          <Button mode="contained" icon="crosshairs-gps" onPress={askPermission}>
            Enable location
          </Button>
        </View>
      ) : null}

      {/* Drill-down modal (full screen) */}
      {galleryRestaurant ? <WingdexPhotoGallery key={galleryRestaurant.destination_id} restaurant={galleryRestaurant}
        onClose={() => { setGalleryRestaurant(null); setPhotoRevision((n) => n + 1); }} /> : null}
      <Portal>
        <Modal
          visible={open}
          onDismiss={() => setOpen(false)}
          contentContainerStyle={styles.fullscreenModal}
        >
          <View style={{ flex: 1, backgroundColor: colors.background }}>
            {/* Header */}
            <View
              style={[
                styles.drillHeader,
                {
                  paddingTop: Math.max(10, insets.top),
                  backgroundColor: colors.background,
                },
              ]}
            >
            <Pressable
              onPress={() => setOpen(false)}
              hitSlop={10}
              style={styles.drillBackBtn}
            >
              <MaterialCommunityIcons name="arrow-left" size={24} color={colors.onSurface} />
            </Pressable>
      
            <Text numberOfLines={1} style={[styles.drillHeaderTitle, { color: colors.onSurface }]}>
              {active?.name ?? 'Details'}
            </Text>
      
            <View style={{ width: 34 }} />
          </View>
      
          {/* Body */}
          {!active ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator />
            </View>
          ) : (
              <ScrollView
                showsVerticalScrollIndicator={false}
                style={{ flex: 1, backgroundColor: colors.background }}
                contentContainerStyle={{
                  paddingHorizontal: 16,
                  paddingBottom: Math.max(18, insets.bottom + 18),
                }}
              >
              <LegendaryDetailBanner
                event={legendaryByRestaurant.get(active.destination_id)}
                onRate={() => {
                  setOpen(false);
                  onPressCoinRate(active);
                }}
              />

              <ScoreHeader
                value={active.avgWeight}
                label="BuffaGo Score"
                subLabel="Average weighted score"
              />
              <Button icon="image-multiple" onPress={() => { setOpen(false); setGalleryRestaurant(active); }}>
                {pictureCounts[String(active.destination_id)] || 0} Pictures
              </Button>
      
              <View style={{ alignItems: 'center', marginTop: 10, marginBottom: 6 }}>
                <Text style={{ color: colors.onSurface, opacity: 0.7, textAlign: 'center' }}>
                  {[active?.town, active?.stateCode].filter(Boolean).join(', ')}
                  {Number.isFinite(active?.distanceMi) ? ` • ${fmt2(active.distanceMi)} mi` : ''}
                </Text>
      
                {active?.address ? (
                  <Text style={{ color: colors.onSurface, opacity: 0.55, textAlign: 'center', marginTop: 4 }}>
                    {active.address}
                  </Text>
                ) : null}

                <Button
                  mode="contained"
                  icon="flag-checkered"
                  onPress={() => pickAsHomeNextSpot(active)}
                  style={styles.nextSpotButton}
                  contentStyle={{ height: 46 }}
                  uppercase={false}
                >
                  Set Destination
                </Button>
                <Button
                  mode="outlined"
                  icon="navigation-variant-outline"
                  onPress={() => void takeMeThere(active)}
                  style={styles.nextSpotButton}
                  contentStyle={{ height: 46 }}
                  uppercase={false}
                >
                  Take Me There
                </Button>

                {savedFeatureEnabled ? (
                  <View style={styles.detailSavedActionRow}>
                    {(() => {
                      const ratedByMe = active.ratedByMe || myRated.has(active.destination_id) || saved.ratedIds.has(active.destination_id);
                      const isFavorite = saved.favoriteIds.has(active.destination_id);
                      const isWantToTry = saved.wantToTryIds.has(active.destination_id);
                      const favoritePending = saved.isPending('favorites', active.destination_id);
                      const wantToTryPending = saved.isPending('wantToTry', active.destination_id);
                      return (
                        <>
                          <Button
                            mode={isFavorite ? 'contained-tonal' : 'outlined'}
                            icon={isFavorite ? 'heart' : 'heart-outline'}
                            disabled={favoritePending || (!ratedByMe && !isFavorite)}
                            loading={favoritePending}
                            onPress={() => void handleSavedAction(active, 'favorites', !isFavorite)}
                            style={styles.detailSavedButton}
                            contentStyle={styles.savedActionContent}
                            accessibilityLabel={ratedByMe ? `${isFavorite ? 'Remove from' : 'Add to'} Favorites` : 'Rate this restaurant to add it to Favorites'}
                          >
                            {ratedByMe ? (isFavorite ? 'Favorited' : 'Favorite') : 'Rate to favorite'}
                          </Button>
                          <Button
                            mode={isWantToTry ? 'contained-tonal' : 'outlined'}
                            icon={isWantToTry ? 'bookmark' : 'bookmark-outline'}
                            disabled={wantToTryPending || ratedByMe}
                            loading={wantToTryPending}
                            onPress={() => void handleSavedAction(active, 'wantToTry', !isWantToTry)}
                            style={styles.detailSavedButton}
                            contentStyle={styles.savedActionContent}
                            accessibilityLabel={ratedByMe ? 'This restaurant is already rated' : `${isWantToTry ? 'Remove from' : 'Save to'} Want to Try`}
                          >
                            {ratedByMe ? 'Already rated' : (isWantToTry ? 'Saved' : 'Want to Try')}
                          </Button>
                        </>
                      );
                    })()}
                  </View>
                ) : null}
              </View>
      
              {Number.isFinite(Number(active?.myAvgWeight)) ? (
                <>
                  <Divider style={{ marginVertical: 12 }} />

                  <View style={styles.yourScoreRow}>
                    <Text style={styles.yourScoreLabel}>Your Score</Text>

                    <View style={[styles.yourScorePill, { backgroundColor: colors.surfaceVariant }]}>
                      <Text style={[styles.yourScoreValue, { color: colors.onSurface }]}>
                        {fmt2(active.myAvgWeight)}
                      </Text>
                      <Text style={styles.yourScoreSub}>/ 100</Text>
                    </View>
                  </View>

                  <Button
                    mode="contained-tonal"
                    icon="share-variant"
                    onPress={() => shareRating(active)}
                    style={styles.shareRatingButton}
                  >
                    Share rating
                  </Button>
                </>
              ) : null}
      
              <Divider style={{ marginVertical: 12 }} />

              <Text style={styles.sectionTitle}>Average scores</Text>
              <View style={styles.metricsGrid}>
                <MetricPretty label="Crispiness" value={active.avgCrisp} />
                <MetricPretty label="Sauce" value={active.avgSauce} />
                <MetricPretty label="Chicken Quality" value={active.avgMeat} />
                <MetricPretty label="Experience" value={active.avgOverall} />
              </View>
      
              <Divider style={{ marginVertical: 12 }} />
      
              <Text style={styles.sectionTitle}>Top tags</Text>
              <TagChips items={active.topTags} />
      
              <Divider style={{ marginVertical: 12 }} />

              <Text style={styles.sectionTitle}>Recent ratings</Text>
              {recentRatingsLoading ? (
                <View style={{ alignItems: 'center', paddingVertical: 8 }}>
                  <ActivityIndicator />
                </View>
              ) : recentRatings.length === 0 ? (
                <Text style={{ color: colors.onSurface, opacity: 0.7 }}>
                  No recent ratings yet.
                </Text>
              ) : (
                <View style={styles.recentRatingsList}>
                  {recentRatings.map((rating, idx) => (
                    <View
                      key={`${rating.user_id || 'guest'}-${rating.created_at || idx}`}
                      style={[styles.recentRatingRow, { borderColor: 'rgba(255,255,255,0.10)' }]}
                    >
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text numberOfLines={1} style={styles.recentRatingName}>
                          {rating.displayName}
                          {rating.is_buffacoin ? ' · Coin' : ''}
                        </Text>
                        <Text style={[styles.recentRatingDate, { color: colors.onSurface }]}>
                          {formatRatingDate(rating.created_at)}
                        </Text>
                      </View>
                      <View style={styles.recentRatingScoreBox}>
                        <Text style={styles.recentRatingScore}>{fmt2(rating.weight_score)}</Text>
                        <Text style={styles.recentRatingScoreSub}>score</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              <Divider style={{ marginVertical: 12 }} />
      
              <Text style={styles.sectionTitle}>In Crawls</Text>
              {routesLoading ? (
                <View style={{ alignItems: 'center', paddingVertical: 8 }}>
                  <ActivityIndicator />
                </View>
              ) : routesForActive.length === 0 ? (
                <Text style={{ color: colors.onSurface, opacity: 0.7 }}>
                  This restaurant isn’t in any crawls yet.
                </Text>
              ) : (
                <View style={styles.tagChipWrap}>
                  {routesForActive.map((r) => (
                    <Chip
                      key={r.id}
                      style={[styles.tagChip, { backgroundColor: colors.surfaceVariant }]}
                      compact
                      onPress={() => {
                        setOpen(false);
                        setActive(null);
                        router.push({
                          pathname: '/(tabs)/routes',
                          params: { openRouteId: r.id, returnTo: '/ratings' },
                        });
                      }}
                    >
                      {r.title}
                      {r.city ? ` · ${r.city}` : ''}
                    </Chip>
                  ))}
                </View>
              )}
            </ScrollView>
          )}
          </View>
        </Modal>
      </Portal>
      {/* Choose state dialog */}
      <Portal>
        <Dialog visible={statePickerOpen} onDismiss={() => setStatePickerOpen(false)} style={styles.dialog}>
          <Dialog.Title style={{ textAlign: 'center' }}>Choose a state</Dialog.Title>
          <Dialog.Content>
            <Text style={{ opacity: 0.7, marginBottom: 10 }}>Filter ratings so you can plan a wing trip.</Text>
            <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
              <View style={styles.stateGrid}>
                {US_STATES.map((s) => (
                  <Chip
                    key={s.code}
                    selected={locationMode === 'state' && stateCodeFilter === s.code}
                    onPress={() => {
                      setLocationMode('state');
                      setStateCodeFilter(s.code);
                      setStatePickerOpen(false);
                    }}
                    style={styles.stateChip}
                  >
                    {s.name} ({s.code})
                  </Chip>
                ))}
              </View>
            </ScrollView>
          </Dialog.Content>
          <Dialog.Actions style={{ justifyContent: 'space-between' }}>
            <Button
              mode="outlined"
              onPress={() => {
                setLocationMode('all');
                setStateCodeFilter(null);
                setStatePickerOpen(false);
              }}
            >
              Clear (All)
            </Button>
            <Button onPress={() => setStatePickerOpen(false)}>Close</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {/* Restaurants Map dialog */}
      <Portal>
        <Dialog visible={openMap} onDismiss={() => setOpenMap(false)} style={[styles.dialog, { maxHeight: mapDialogMaxHeight }]}>
          <Dialog.Title style={{ textAlign: 'center' }}>Restaurants Map</Dialog.Title>
          <Dialog.Content>
            <View style={{ height: mapCanvasHeight, borderRadius: 12, overflow: 'hidden' }}>
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
                {(filtered || [])
                  .filter((r) => mapCoordinate(r))
                  .filter((r) => {
                    if (!mapLegendFilter) return true;
                    const isRated = myRated.has(r.destination_id);
                    if (mapLegendFilter === 'rated') return isRated;
                    if (mapLegendFilter === 'unrated') return !isRated;
                    return true;
                  })
                  .map((r) => {
                    const color = statusColorFor(r.destination_id);
                    const legendaryEvent = legendaryByRestaurant.get(r.destination_id);
                    return (
                      <Marker
                        key={r.destination_id}
                        coordinate={{
                          latitude: Number(r.lat),
                          longitude: Number(r.lng),
                        }}
                        anchor={{ x: 0.5, y: 0.5 }}
                        onPress={() => {
                          openDestinationDetail(r);
                          setOpenMap(false);
                        }}
                      >
                        {legendaryEvent ? (
                          <LegendaryMapMarker event={legendaryEvent} />
                        ) : (
                          <View style={[styles.legendDot, { backgroundColor: color, borderColor: '#fff' }]} />
                        )}
                      </Marker>
                    );
                  })}
              </MapView>
            </View>

            <View style={{ marginTop: 10 }}>
              <Pressable
                onPress={() => setMapLegendFilter((prev) => (prev === 'unrated' ? null : 'unrated'))}
                style={[
                  styles.legendRowPressable,
                  mapLegendFilter === 'unrated' && styles.legendRowPressableActive,
                ]}
              >
                <View style={styles.legendRow}>
                  <View style={[styles.legendSwatch, { backgroundColor: '#D32F2F' }]} />
                  <Text style={mapLegendFilter === 'unrated' ? styles.legendActiveText : null}>
                    Not rated by you
                  </Text>
                </View>
              </Pressable>

              <Pressable
                onPress={() => setMapLegendFilter((prev) => (prev === 'rated' ? null : 'rated'))}
                style={[
                  styles.legendRowPressable,
                  mapLegendFilter === 'rated' && styles.legendRowPressableActive,
                ]}
              >
                <View style={styles.legendRow}>
                  <View style={[styles.legendSwatch, { backgroundColor: '#2E7D32' }]} />
                  <Text style={mapLegendFilter === 'rated' ? styles.legendActiveText : null}>
                    Rated by you
                  </Text>
                </View>
              </Pressable>
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
            <Button contentStyle={{ minHeight: 44 }} onPress={() => setOpenMap(false)}>Close</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {/* Buffacoins — info */}
      <Portal>
        <Dialog visible={coinInfoOpen} onDismiss={() => setCoinInfoOpen(false)} style={styles.dialog}>
          <Dialog.Title style={{ textAlign: 'center' }}>Buffacoins</Dialog.Title>
          <Dialog.Content>
            <Text style={{ opacity: 0.75 }}>
              Buffacoins let you rate restaurants  without the proximity check. This is perfect for “I was there at some point” moments.
            </Text>

            <View style={[styles.infoCallout, { backgroundColor: colors.surfaceVariant }]}>
              <Text style={styles.infoCalloutTitle}>Rate anywhere</Text>
              <Text style={[styles.infoCalloutText, { color: colors.onSurface }]}>
                Buffacoins let you rate restaurants without the check-in distance requirement.
              </Text>
            </View>

            <View style={{ marginTop: 12 }}>
              <Text style={{ fontWeight: '900' }}>How to earn them</Text>
              <Text style={{ marginTop: 6, opacity: 0.85 }}>
                • Finish a crawl in under 24 hours: <Text style={{ fontWeight: '900' }}>+5</Text>
              </Text>
              <Text style={{ marginTop: 4, opacity: 0.85 }}>
                • Finish a crawl in under a week: <Text style={{ fontWeight: '900' }}>+3</Text>
              </Text>
              <Text style={{ marginTop: 4, opacity: 0.85 }}>
                • Any other completed crawl: <Text style={{ fontWeight: '900' }}>+1</Text>
              </Text>
            </View>

            {!user?.id ? (
              <View style={{ marginTop: 12 }}>
                <Text style={{ opacity: 0.85 }}>Sign in to keep your Wingdex progress and earn Buffacoins.</Text>
              </View>
            ) : null}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setCoinInfoOpen(false)}>Close</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {/* Buffacoins — out of coins */}
      <Portal>
        <Dialog visible={coinOutOpen} onDismiss={() => setCoinOutOpen(false)} style={styles.dialog}>
          <Dialog.Title style={{ textAlign: 'center' }}>Out of Buffacoins</Dialog.Title>
          <Dialog.Content>
            <Text style={{ opacity: 0.75 }}>
              You’re out of Buffacoins right now. Complete crawls to earn more.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setCoinOutOpen(false)}>Close</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <Portal>
        <Dialog visible={coinCelebrateOpen} onDismiss={() => setCoinCelebrateOpen(false)} style={styles.dialog}>
          <Dialog.Title style={{ textAlign: 'center' }}>Added to your Wingdex</Dialog.Title>
          <Dialog.Content>
            <View style={[styles.successScorePanel, { backgroundColor: colors.surfaceVariant }]}>
              <Text style={styles.successScoreLabel}>BuffaGo Score</Text>
              <Text style={styles.successScoreValue}>{fmt2(pendingSummary?.weightScore)}</Text>
            </View>
            <Text style={{ opacity: 0.78, textAlign: 'center', marginTop: 12 }}>
              Your rating was saved and your Buffacoin balance is now {pendingCoinBalance ?? buffacoinBalance}.
            </Text>
          </Dialog.Content>
          <Dialog.Actions style={{ justifyContent: 'space-between' }}>
            <Button
              mode="outlined"
              onPress={() => {
                setCoinCelebrateOpen(false);
                setPendingSummary(null);
                setPendingCoinBalance(null);
              }}
            >
              Rate another
            </Button>
            <Button
              mode="contained"
              onPress={() => {
                setCoinCelebrateOpen(false);
                setPendingSummary(null);
                setPendingCoinBalance(null);
              }}
            >
              Done
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <RatingWizardDialog
        visible={coinRateOpen}
        destinationName={coinRatingDest?.name ? `Rate • ${coinRatingDest.name}` : 'Rate'}
        tagOptions={ratingTagOptions}
        saving={coinSubmitting}
        finalizeLabel={`Spend ${Math.max(1, Number(coinCostForActive || 1))} 🪙 & Submit`}
        onDismiss={() => {
          if (!coinSubmitting) setCoinRateOpen(false);
        }}
        onFinalize={submitCoinRating}
      />

      <WingmanAddDialog
        visible={wingmanOpen}
        onDismiss={() => setWingmanOpen(false)}
        initialStateId={wingmanStateCtx?.stateId ?? null}
        initialStateCode={wingmanStateCtx?.stateCode ?? null}
        userId={user?.id ?? null}
        onPickDestination={handleWingmanPickDestination}
        onManualReviewQueued={() => {
          setWingmanOpen(false);
          Alert.alert(
            'Queued for review',
            'Wingman sent that restaurant to the BuffaGo team for review.'
          );
        }}
      />

    </SafeAreaView>
  );
}

/* ---------------- styles ---------------- */
const styles = StyleSheet.create({
  compactRestaurantRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  restaurantBackdrop: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%', borderRadius: 12 },
  restaurantScrim: { ...StyleSheet.absoluteFillObject, borderRadius: 12, backgroundColor: 'rgba(9,10,12,0.86)' },
  restaurantMetrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 6 },
  compactScore: { color: tokens.colors.orange, fontWeight: '800', fontSize: 16 },
  compactMetric: { fontSize: 12, color: tokens.colors.muted },
  restaurantActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 10 },
  savedDestinationRail: { flexDirection: 'row', gap: 6, marginTop: 8, marginBottom: 2 },
  savedDestinationChip: { flex: 1, minHeight: 40, justifyContent: 'center' },
  savedActionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  savedActionButton: { flexGrow: 1, flexBasis: 132, minWidth: 132, borderRadius: 10 },
  savedActionContent: { minHeight: 44 },
  savedActionLabel: { fontSize: 12, marginHorizontal: 8 },
  detailSavedActionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  detailSavedButton: { flex: 1, minWidth: 140, borderRadius: 10 },
  destinationActionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  destinationActionButton: { flexGrow: 1, flexBasis: 142, minWidth: 142, borderRadius: 10 },
  header: {
  position: 'absolute',
  left: 0,
  right: 0,
  top: 0,
  paddingHorizontal: 16,
  paddingBottom: 0,
},
  filterRail: { position: 'relative' },
  filterRailHint: { position: 'absolute', top: 0, right: 0, bottom: 0, width: 60, alignItems: 'center', justifyContent: 'center' },
  headerTopRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center', justifyContent: 'space-between' },
  title: { fontWeight: '900', letterSpacing: 0 },
  subtitle: { opacity: 0.68, marginTop: 2, lineHeight: 17 },
  yourScoreRow: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 2,
  },
  
  yourScoreLabel: {
    fontWeight: '800',
    opacity: 0.85,
  },
  
  yourScorePill: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  
  yourScoreValue: {
    fontWeight: '900',
    fontSize: 16,
  },
  
  yourScoreSub: {
    opacity: 0.65,
    fontSize: 12,
    fontWeight: '700',
  },
  shareRatingButton: {
    borderRadius: 8,
    alignSelf: 'center',
    marginTop: 12,
  },
  nextSpotButton: {
    borderRadius: 8,
    marginTop: 14,
    alignSelf: 'stretch',
  },
  coinPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 999,
  },
  coinImg: { width: 20, height: 20 },
  coinCount: { fontWeight: '900', fontSize: 12 },

  hintPanel: {
    marginTop: 10,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  hintTitle: {
    fontWeight: '900',
    fontSize: 13,
  },
  hintText: {
    opacity: 0.72,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  coinEducationRow: {
    marginTop: 8,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  coinEducationTitle: {
    fontWeight: '900',
    fontSize: 13,
  },
  coinEducationText: {
    opacity: 0.7,
    fontSize: 12,
    marginTop: 2,
  },
  metricsSummaryRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  metricTile: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  metricTileValue: {
    fontWeight: '900',
    fontSize: 18,
  },
  metricTileLabel: {
    opacity: 0.68,
    fontSize: 11,
    marginTop: 2,
  },

  filterSectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  filterSectionTitle: { fontWeight: '900', opacity: 0.9 },
  filterSectionSub: { opacity: 0.65, fontSize: 12 },

  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  emptyState: {
    alignItems: 'center',
    marginTop: 24,
    paddingHorizontal: 22,
  },
  emptyStateTitle: {
    fontWeight: '900',
    fontSize: 16,
    textAlign: 'center',
  },
  emptyStateText: {
    opacity: 0.75,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  emptyWingmanButton: {
    borderRadius: 12,
    marginTop: 14,
  },
  emptyActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
  },
  bottomCtaWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 10,
    paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.12)',
  },

  card: { borderRadius: tokens.radius.card, borderColor: tokens.colors.border },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: { fontWeight: '700' },
  muted: { opacity: 0.7, marginTop: 2 },

  tagLine: { marginTop: 4 },
  tagLineMuted: { marginTop: 4, opacity: 0.6 },
  tagHighlight: { fontWeight: '800' },

  rightCol: {
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    width: 104,            
  },
  locLine: { opacity: 0.8, marginTop: 2 },
  rateSlot: {
    height: 42,            // ✅ space for the button (even if hidden)
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    marginBottom: 8,
  },
  
  rateBtn: {
    borderRadius: 999,
    minWidth: 96,
  },
  
  rateBtnContent: {
    paddingHorizontal: 10, // ✅ more horizontal room
    height: 38,
  },
  
  rateBtnLabel: {
    fontWeight: '800',
    fontSize: 12,
  },
  scoreBadge: {
    minWidth: 66,
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  scoreBadgeText: { fontWeight: '900', fontSize: 18 },
  badgeSub: { fontSize: 11, opacity: 0.7 },

  dialog: { alignSelf: 'center', width: '92%', maxWidth: 520, borderRadius: 16, maxHeight: '90%' },

  chip: { marginRight: 8, borderRadius: 999 },
  filterChip: { flexShrink: 0 },
  radiusChip: { minWidth: 68, alignItems: 'center' },
  radiusChipText: { fontSize: 12, fontWeight: '700' },

  stateGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stateChip: { borderRadius: 999 },

  scoreHeader: { alignItems: 'center', paddingVertical: 10, borderRadius: 12 },
  scoreHeaderLabel: { fontWeight: '700', letterSpacing: 0.3 },
  scoreHeaderValue: { fontWeight: '900', fontSize: 28, marginTop: 2 },
  scoreHeaderSub: { fontSize: 12, marginTop: 2 },

  sectionTitle: { fontWeight: '800', marginBottom: 8 },

  metricsGrid: { gap: 10 },
  metricPretty: { borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12 },
  metricHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  metricPrettyLabel: { fontWeight: '700' },
  metricPrettyVal: { fontWeight: '900' },
  metricBar: { height: 8, borderRadius: 8 },

  tagChipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tagChip: { borderRadius: 999 },
  recentRatingsList: {
    gap: 8,
  },
  recentRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  recentRatingName: {
    fontWeight: '900',
  },
  recentRatingDate: {
    opacity: 0.62,
    fontSize: 12,
    marginTop: 2,
  },
  recentRatingScoreBox: {
    alignItems: 'flex-end',
    marginLeft: 12,
  },
  recentRatingScore: {
    fontWeight: '900',
    fontSize: 16,
  },
  recentRatingScoreSub: {
    opacity: 0.62,
    fontSize: 11,
  },

  inlineChipWrap: {
    marginTop: 6,
    alignSelf: 'stretch',
    paddingRight: 4,
  },
  
  youRatedChip: {
    borderRadius: 999,
    alignSelf: 'flex-start',
    maxWidth: '100%',
    paddingVertical: 6,     // 🔑 ensures background is taller than text
  },
  
  youRatedChipText: {
    fontWeight: '800',
    fontSize: 13,
    lineHeight: 18,         // 🔑 sync text height with chip
  },

  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendSwatch: { width: 14, height: 14, borderRadius: 7 },
  legendDot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2 },

  legendRowPressable: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12, marginTop: 6 },
  legendRowPressableActive: { opacity: 1 },
  legendActiveText: { fontWeight: '800' },
  rateBtnTopRight: {
  alignSelf: 'flex-end',
  borderRadius: 999,
  marginBottom: 8,
},
cardContent: {
  paddingVertical: 14,
  paddingHorizontal: 12,
},

nameCentered: {
  fontWeight: '900',
  textAlign: 'left',
  marginBottom: 2,
},

metaRow: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
},

metaLeft: {
  width: 104, // keeps left side stable
  alignItems: 'flex-start',
  justifyContent: 'center',
},

metaMid: {
  flex: 1,
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 0,
},

rateBtnInline: {
  borderRadius: 999,
  minWidth: 92,
},

rateBtnInlineContent: { paddingHorizontal: 8, minHeight: 44 },

  rateBtnInlineLabel: {
  fontWeight: '800',
  fontSize: 12,
},
ratedInlineChip: {
  minHeight: 44,
  minWidth: 92,
  borderRadius: 999,
  alignItems: 'center',
  justifyContent: 'center',
  paddingHorizontal: 12,
},
ratedInlineChipText: {
  fontWeight: '900',
  fontSize: 12,
},
nameLine: {
  flexDirection: 'row',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 6,
  marginBottom: 8,
},
restaurantIdentity: {
  flex: 1,
  minWidth: 0,
  paddingRight: 8,
},
locationLine: {
  opacity: 0.62,
  fontSize: 12,
},
nameRatingsInline: {
  opacity: 0.62,
  fontWeight: '700',
},
scoreBadgeCompact: {
  minWidth: 66,
  alignItems: 'center',
  paddingVertical: 5,
  paddingHorizontal: 10,
  borderRadius: 8,
},

scoreBadgeTextCompact: {
  fontWeight: '900',
  fontSize: 16,
},
drillHeader: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  paddingHorizontal: 12,
  paddingBottom: 10,
  backgroundColor: 'transparent',
},

drillBackBtn: {
  width: 34,
  height: 34,
  borderRadius: 999,
  alignItems: 'center',
  justifyContent: 'center',
},

drillHeaderTitle: {
  flex: 1,
  textAlign: 'center',
  fontWeight: '900',
  fontSize: 16,
  paddingHorizontal: 8,
},

  /* ---- Buffacoin wizard ---- */
  ratingProgress: { height: 6, borderRadius: 999, marginBottom: 4 },

  stepTitle: { textAlign: 'center', fontSize: 20, fontWeight: '800', marginBottom: 4 },
  stepDescription: { textAlign: 'center', fontSize: 12, marginTop: 6, opacity: 0.75 },

  pepperLabelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  pepperEdgeLabel: { fontSize: 11, opacity: 0.85 },

  pepperOuter: { marginTop: 2, marginBottom: 6, height: 44, justifyContent: 'center' },
  pepperVisualWrapper: { position: 'absolute', left: 0, right: 0 },
  pepperBodyBase: {
    height: 26,
    backgroundColor: '#050505',
    borderTopLeftRadius: 24,
    borderBottomLeftRadius: 30,
    borderTopRightRadius: 10,
    borderBottomRightRadius: 6,
    overflow: 'hidden',
    transform: [{ skewX: '-10deg' }, { scaleY: 1.05 }],
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  pepperFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderTopLeftRadius: 24,
    borderBottomLeftRadius: 30,
    borderTopRightRadius: 10,
    borderBottomRightRadius: 6,
  },
  pepperArrowContainer: { position: 'absolute', top: -4, transform: [{ translateX: -6 }] },
  pepperArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#ffffff',
  },
  pepperSliderGesture: { ...StyleSheet.absoluteFillObject },
  sliderDescription: { textAlign: 'center', fontSize: 12, marginTop: 4, opacity: 0.8 },

  thumbRow: { flexDirection: 'row', gap: 12, marginTop: 12, justifyContent: 'center' },
  thumbChoice: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  fullscreenModal: {
  flex: 1,
  width: '100%',
  height: '100%',
  margin: 0,
  borderRadius: 0,
  },
  infoCallout: {
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
  },
  infoCalloutTitle: {
    fontWeight: '900',
    marginBottom: 3,
  },
  infoCalloutText: {
    opacity: 0.78,
    lineHeight: 18,
  },
  successScorePanel: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  successScoreLabel: {
    fontWeight: '800',
    opacity: 0.75,
  },
  successScoreValue: {
    fontWeight: '900',
    fontSize: 30,
    marginTop: 2,
  },
  thumbChoiceOn: { borderColor: '#FF6F00', backgroundColor: 'rgba(255,111,0,0.18)' },
  thumbIcon: { fontSize: 26 },
  thumbText: { marginTop: 6, fontWeight: '800' },
});
