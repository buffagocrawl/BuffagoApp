// app/profile/history/index.jsx
import React, { useEffect, useState } from 'react';
import { View, FlatList, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator, Card, Text, Button } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase.js'; // ✅ two levels up from this file

function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return '—';
  }
}

export default function HistoryIndex() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [rows, setRows] = useState([]); // [{crawl_id, status, start_time, end_time, route_title}]

  useEffect(() => {
    let alive = true;

    const boot = async () => {
      const { data } = await supabase.auth.getSession();
      if (!alive) return;
      const sess = data?.session ?? null;
      setSession(sess);

      if (!sess?.user?.id) {
        setRows([]);
        setLoading(false);
        return;
      }

      // fetch crawls for this user; join routes for title
      const { data: crawls, error } = await supabase
        .from('crawls')
        .select(`
          crawl_id,
          status,
          start_time,
          end_time,
          routes:route_id ( title )
        `)
        .eq('user_id', sess.user.id)
        .order('start_time', { ascending: false });

      if (!alive) return;

      if (error) {
        console.warn('history fetch error', error.message);
        setRows([]);
      } else {
        const mapped = (crawls || []).map(c => ({
          crawl_id: c.crawl_id,
          status: c.status,
          start_time: c.start_time,
          end_time: c.end_time,
          route_title: c.routes?.title ?? 'Route',
        }));
        setRows(mapped);
      }
      setLoading(false);
    };

    boot();

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s ?? null));
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  if (!session?.user?.id) {
    return (
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.center}>
          <Text style={{ marginBottom: 8 }}>Please sign in to see your history.</Text>
          <Button mode="contained" onPress={() => router.push('/auth/login')}>Sign in</Button>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View style={styles.header}>
        <Text variant="headlineSmall" style={styles.title}>Your Crawl History</Text>
        <Text variant="bodySmall" style={{ opacity: 0.7 }}>
          Tap a crawl to view your details and ratings.
        </Text>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator /></View>
      ) : rows.length === 0 ? (
        <View style={styles.center}><Text>No crawls yet.</Text></View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(it) => String(it.crawl_id)}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          renderItem={({ item }) => (
            <Card
              style={styles.card}
              mode="elevated"
              onPress={() => router.push('/profile/history')}
            >
              <Card.Content>
                <Text variant="titleMedium" style={{ fontWeight: '700' }}>
                  {item.route_title}
                </Text>
                <Text variant="bodySmall" style={{ opacity: 0.75 }}>
                  Started: {fmtDate(item.start_time)}
                </Text>
                <Text variant="bodySmall" style={{ opacity: 0.75 }}>
                  {item.end_time ? `Ended: ${fmtDate(item.end_time)}` : 'In progress'}
                </Text>
                <Text variant="bodySmall" style={{ marginTop: 4 }}>
                  Status: {item.status}
                </Text>
              </Card.Content>
            </Card>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  title: { fontWeight: '800' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: 14},
});
