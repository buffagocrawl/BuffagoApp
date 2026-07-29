import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator, Button, Card, Text, useTheme } from 'react-native-paper';
import { useFocusEffect, useRouter } from 'expo-router';
import ScreenHeader from '../../../components/ScreenHeader';
import SubmissionStatusChip from '../../../components/creator/SubmissionStatusChip';
import { formatWingShotRejectionReason } from '../../../lib/wingShotRejection';
import WingCreatorSummaryCard from '../../../components/creator/WingCreatorSummaryCard';
import { loadMyWingShotHistory } from '../../../lib/wingCreator';
import { supabase } from '../../../lib/supabase';

function formatDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime())
    ? date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : 'Date unavailable';
}

function mediaLabel(type) {
  return type === 'video' ? 'Video Wing Shot' : 'Photo Wing Shot';
}

export default function WingShotHistoryScreen() {
  const router = useRouter();
  const theme = useTheme();
  const [authReady, setAuthReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSignedIn(Boolean(data?.session?.user?.id));
      setAuthReady(true);
    });
    const { data: authSubscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setSignedIn(Boolean(session?.user?.id));
      setAuthReady(true);
    });
    return () => {
      active = false;
      authSubscription?.subscription?.unsubscribe?.();
    };
  }, []);

  const load = useCallback(async ({ append = false } = {}) => {
    if (!signedIn) {
      setLoading(false);
      return;
    }
    append ? setLoadingMore(true) : setLoading(true);
    setError(null);
    try {
      const before = append && rows.length ? rows[rows.length - 1].created_at : null;
      const nextRows = await loadMyWingShotHistory({ before });
      setRows((current) => {
        if (!append) return nextRows;
        const existing = new Set(current.map((row) => row.submission_id));
        return [...current, ...nextRows.filter((row) => !existing.has(row.submission_id))];
      });
      setHasMore(nextRows.length === 25);
    } catch (loadError) {
      setError(loadError?.message || 'Could not load Wing Shot history.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  }, [rows, signedIn]);

  useFocusEffect(
    useCallback(() => {
      if (signedIn) {
        load({ append: false });
        setRefreshKey((value) => value + 1);
      }
      return undefined;
      // `load` intentionally refreshes from current auth state on focus.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [signedIn])
  );

  const refresh = useCallback(() => {
    setRefreshing(true);
    setRefreshKey((value) => value + 1);
    load({ append: false });
  }, [load]);

  if (!authReady || (signedIn && loading && rows.length === 0)) {
    return (
      <SafeAreaView
        testID="creator.history.loading"
        style={[styles.safe, { backgroundColor: theme.colors.background }]}
      >
        <View style={styles.center}>
          <ActivityIndicator />
          <Text style={styles.loadingText}>Loading your Wing Shots…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!signedIn) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]}>
        <ScreenHeader title="Wing Shot History" subtitle="Your private submissions and Creator progress" />
        <View testID="creator.history.signed-out" style={styles.center}>
          <Text style={styles.signedOutText}>Sign in to see your Wing Shot history.</Text>
          <Button mode="contained" onPress={() => router.push('/auth/login')}>
            Sign In
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      testID="creator.history"
      style={[styles.safe, { backgroundColor: theme.colors.background }]}
      edges={['top']}
    >
      <ScreenHeader
        title="Your Wing Shots"
        subtitle="Private submission history and Creator progress"
      />
      <FlatList
        data={rows}
        keyExtractor={(item) => item.submission_id}
        contentContainerStyle={styles.list}
        refreshing={refreshing}
        onRefresh={refresh}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={<WingCreatorSummaryCard refreshKey={refreshKey} />}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListEmptyComponent={
          error ? (
            <View testID="creator.history.error" style={styles.centerBlock}>
              <Text style={{ color: theme.colors.error, textAlign: 'center' }}>{error}</Text>
              <Button onPress={() => load({ append: false })}>Retry</Button>
            </View>
          ) : (
            <View testID="creator.history.empty" style={styles.centerBlock}>
              <Text variant="titleMedium" style={styles.emptyTitle}>
                No Wing Shots yet
              </Text>
              <Text style={styles.emptyBody}>
                You can optionally share a photo or short video from any restaurant.
              </Text>
            </View>
          )
        }
        renderItem={({ item, index }) => (
          <Card
            testID={index === 0 ? 'creator.history.first-item' : undefined}
            mode="elevated"
            style={styles.card}
            onPress={() => router.push(`/profile/wing-shots/${item.submission_id}`)}
            accessibilityLabel={`${mediaLabel(item.media_type)}, ${item.display_status}, submitted ${formatDate(
              item.created_at
            )}`}
            accessibilityHint="Opens Wing Shot details"
          >
            <Card.Content style={styles.cardContent}>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text variant="titleMedium" style={styles.itemTitle}>
                    {mediaLabel(item.media_type)}
                  </Text>
                  <Text variant="bodySmall" style={styles.muted}>
                    Submitted {formatDate(item.created_at)}
                  </Text>
                </View>
                <SubmissionStatusChip status={item.display_status} />
              </View>
              {item.display_status === 'Rejected' && item.rejection_category ? (
                <Text variant="bodySmall" style={styles.rejection}>
                  {formatWingShotRejectionReason(item.rejection_category)}
                </Text>
              ) : null}
            </Card.Content>
          </Card>
        )}
        ListFooterComponent={
          hasMore ? (
            <Button
              testID="creator.history.load-more"
              mode="text"
              loading={loadingMore}
              disabled={loadingMore}
              onPress={() => load({ append: true })}
              style={styles.loadMore}
            >
              Load More
            </Button>
          ) : (
            <View style={{ height: 16 }} />
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  list: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  centerBlock: { alignItems: 'center', padding: 28, gap: 8 },
  loadingText: { marginTop: 10, opacity: 0.72 },
  signedOutText: { textAlign: 'center', marginBottom: 14 },
  emptyTitle: { fontWeight: '800' },
  emptyBody: { opacity: 0.75, textAlign: 'center', lineHeight: 20 },
  card: { borderRadius: 16 },
  cardContent: { gap: 9 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' },
  itemTitle: { fontWeight: '750' },
  muted: { opacity: 0.68, marginTop: 3 },
  rejection: { opacity: 0.82 },
  loadMore: { marginTop: 14, minHeight: 48 },
});

