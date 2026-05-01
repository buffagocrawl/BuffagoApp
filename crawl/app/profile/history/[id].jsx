// app/profile/history/[id].jsx
import React, { useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ActivityIndicator, Card, Text, Divider, Button, useTheme } from 'react-native-paper';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../../lib/supabase.js';

// helpers
const toStr = (v) => (Array.isArray(v) ? v[0] : v) ?? undefined;
const fmtDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  try {
    return isNaN(d.getTime()) ? '—' : d.toLocaleString();
  } catch {
    return '—';
  }
};

export default function CrawlDetail() {
  const theme = useTheme();
  const cardBg = theme.colors.elevation?.level2 ?? theme.colors.surface;
  const outline = theme.colors.outlineVariant ?? theme.colors.outline;

  const router = useRouter();
  const params = useLocalSearchParams();
  const crawlId = toStr(params?.id ?? params?.crawlId ?? params?.routeId);

  const [loading, setLoading] = useState(true);
  const [crawl, setCrawl] = useState(null);
  const [rows, setRows] = useState([]);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);

        if (!crawlId) {
          if (alive) {
            setCrawl(null);
            setRows([]);
          }
          return;
        }

        // header
        const { data: c, error: e1 } = await supabase
          .from('crawls')
          .select('crawl_id, start_time, end_time, route_id, status')
          .eq('crawl_id', crawlId)
          .maybeSingle();

        if (e1) throw e1;

        // ratings
        const { data: ratings, error: e2 } = await supabase
          .from('destination_ratings')
          .select(`
            destination_id, crispiness, sauce, meat, overall, weight_score, created_at,
            destinations!destination_ratings_destination_id_fkey ( name, address )
          `)
          .eq('crawl_id', crawlId);

        if (e2) throw e2;

        if (!alive) return;
        setCrawl(c ?? null);
        setRows(Array.isArray(ratings) ? ratings : []);
      } catch (e) {
        console.warn('CrawlDetail error:', e?.message || e);
        if (alive) {
          setCrawl(null);
          setRows([]);
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [crawlId]);

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      </SafeAreaView>
    );
  }

  if (!crawlId) {
    return (
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.topBar}>
          <Pressable
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace('/profile/history');
            }}
            hitSlop={10}
            style={styles.backBtn}
          >
            <MaterialCommunityIcons
              name="arrow-left"
              size={26}
              color={theme.colors.primary}
            />
          </Pressable>
        </View>

        <View style={styles.center}>
          <Text>Missing crawl id.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      {/* Top bar back arrow */}
      <View style={styles.topBar}>
        <Pressable
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/profile/history');
          }}
          hitSlop={10}
          style={styles.backBtn}
        >
          <MaterialCommunityIcons
            name="arrow-left"
            size={26}
            color={theme.colors.primary}
          />
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator
      >
        <Card style={[styles.card, { backgroundColor: cardBg }]} mode="elevated">
          <Card.Content>
            <Text variant="titleMedium" style={styles.title}>
              {crawl ? `Crawl #${crawl.crawl_id}` : 'Crawl not found'}
            </Text>

            {crawl && (
              <>
                <Text style={styles.muted}>
                  {fmtDate(crawl.start_time)}
                  {crawl.end_time ? `  •  Ended ${fmtDate(crawl.end_time)}` : ''}
                </Text>

                <Text style={[styles.badge, styles.status]}>
                  {(crawl.status ?? 'unknown')?.toString()}
                </Text>

                {(!crawl.end_time &&
                  (crawl.status === 'in_progress' || crawl.status === 'started')) && (
                  <Button
                    mode="contained"
                    style={{ marginTop: 10, borderRadius: 10 }}
                    onPress={() => router.push(`/crawl/${crawl.crawl_id}?resume=1`)}
                  >
                    Resume crawl
                  </Button>
                )}
              </>
            )}
          </Card.Content>
        </Card>

        <Divider
          style={{
            marginVertical: 12,
            backgroundColor: outline,
            height: StyleSheet.hairlineWidth,
          }}
        />

        {rows.map((r, i) => (
          <Card
            key={`${r.destination_id ?? 'dest'}-${i}`}
            style={[styles.card, { backgroundColor: cardBg }]}
            mode="elevated"
          >
            <Card.Content>
              <Text variant="titleMedium" style={styles.stopName}>
                {r.destinations?.name ?? 'Destination'}
              </Text>

              {!!r.destinations?.address && (
                <Text style={styles.muted}>{r.destinations.address}</Text>
              )}

              <View style={styles.metricsRow}>
                <Metric label="Crisp" value={r.crispiness} />
                <Metric label="Sauce" value={r.sauce} />
                <Metric label="Chicken Quality" value={r.meat} />
                <Metric label="Experience" value={r.overall} />
                <Metric label="Score" value={r.weight_score} bold />
              </View>

              <Text style={styles.smallMuted}>Rated {fmtDate(r.created_at)}</Text>
            </Card.Content>
          </Card>
        ))}

        {rows.length === 0 && (
          <View style={styles.center}>
            <Text>No ratings saved for this crawl.</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Metric({ label, value, bold }) {
  const num = Number(value);
  const show = Number.isFinite(num) ? num.toFixed(1) : '—';

  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={[styles.metricLabel, bold && { fontWeight: '800' }]}>
        {label}
      </Text>
      <Text style={[styles.metricVal, bold && { fontWeight: '900' }]}>
        {show}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 2,
  },
  backBtn: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    padding: 6,
  },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: 14, marginBottom: 10 },
  title: { fontWeight: '800' },
  stopName: { fontWeight: '700' },
  muted: { opacity: 0.7, marginTop: 2 },
  smallMuted: { opacity: 0.6, marginTop: 8, fontSize: 12 },
  badge: { marginTop: 6 },
  status: { textTransform: 'capitalize', fontWeight: '700' },
  metricsRow: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metricLabel: { fontSize: 12, opacity: 0.7 },
  metricVal: { fontSize: 16, fontWeight: '700' },
});
