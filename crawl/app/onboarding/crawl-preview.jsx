// app/onboarding/crawl-preview.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Alert,
  StyleSheet,
  Image,
  ImageBackground,
  Pressable,
  Animated,
  Easing,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase.js';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActivityIndicator, Button, Text, useTheme, ProgressBar } from 'react-native-paper';

const PREVIEW_ROUTE_ID = 'de25fb99-8e99-45dd-a079-85b5226dc725';

const CRAWL_BG = require('../../assets/crawl-bg.png');
const WING_USER = require('../../assets/wing-user.png');

const TILE_GAP = 12;
const stepStride = 86;

const toStr = (v) => (Array.isArray(v) ? v[0] : v) ?? undefined;

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
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('Preview route is not available right now.');

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

  const travelMode = 'walking';
  return { title: data.title, stops, travelMode };
}

function StepTilePreview({
  ord,
  state,
  name,
  isStart,
  subtitle,
  showWingUser,
  unlockHint,
  score,
}) {
  const theme = useTheme();
  const isLocked = state === 'locked';
  const isRated = state === 'rated';
  const isCurrent = state === 'current';

  const ORANGE_BG = 'rgba(255,111,0,0.18)';
  const ORANGE_BR = 'rgba(255,111,0,0.95)';

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
      <View
        style={[
          styles.stepTile,
          {
            backgroundColor: tileBg,
            borderColor: border,
            opacity: isLocked ? 0.55 : 1,
          },
        ]}
      >
        {showWingUser ? (
          <Animated.Image source={WING_USER} resizeMode="contain" style={[styles.wingUser, wingAnimStyle]} />
        ) : null}

        <View style={styles.stepTileTopRow}>
          <View style={styles.stepTileNumWrap}>
            <Text style={styles.stepTileNum}>{ord}</Text>
          </View>

          <View style={styles.stepTileTextWrap}>
            <Text style={[styles.stepTileTitle, isLocked && { opacity: 0.82 }]} numberOfLines={2}>
              {isStart ? 'Start' : (name ? String(name) : `Stop ${ord}`)}
            </Text>

            <Text style={styles.stepTileSub} numberOfLines={1}>
              {isStart
                ? (subtitle || 'Preview')
                : isRated
                  ? `Rated${score != null && Number.isFinite(Number(score)) ? ` • ${Number(score).toFixed(0)}` : ''}`
                  : isCurrent
                    ? 'This is your next stop'
                    : 'Locked'}
            </Text>

            {isLocked && unlockHint ? (
              <Text style={styles.stepTileHint} numberOfLines={1}>
                {unlockHint}
              </Text>
            ) : null}
          </View>
        </View>
      </View>

      <View style={styles.stepTileShadowBase} />
    </View>
  );
}

export default function CrawlPreview() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { prefact, nextPath, nextParams } = useLocalSearchParams();

  const preFact = toStr(prefact);
  const initialFact = preFact && preFact.length > 0 ? preFact : 'Loading a wing fact…';
  const [fact, setFact] = useState(initialFact);

  const [loading, setLoading] = useState(true);
  const [routeMeta, setRouteMeta] = useState({ title: '', stops: [], travelMode: 'walking' });

  // Fun facts shown while loading
  const FUN_FACTS = useMemo(
    () => [
      'Classic Buffalo sauce = cayenne hot sauce + melted butter.',
      'The first Buffalo wings were popularized in Buffalo, NY.',
      'Air-drying wings in the fridge helps crispiness.',
      'Flats vs drums, the rivalry is real.',
      'Blue cheese or ranch, choose wisely.',
      'Crispy wings usually come from dry skin and hot oil.',
    ],
    []
  );

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
  }, [loading, FUN_FACTS, initialFact]);

  useEffect(() => {
    let mounted = true;
  
    (async () => {
      try {
        setLoading(true);
        const start = Date.now();
  
        const { title, stops, travelMode } = await fetchRouteStops(PREVIEW_ROUTE_ID);
  
        const elapsed = Date.now() - start;
        const remaining = Math.max(0, 100 - elapsed);
        if (remaining) await new Promise((r) => setTimeout(r, remaining));
  
        if (!mounted) return;
  
        setRouteMeta({ title, stops, travelMode });
      } catch (e) {
        Alert.alert('Preview error', e?.message ?? String(e));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
 
    return () => {
      mounted = false;
    };
  }, []);

  // Preview rules
  const totalStops = routeMeta.stops?.length ?? 0;

  // For preview we keep it simple:
  // Start is rated
  // Stop 1 is current
  // Stops 2+ are locked
  const stopRows = useMemo(() => {
    const stops = routeMeta.stops || [];
    return stops.map((s) => {
      const state = s.ord === 1 ? 'current' : 'locked';
      return { ...s, state, rated: false, score: null };
    });
  }, [routeMeta.stops]);

  const boardStops = useMemo(() => {
    const startTile = {
      ord: 0,
      id: 'start',
      name: 'Start',
      state: 'rated',
      isStart: true,
      subtitle: routeMeta.title || 'Crawl preview',
    };

    return [startTile, ...(stopRows || [])];
  }, [stopRows, routeMeta.title]);

    const onNext = () => {
    const target = toStr(nextPath) || '/onboarding';
    const paramsStr = toStr(nextParams);

    if (paramsStr) {
      try {
        const parsed = JSON.parse(paramsStr);
        router.replace({ pathname: target, params: parsed });
        return;
      } catch {}
    }

    router.replace(target);
  };

  return (
    <View style={{ flex: 1 }}>
      <ImageBackground source={CRAWL_BG} resizeMode="cover" style={{ flex: 1 }}>
        <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }} />
        </View>

        {/* Header pill */}
        <View style={[styles.boardHeader, { top: insets.top + 6 }]}>
            <View style={styles.headerCenter} pointerEvents="none">
              <Text style={styles.boardTitle} numberOfLines={1}>
                Crawl Preview
              </Text>
              <Text style={styles.boardSub} numberOfLines={1}>
                Tap Next to continue
              </Text>
            </View>

            <View style={styles.headerBackSpacer} />

        </View>

        {/* Loader overlay */}
        {loading ? (
          <View style={styles.loadingOverlay}>
            <View style={styles.loadingCard}>
              <ActivityIndicator />
              <Text style={{ marginTop: 12, fontWeight: '900', textAlign: 'center' }}>
                Setting up your preview…
              </Text>

              <View style={{ marginTop: 12, width: 220 }}>
                <ProgressBar indeterminate />
              </View>

              <Text style={{ marginTop: 14, opacity: 0.85, textAlign: 'center' }}>
                {fact}
              </Text>
            </View>
          </View>
        ) : null}

        {/* Board */}
        <View style={styles.boardWrap}>
          <View style={styles.noticeCard}>
            <Text style={styles.noticeTitle}>This is a preview</Text>
            <Text style={styles.noticeBody}>
              You cannot rate here. This is just a preview of what your crawl will look like!
            </Text>
          </View>

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
                <StepTilePreview
                  key={t.id}
                  ord={t.ord}
                  name={t.name}
                  state={t.state}
                  subtitle={t.subtitle}
                  score={t.score}
                  isStart={!!t.isStart}
                  showWingUser={t.ord === 1}
                  unlockHint={
                    t.state === 'locked' && t.ord > 1 ? `Complete Stop ${t.ord - 1} to unlock` : null
                  }
                />
              ))}
            </View>
          </View>

          <View style={{ height: 16 }} />

          <Button
            mode="contained"
            onPress={onNext}
            style={styles.nextBtn}
            contentStyle={{ paddingVertical: 10 }}
            labelStyle={{ fontSize: 16, fontWeight: '900' }}
          >
            Next
          </Button>

          <Text style={styles.previewMeta}>{totalStops ? ` • Stops: ${totalStops}` : ''}</Text>
        </View>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
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

  headerBackBtnDisabled: {
    width: 34,
    height: 38,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },

  headerCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },

  headerBackSpacer: {
    width: 38,
    height: 38,
  },

  boardTitle: {
    fontWeight: '900',
    fontSize: 16,
    color: '#fff',
    letterSpacing: 0.2,
    textAlign: 'center',
  },

  boardSub: {
    marginTop: 2,
    fontSize: 12,
    opacity: 0.85,
    color: '#fff',
  },

  boardWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 110,
  },

  noticeCard: {
    width: '100%',
    maxWidth: 520,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    marginBottom: 14,
  },

  noticeTitle: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 14,
    textAlign: 'center',
  },

  noticeBody: {
    color: '#fff',
    opacity: 0.85,
    marginTop: 6,
    textAlign: 'center',
    lineHeight: 18,
    fontSize: 12,
  },

  boardPanel: {
    paddingVertical: 18,
    paddingHorizontal: 18,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    width: '100%',
    maxWidth: 520,
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

  tileShell: {
    position: 'relative',
  },

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

  stepTileHint: {
    color: 'rgba(255,255,255,0.92)',
    marginTop: 4,
    fontSize: 12,
    fontWeight: '800',
    opacity: 0.95,
  },

  stepTileShadowBase: {
    marginTop: 10,
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.35)',
    transform: [{ skewX: '6deg' }],
  },

  wingUser: {
    position: 'absolute',
    right: -6,
    bottom: -8,
    width: 74,
    height: 74,
    opacity: 1,
  },

  nextBtn: {
    borderRadius: 18,
    minWidth: 260,
    backgroundColor: '#FF6F00',
    alignSelf: 'center',
  },

  previewMeta: {
    marginTop: 10,
    color: '#fff',
    opacity: 0.65,
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
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
});