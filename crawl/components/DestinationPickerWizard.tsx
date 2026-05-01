// components/DestinationPickerWizard.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, ScrollView  } from 'react-native';
import { Dialog, Portal, Text, Button, ActivityIndicator, Chip, useTheme } from 'react-native-paper';
import { supabase } from '../lib/supabase';

type Coords = { latitude: number; longitude: number } | null;

export type WizardDestination = {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  lat?: number | null;
  lng?: number | null;

  // UI distance should always be based on the user location when available
  distanceM?: number | null;

  avgScore?: number | null;
  ratingsCount?: number | null;
};

type Props = {
  visible: boolean;
  onDismiss: () => void;

  // If user says "I know what I want", you already have a search dialog on Home.
  onOpenSearch: () => void;

  // Search center. Usually from Home getBasisCoords() which respects searchOverride or GPS.
  basisCoords: Coords;

  // NEW: user live location. Used only for displayed distance.
  // If not provided, we fall back to basisCoords so wizard still works.
  userCoords?: Coords;

  // Called when user confirms a suggestion.
  onApplyDestination: (dest: WizardDestination) => void;

  // Optional tuning
  maxDestinationsInPool?: number; // default 1500
  maxRatingsRows?: number; // default 20000
};

const metersToMiles = (m: number | null | undefined) =>
  Number.isFinite(Number(m)) ? Number(m) / 1609.34 : null;

// Haversine distance in meters
const haversine = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371e3;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const milesToDegLat = (m: number) => m / 69.0;
const milesToDegLng = (m: number, lat: number) => m / (69.0 * Math.cos((lat * Math.PI) / 180));

const RADIUS_OPTIONS: Array<{ label: string; value: number | 'all' }> = [
  { label: '5 mi', value: 5 },
  { label: '10 mi', value: 10 },
  { label: '25 mi', value: 25 },
  { label: '50 mi', value: 50 },
  { label: '100 mi', value: 100 },
  { label: '250 mi', value: 250 },
  { label: 'No Limits for Good Wings!!', value: 'all' },
];

type WizardMode = 'unknown' | 'search' | 'suggest';

type TagRow = {
  id: number;
  tag: string;
  count: number;
};

type PoolRow = WizardDestination & {
  tagSet: Set<number>;
  avgScore: number;
  ratingsCount: number;

  // Used for internal sorting and filtering, always based on basisCoords
  _pickDistanceM?: number | null;
};

export default function DestinationPickerWizard({
  visible,
  onDismiss,
  onOpenSearch,
  basisCoords,
  userCoords = null,
  onApplyDestination,
  maxDestinationsInPool = 1500,
  maxRatingsRows = 20000,
}: Props) {
  const { colors, dark } = useTheme();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [mode, setMode] = useState<WizardMode>('unknown');

  const [radius, setRadius] = useState<number | 'all' | null>(null);

  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string>('');

  const [pool, setPool] = useState<PoolRow[]>([]);
  const [tags, setTags] = useState<TagRow[]>([]);
  const [selectedTagId, setSelectedTagId] = useState<number | 'best' | null>(null);

  const [filteredPool, setFilteredPool] = useState<PoolRow[]>([]);
  const [idx, setIdx] = useState(0);

  // Used to cancel stale async calls
  const reqIdRef = useRef(0);

  const canUseBasis = !!basisCoords?.latitude && !!basisCoords?.longitude;

  const resetAll = useCallback(() => {
    setStep(1);
    setMode('unknown');
    setRadius(null);
    setLoading(false);
    setErrorText('');
    setPool([]);
    setTags([]);
    setSelectedTagId(null);
    setFilteredPool([]);
    setIdx(0);
  }, []);

  useEffect(() => {
    if (visible) resetAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const titleForStep = useMemo(() => {
    if (step === 1) return 'Find Wings';
    if (step === 2 && mode === 'suggest') return 'How far do you want to travel?';
    if (step === 3) return 'What are you in the mood for';
    if (step === 4) return 'Our pick';
    return 'Find Wings';
  }, [step, mode]);

  const stepLabel = useMemo(() => `Step ${step} of 4`, [step]);

  const baseBg = useMemo(() => (dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'), [dark]);

  const buildPool = useCallback(
    async (radiusMiles: number | 'all') => {
      if (!canUseBasis) {
        return { pool: [] as PoolRow[], tagCounts: new Map<number, number>() };
      }

      const lat0 = Number(basisCoords!.latitude);
      const lng0 = Number(basisCoords!.longitude);

      const uLat = userCoords?.latitude != null ? Number(userCoords.latitude) : null;
      const uLng = userCoords?.longitude != null ? Number(userCoords.longitude) : null;
      const hasUser = Number.isFinite(uLat) && Number.isFinite(uLng);

      const currentReq = ++reqIdRef.current;

      setLoading(true);
      setErrorText('');

      try {
        // 1) Destinations in bounding box (plus optional strict radius filter)
        let destRows: Array<{
          id: string;
          name: string | null;
          address: string | null;
          city: string | null;
          lat: number | null;
          lng: number | null;
        }> = [];

        if (radiusMiles === 'all') {
          const { data, error } = await supabase
            .from('destinations')
            .select('id, name, address, city, lat, lng')
            .not('lat', 'is', null)
            .not('lng', 'is', null)
            .limit(Math.min(maxDestinationsInPool, 600));

          if (currentReq !== reqIdRef.current) return { pool: [], tagCounts: new Map() };
          if (error) throw error;
          destRows = (data as any) || [];
        } else {
          const dLat = milesToDegLat(radiusMiles);
          const dLng = milesToDegLng(radiusMiles, lat0);

          const { data, error } = await supabase
            .from('destinations')
            .select('id, name, address, city, lat, lng')
            .gte('lat', lat0 - dLat)
            .lte('lat', lat0 + dLat)
            .gte('lng', lng0 - dLng)
            .lte('lng', lng0 + dLng)
            .not('lat', 'is', null)
            .not('lng', 'is', null)
            .limit(maxDestinationsInPool);

          if (currentReq !== reqIdRef.current) return { pool: [], tagCounts: new Map() };
          if (error) throw error;
          destRows = (data as any) || [];

          // Strict filter by real distance from basis center
          const radiusM = Number(radiusMiles) * 1609.34;
          destRows = destRows.filter((d) => {
            if (d.lat == null || d.lng == null) return false;
            const distM = haversine(lat0, lng0, Number(d.lat), Number(d.lng));
            return distM <= radiusM;
          });
        }

        if (!destRows.length) {
          return { pool: [], tagCounts: new Map<number, number>() };
        }

        // 2) Pull ratings for those destination ids
        const destIds = destRows.map((d) => d.id);

        const { data: ratings, error: rErr } = await supabase
          .from('destination_ratings')
          .select('destination_id, weight_score, tag_id')
          .in('destination_id', destIds)
          .limit(maxRatingsRows);

        if (currentReq !== reqIdRef.current) return { pool: [], tagCounts: new Map() };
        if (rErr) throw rErr;

        // 3) Aggregate
        const agg = new Map<string, { sum: number; count: number; tagSet: Set<number> }>();
        const tagCounts = new Map<number, number>();

        for (const r of (ratings as any[]) || []) {
          const did = r?.destination_id as string | undefined;
          if (!did) continue;

          const w = Number(r?.weight_score);
          if (!Number.isFinite(w)) continue;

          const entry = agg.get(did) || { sum: 0, count: 0, tagSet: new Set<number>() };
          entry.sum += w;
          entry.count += 1;

          const tid = r?.tag_id;
          if (tid != null) {
            const tNum = Number(tid);
            if (Number.isFinite(tNum)) {
              entry.tagSet.add(tNum);
              tagCounts.set(tNum, (tagCounts.get(tNum) || 0) + 1);
            }
          }

          agg.set(did, entry);
        }

        // 4) Build pool rows, only include destinations with at least 1 rating
        const list: PoolRow[] = destRows
          .map((d) => {
            const a = agg.get(d.id);
            if (!a || a.count < 1) return null;

            const dLat = d.lat != null ? Number(d.lat) : null;
            const dLng = d.lng != null ? Number(d.lng) : null;
            const hasDest = Number.isFinite(dLat) && Number.isFinite(dLng);

            const pickDistM = hasDest ? haversine(lat0, lng0, Number(dLat), Number(dLng)) : null;

            // Display distance always uses user location when available
            const displayDistM =
              hasUser && hasDest
                ? haversine(Number(uLat), Number(uLng), Number(dLat), Number(dLng))
                : hasDest
                  ? pickDistM
                  : null;

            return {
              id: d.id,
              name: (d.name || 'Wing Spot').trim(),
              address: d.address,
              city: d.city,
              lat: d.lat,
              lng: d.lng,
              distanceM: displayDistM,
              _pickDistanceM: pickDistM,
              avgScore: a.sum / a.count,
              ratingsCount: a.count,
              tagSet: a.tagSet,
            };
          })
          .filter(Boolean as any)
          .sort((a, b) => {
            // keep "best wings" behavior first
            const scoreDiff = b.avgScore - a.avgScore;
            if (scoreDiff !== 0) return scoreDiff;

            // tie breaker: closer to the basis search center
            const ad = a._pickDistanceM ?? Number.POSITIVE_INFINITY;
            const bd = b._pickDistanceM ?? Number.POSITIVE_INFINITY;
            return ad - bd;
          });

        return { pool: list, tagCounts };
      } finally {
        // Only end loading if this request is still the latest
        if (currentReq === reqIdRef.current) setLoading(false);
      }
    },
    [basisCoords, userCoords, canUseBasis, maxDestinationsInPool, maxRatingsRows]
  );

  const loadTags = useCallback(async (tagCounts: Map<number, number>) => {
    const currentReq = ++reqIdRef.current;
    setLoading(true);
    setErrorText('');

    try {
      const topIds = Array.from(tagCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 14)
        .map(([id]) => id);

      if (!topIds.length) return [] as TagRow[];

      const { data, error } = await supabase.from('destination_tags').select('id, tag').in('id', topIds);

      if (currentReq !== reqIdRef.current) return [] as TagRow[];
      if (error) throw error;

      const labelById = new Map<number, string>();
      for (const t of (data as any[]) || []) {
        const id = Number(t?.id);
        const tag = String(t?.tag || '').trim();
        if (Number.isFinite(id) && tag) labelById.set(id, tag);
      }

      const rows: TagRow[] = topIds
        .map((id) => ({
          id,
          tag: labelById.get(id) || '',
          count: tagCounts.get(id) || 0,
        }))
        .filter((r) => r.tag);

      return rows;
    } finally {
      if (currentReq === reqIdRef.current) setLoading(false);
    }
  }, []);

  const beginSuggestFlow = useCallback(async () => {
    setMode('suggest');
    setStep(2);
  }, []);

  const onPickRadius = useCallback(
    async (r: number | 'all') => {
      setRadius(r);
      setSelectedTagId(null);
      setTags([]);
      setPool([]);
      setFilteredPool([]);
      setIdx(0);

      const { pool: built, tagCounts } = await buildPool(r);

      if (!built.length) {
        setErrorText('Sorry. We do not have any wing places yet in that area. Try expanding your radius.');
        return;
      }

      setPool(built);

      // Tags are optional. If we find none, still allow best wings path.
      const t = await loadTags(tagCounts);
      setTags(t);

      setStep(3);
    },
    [buildPool, loadTags]
  );

  const applyMoodAndProceed = useCallback(
    (tagId: number | 'best') => {
      setSelectedTagId(tagId);
      setIdx(0);

      if (!pool.length) {
        setFilteredPool([]);
        setStep(4);
        return;
      }

      if (tagId === 'best') {
        setFilteredPool(pool);
        setStep(4);
        return;
      }

      const filtered = pool.filter((d) => d.tagSet?.has?.(tagId));
      setFilteredPool(filtered.length ? filtered : pool);
      setStep(4);
    },
    [pool]
  );

  const currentSuggestion = useMemo(() => {
    const list = filteredPool.length ? filteredPool : pool;
    if (!list.length) return null;
    return list[Math.max(0, Math.min(idx, list.length - 1))] || null;
  }, [filteredPool, pool, idx]);

  const onRejectSuggestion = useCallback(() => {
    const list = filteredPool.length ? filteredPool : pool;
    if (!list.length) return;

    if (idx + 1 >= list.length) {
      setErrorText('That is everything we have for that filter. Try a bigger radius.');
      setStep(2);
      return;
    }
    setIdx((i) => i + 1);
  }, [filteredPool, pool, idx]);

  const onAcceptSuggestion = useCallback(() => {
    if (!currentSuggestion) return;

    onApplyDestination({
      id: currentSuggestion.id,
      name: currentSuggestion.name,
      address: currentSuggestion.address ?? null,
      city: currentSuggestion.city ?? null,
      lat: currentSuggestion.lat ?? null,
      lng: currentSuggestion.lng ?? null,
      distanceM: currentSuggestion.distanceM ?? null,
      avgScore: currentSuggestion.avgScore ?? null,
      ratingsCount: currentSuggestion.ratingsCount ?? null,
    });
  }, [currentSuggestion, onApplyDestination]);

  const onBack = useCallback(() => {
    setErrorText('');

    if (step === 1) return;

    if (step === 2) {
      setStep(1);
      setMode('unknown');
      return;
    }

    if (step === 3) {
      setStep(2);
      setSelectedTagId(null);
      return;
    }

    if (step === 4) {
      setStep(3);
      setIdx(0);
      return;
    }
  }, [step]);

  // UI helpers
  const Card = ({ children }: { children: React.ReactNode }) => (
    <View
      style={[
        styles.card,
        {
          backgroundColor: baseBg,
          borderColor: dark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.10)',
        },
      ]}
    >
      {children}
    </View>
  );

  const BasisWarning = () => {
    if (canUseBasis) return null;
    return (
      <View style={{ paddingVertical: 8 }}>
        <Text style={{ textAlign: 'center', opacity: 0.75 }}>We need your location to suggest wings.</Text>
      </View>
    );
  };

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss} style={[styles.dialog, { backgroundColor: colors.background }]}>
        <Dialog.Title style={styles.title}>{titleForStep}</Dialog.Title>

        <Dialog.Content>
          <Text style={styles.stepLabel}>{stepLabel}</Text>

          {!!errorText && (
            <View style={styles.errorWrap}>
              <Text style={styles.errorText}>{errorText}</Text>
            </View>
          )}

          {loading ? (
            <View style={{ paddingVertical: 18, alignItems: 'center' }}>
              <ActivityIndicator />
            </View>
          ) : null}

          {/* Step 1 */}
          {step === 1 ? (
            <View style={{ gap: 12 }}>
              <Card>
                <Text style={styles.prompt}>Do you know what you want, or do you want a suggestion</Text>

                <BasisWarning />

                <View style={{ height: 12 }} />

                <View style={{ gap: 10 }}>
                  <Button
                    mode="contained"
                    onPress={() => {
                      setMode('search');
                      onDismiss();
                      onOpenSearch();
                    }}
                    contentStyle={{ height: 44 }}
                    uppercase={false}
                  >
                    I know what I want
                  </Button>

                  <Button
                    mode="outlined"
                    onPress={beginSuggestFlow}
                    disabled={!canUseBasis}
                    contentStyle={{ height: 44 }}
                    uppercase={false}
                  >
                    Surprise me
                  </Button>
                </View>
              </Card>

              <Text style={styles.subtle}>Tip: suggestions use real ratings and tags from other players.</Text>
            </View>
          ) : null}

          {/* Step 2 */}
          {step === 2 && mode === 'suggest' ? (
            <View style={{ gap: 12 }}>
              <Card>
                <Text style={styles.prompt}>How far are you looking to travel</Text>

                <View style={{ height: 10 }} />

                <View style={styles.chipRow}>
                  {RADIUS_OPTIONS.map((r) => (
                    <Chip
                      key={`rad-${r.label}`}
                      selected={radius === r.value}
                      onPress={() => onPickRadius(r.value)}
                      style={styles.chip}
                      textStyle={{ fontWeight: '900' }}
                    >
                      {r.label}
                    </Chip>
                  ))}
                </View>

                <View style={{ height: 6 }} />

                <Text style={styles.subtleCenter}>If we find nothing, we will ask you to expand.</Text>
              </Card>
            </View>
          ) : null}

          {/* Step 3 */}
          {step === 3 ? (
            <View style={{ gap: 12 }}>
              <Card>
                <Text style={styles.prompt}>What are you in the mood for</Text>
                <View style={{ height: 10 }} />
                 <ScrollView
                   style={styles.tagScroll}
                   contentContainerStyle={styles.tagScrollContent}
                   showsVerticalScrollIndicator={false}
                 >
                   <View style={styles.chipRow}>
                     <Chip
                       selected={selectedTagId === 'best'}
                       onPress={() => applyMoodAndProceed('best')}
                       style={styles.chip}
                       textStyle={{ fontWeight: '900' }}
                     >
                       Best wings
                     </Chip>
 
                     {(tags || []).map((t) => (
                       <Chip
                         key={`tag-${t.id}`}
                         selected={selectedTagId === t.id}
                         onPress={() => applyMoodAndProceed(t.id)}
                         style={styles.chip}
                         textStyle={{ fontWeight: '900' }}
                       >
                         {t.tag}
                       </Chip>
                     ))}
                   </View>
                 </ScrollView>
                <View style={{ height: 6 }} />

                <Text style={styles.subtleCenter}>Tags come from what people actually picked when rating.</Text>
              </Card>
            </View>
          ) : null}

          {/* Step 4 */}
          {step === 4 ? (
            <View style={{ gap: 12 }}>
              <Card>
                {!currentSuggestion ? (
                  <Text style={{ textAlign: 'center', opacity: 0.75 }}>No suggestion available. Try a bigger radius.</Text>
                ) : (
                  <>
                    <Text style={styles.promptCenter}>We recommend</Text>

                    <Text style={styles.suggestName} numberOfLines={2}>
                      {currentSuggestion.name}
                    </Text>

                    {!!currentSuggestion.address || !!currentSuggestion.city ? (
                      <Text style={styles.suggestSub} numberOfLines={2}>
                        {(currentSuggestion.address || '').trim()}
                        {currentSuggestion.city
                          ? `${currentSuggestion.address ? ', ' : ''}${currentSuggestion.city}`
                          : ''}
                      </Text>
                    ) : null}

                    <View style={{ height: 10 }} />

                    <View style={styles.suggestMetaRow}>
                      <Text style={styles.metaLabel}>Avg</Text>
                      <Text style={styles.metaValue}>
                        {Number.isFinite(Number(currentSuggestion.avgScore))
                          ? Number(currentSuggestion.avgScore).toFixed(2)
                          : '—'}
                      </Text>

                      <View style={{ width: 14 }} />

                      <Text style={styles.metaLabel}>Ratings</Text>
                      <Text style={styles.metaValue}>{currentSuggestion.ratingsCount ?? '—'}</Text>
                    </View>

                    {currentSuggestion.distanceM != null ? (
                      <Text style={styles.distanceLine}>
                        About {(metersToMiles(currentSuggestion.distanceM) ?? 0).toFixed(1)} miles away
                      </Text>
                    ) : null}

                    <View style={{ height: 14 }} />

                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <Button
                        mode="contained"
                        onPress={onAcceptSuggestion}
                        style={{ flex: 1 }}
                        contentStyle={{ height: 44 }}
                        uppercase={false}
                      >
                        Yes!
                      </Button>

                      <Button
                        mode="outlined"
                        onPress={onRejectSuggestion}
                        style={{ flex: 1 }}
                        contentStyle={{ height: 44 }}
                        uppercase={false}
                      >
                        Next
                      </Button>
                    </View>

                    <Text style={styles.subtleCenter}>
                      {(() => {
                        const list = filteredPool.length ? filteredPool : pool;
                        const cur = Math.min(idx + 1, list.length);
                        return `Suggestion ${cur} of ${list.length}`;
                      })()}
                    </Text>
                  </>
                )}
              </Card>
            </View>
          ) : null}
        </Dialog.Content>

        <Dialog.Actions style={styles.actions}>
          <Button onPress={onBack} disabled={step === 1}>
            Back
          </Button>

          <Button onPress={onDismiss}>Close</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  dialog: {
    alignSelf: 'center',
    width: '92%',
    maxWidth: 540,
    borderRadius: 18,
  },
  title: {
    textAlign: 'center',
    fontWeight: '900',
    letterSpacing: 1,
  },
  stepLabel: {
    textAlign: 'center',
    opacity: 0.65,
    fontWeight: '800',
    marginBottom: 10,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  prompt: {
    textAlign: 'center',
    fontWeight: '900',
    fontSize: 16,
    opacity: 0.95,
  },
  promptCenter: {
    textAlign: 'center',
    fontWeight: '900',
    fontSize: 12,
    letterSpacing: 1,
    opacity: 0.75,
  },
  subtle: {
    textAlign: 'center',
    opacity: 0.65,
    fontSize: 12,
    lineHeight: 18,
  },
  subtleCenter: {
    marginTop: 10,
    textAlign: 'center',
    opacity: 0.65,
    fontSize: 12,
  },
  tagScroll: {
  maxHeight: 220, // tweak: 180–280 depending on how tall you want it
  }, 
  tagScrollContent: {
    paddingBottom: 2,
  },
  errorWrap: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,80,80,0.35)',
    backgroundColor: 'rgba(255,80,80,0.08)',
    marginBottom: 10,
  },
  errorText: {
    textAlign: 'center',
    fontWeight: '800',
    opacity: 0.9,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
  },
  chip: {
    borderRadius: 999,
  },
  suggestName: {
    marginTop: 10,
    textAlign: 'center',
    fontWeight: '900',
    fontSize: 20,
    opacity: 0.95,
  },
  suggestSub: {
    marginTop: 6,
    textAlign: 'center',
    opacity: 0.75,
    lineHeight: 18,
  },
  suggestMetaRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
  },
  metaLabel: {
    fontSize: 12,
    opacity: 0.65,
    fontWeight: '800',
  },
  metaValue: {
    marginLeft: 6,
    fontSize: 16,
    fontWeight: '900',
    opacity: 0.9,
  },
  distanceLine: {
    marginTop: 10,
    textAlign: 'center',
    opacity: 0.75,
    fontWeight: '800',
    fontSize: 12,
  },
  actions: {
    justifyContent: 'space-between',
    paddingHorizontal: 6,
  },
});