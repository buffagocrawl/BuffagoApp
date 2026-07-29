import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator, Button, Card, IconButton, Text, useTheme } from 'react-native-paper';
import { useFocusEffect, useRouter } from 'expo-router';
import ScreenHeader from '../../../components/ScreenHeader';
import SubmissionStatusChip from '../../../components/creator/SubmissionStatusChip';
import { loadMyWingShotHistory } from '../../../lib/wingCreator';
import { formatWingShotRejectionReason } from '../../../lib/wingShotCopy';
import { supabase } from '../../../lib/supabase';

function formatDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime())
    ? date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
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
    if (append) setLoadingMore(true);
    else setLoading(true);
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

  useFocusEffect(useCallback(() => {
    if (signedIn) load({ append: false });
    // Refresh on focus without changing the existing data source or status logic.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn]));

  const refresh = useCallback(() => {
    setRefreshing(true);
    load({ append: false });
  }, [load]);

  const header = (
    <ScreenHeader
      leftContent={<IconButton icon="arrow-left" onPress={() => router.back()} accessibilityLabel="Back to Wing Creator" />}
      title="Wing Shot History"
      subtitle="Your private submission history"
    />
  );

  if (!authReady || (signedIn && loading && rows.length === 0)) {
    return <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]} edges={['top', 'bottom']}>
      {header}
      <View testID="creator.history.loading" style={styles.center}><ActivityIndicator /><Text style={styles.loadingText}>Loading your Wing Shots…</Text></View>
    </SafeAreaView>;
  }

  if (!signedIn) {
    return <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]} edges={['top', 'bottom']}>
      {header}
      <View testID="creator.history.signed-out" style={styles.center}>
        <Text style={styles.signedOutText}>Sign in to see your Wing Shot history.</Text>
        <Button mode="contained" onPress={() => router.push('/auth/login')}>Sign In</Button>
      </View>
    </SafeAreaView>;
  }

  return <SafeAreaView testID="creator.history" style={[styles.safe, { backgroundColor: theme.colors.background }]} edges={['top', 'bottom']}>
    {header}
    <FlatList
      data={rows}
      keyExtractor={(item) => item.submission_id}
      contentContainerStyle={styles.list}
      refreshing={refreshing}
      onRefresh={refresh}
      keyboardShouldPersistTaps="handled"
      ListEmptyComponent={error ? (
        <View testID="creator.history.error" style={styles.centerBlock}><Text style={{ color: theme.colors.error, textAlign: 'center' }}>{error}</Text><Button onPress={() => load({ append: false })}>Retry</Button></View>
      ) : (
        <View testID="creator.history.empty" style={styles.centerBlock}><Text variant="titleMedium" style={styles.emptyTitle}>No Wing Shots yet</Text><Text style={styles.emptyBody}>You can optionally share a photo or short video from any restaurant.</Text></View>
      )}
      renderItem={({ item, index }) => (
        <Card
          testID={index === 0 ? 'creator.history.first-item' : undefined}
          mode="elevated"
          style={styles.card}
          onPress={() => router.push(`/profile/wing-shots/${item.submission_id}`)}
          accessibilityLabel={`${mediaLabel(item.media_type)}, ${item.display_status}, submitted ${formatDate(item.created_at)}`}
          accessibilityHint="Opens Wing Shot details"
        >
          <Card.Content style={styles.cardContent}>
            <View style={styles.row}>
              <View style={styles.titleBlock}><Text variant="titleMedium" style={styles.itemTitle}>{mediaLabel(item.media_type)}</Text><Text variant="bodySmall" style={styles.muted}>Submitted {formatDate(item.created_at)}</Text></View>
              <SubmissionStatusChip status={item.display_status} />
            </View>
            {item.display_status === 'Rejected' && item.rejection_category ? <Text variant="bodySmall" style={styles.rejection}>{formatWingShotRejectionReason(item.rejection_category)}</Text> : null}
          </Card.Content>
        </Card>
      )}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      ListFooterComponent={hasMore ? <Button testID="creator.history.load-more" mode="text" loading={loadingMore} disabled={loadingMore} onPress={() => load({ append: true })} style={styles.loadMore}>Load More</Button> : <View style={styles.footerSpace} />}
    />
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  list: { padding: 16, paddingTop: 8, paddingBottom: 32 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  centerBlock: { alignItems: 'center', padding: 28, gap: 8 },
  loadingText: { marginTop: 10, opacity: 0.72 },
  signedOutText: { textAlign: 'center', marginBottom: 14 },
  emptyTitle: { fontWeight: '800' },
  emptyBody: { opacity: 0.75, textAlign: 'center', lineHeight: 20 },
  card: { borderRadius: 14 },
  cardContent: { gap: 7, paddingVertical: 12 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  titleBlock: { flex: 1, minWidth: 0 },
  itemTitle: { fontWeight: '750' },
  muted: { opacity: 0.68, marginTop: 2 },
  rejection: { opacity: 0.82, lineHeight: 19 },
  separator: { height: 8 },
  loadMore: { marginTop: 12, minHeight: 44 },
  footerSpace: { height: 12 },
});
