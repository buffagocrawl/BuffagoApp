import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Avatar, Button, Card, SegmentedButtons, Text, useTheme } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { loadCreatorLeaderboard, loadWingCreatorFeatureFlags } from '../../lib/wingCreator';
import { trackEvent } from '../../lib/analytics';

export default function CreatorLeaderboardPanel({ active = true }) {
  const theme = useTheme();
  const router = useRouter();
  const [period, setPeriod] = useState('week');
  const [enabled, setEnabled] = useState(false);
  const [checked, setChecked] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!active) {
      setChecked(true); setEnabled(false); setLoading(false); setError(null); return;
    }
    setLoading(true); setError(null);
    try {
      const flags = await loadWingCreatorFeatureFlags();
      const nextEnabled = Boolean(flags.wing_shot_creator_leaderboard);
      setEnabled(nextEnabled); setChecked(true);
      if (!nextEnabled) { setRows([]); return; }
      const nextRows = await loadCreatorLeaderboard(period);
      setRows(nextRows);
      trackEvent({ eventName: 'creator_leaderboard_viewed', screen: 'social_leaderboards', metadata: { period, row_count: nextRows.length } });
    } catch (loadError) {
      setChecked(true); setError(loadError?.message || 'Could not load the Creator leaderboard.');
    } finally { setLoading(false); }
  }, [active, period]);

  useEffect(() => { load(); }, [load]);
  if (checked && !enabled && !error) return null;

  return (
    <Card testID="creator.leaderboard" style={[styles.card, { backgroundColor: theme.colors.elevation?.level2 ?? theme.colors.surface }]}>
      <Card.Content style={styles.content}>
        <View>
          <Text variant="titleLarge" style={styles.title}>Creators</Text>
          <Text variant="bodyMedium" style={styles.subtitle}>
            Creator Reputation is earned from approved and featured Wing Shots.
          </Text>
        </View>
        <SegmentedButtons
          value={period}
          onValueChange={setPeriod}
          density="small"
          buttons={[
            { value: 'week', label: 'This Week', testID: 'creator.leaderboard.period.week', accessibilityLabel: 'Show weekly Creator leaderboard' },
            { value: 'all_time', label: 'All Time', testID: 'creator.leaderboard.period.all-time', accessibilityLabel: 'Show all-time Creator leaderboard' },
          ]}
        />
        {loading ? (
          <View testID="creator.leaderboard.loading" style={styles.loading} accessibilityLabel="Loading Creator leaderboard"><ActivityIndicator /></View>
        ) : error ? (
          <View testID="creator.leaderboard.error" style={styles.error}><Text style={{ color: theme.colors.error }}>{error}</Text><Button onPress={load}>Retry</Button></View>
        ) : rows.length === 0 ? (
          <Text testID="creator.leaderboard.empty" style={styles.empty}>No Creator Reputation yet. Be the first to share a Wing Shot.</Text>
        ) : (
          <View style={styles.rows}>
            {rows.map((row, index) => {
              const name = row.display_name || row.username || `Winglet_${String(row.user_id || '').slice(0, 6)}`;
              const avatarLabel = name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
              const rowStyle = row.is_current_user ? { backgroundColor: theme.colors.secondaryContainer } : null;
              const textStyle = row.is_current_user ? { color: theme.colors.onSecondaryContainer } : null;
              return (
                <Pressable
                  key={row.user_id}
                  testID={index < 3 ? `creator.leaderboard.row.${index + 1}` : undefined}
                  style={({ pressed }) => [styles.leaderRow, rowStyle, { opacity: pressed ? 0.72 : 1 }]}
                  accessibilityLabel={`Rank ${row.rank}, ${name}, ${row.creator_xp} Creator Reputation, ${row.approved_submissions} approved, ${row.featured_submissions} featured`}
                  accessibilityRole="button"
                  accessibilityHint="Opens this creator's public wing journey"
                  onPress={() => router.push({ pathname: '/profile/history', params: { userId: row.user_id, sourceSurface: 'creator_leaderboard' } })}
                >
                  {row.avatar_url ? <Avatar.Image size={38} source={{ uri: row.avatar_url }} /> : <Avatar.Text size={38} label={avatarLabel || '??'} />}
                  <View style={styles.rowCopy}>
                    <Text variant="titleMedium" style={[styles.rowName, textStyle]}>#{row.rank}  {name}</Text>
                    <Text variant="bodySmall" style={[styles.rowStats, textStyle]}>
                      {Number(row.creator_xp || 0)} Reputation · {Number(row.approved_submissions || 0)} approved · {Number(row.featured_submissions || 0)} featured
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 18, marginBottom: 14 },
  content: { gap: 14 },
  title: { fontWeight: '800' },
  subtitle: { opacity: 0.75, marginTop: 3, lineHeight: 20 },
  loading: { minHeight: 92, alignItems: 'center', justifyContent: 'center' },
  error: { gap: 6, alignItems: 'flex-start' },
  empty: { opacity: 0.72, paddingVertical: 16, textAlign: 'center' },
  rows: { gap: 4 },
  leaderRow: { minHeight: 64, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, justifyContent: 'center', flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowCopy: { flex: 1, minWidth: 0 },
  rowName: { fontWeight: '750' },
  rowStats: { opacity: 0.74, marginTop: 2, lineHeight: 18 },
});
