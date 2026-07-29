import React, { useCallback, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { ActivityIndicator, Button, Card, Chip, Text, useTheme } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import {
  loadCreatorLeaderboard,
  loadMyWingCreatorSummary,
  loadWingCreatorFeatureFlags,
} from '../../lib/wingCreator';

function currentRank(rows) {
  const entry = (rows || []).find((row) => row.is_current_user);
  return entry?.rank == null ? null : Number(entry.rank);
}

export default function WingCreatorSummaryCard({ refreshKey = 0 }) {
  const router = useRouter();
  const theme = useTheme();
  const [state, setState] = useState({
    loading: true,
    error: null,
    summary: null,
    weeklyRank: null,
    allTimeRank: null,
    leaderboardEnabled: false,
  });

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const [summary, flags] = await Promise.all([
        loadMyWingCreatorSummary(),
        loadWingCreatorFeatureFlags(),
      ]);
      const leaderboardEnabled = Boolean(flags.wing_shot_creator_leaderboard);
      const [weekly, allTime] = leaderboardEnabled
        ? await Promise.all([
            loadCreatorLeaderboard('week'),
            loadCreatorLeaderboard('all_time'),
          ])
        : [[], []];
      setState({
        loading: false,
        error: null,
        summary,
        weeklyRank: currentRank(weekly),
        allTimeRank: currentRank(allTime),
        leaderboardEnabled,
      });
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: error?.message || 'Could not load Wing Creator progress.',
      }));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      return undefined;
    }, [load, refreshKey])
  );

  const stats = state.summary?.stats;
  const badges = state.summary?.badges || [];

  return (
    <Card
      testID="creator.profile-card"
      mode="elevated"
      style={[
        styles.card,
        {
          backgroundColor:
            theme.colors.elevation?.level2 ?? theme.colors.surface,
        },
      ]}
    >
      <Card.Content style={styles.content}>
        <View style={styles.heading}>
          <View style={{ flex: 1 }}>
            <Text variant="titleLarge" style={styles.title}>
              Wing Creator
            </Text>
            <Text variant="bodyMedium" style={styles.subtitle}>
              Approved Wing Shots earn Creator XP. Featured shots earn an extra boost.
            </Text>
          </View>
        </View>

        {state.loading ? (
          <View
            testID="creator.profile-loading"
            accessibilityLabel="Loading Wing Creator progress"
            style={styles.loading}
          >
            <ActivityIndicator />
          </View>
        ) : state.error ? (
          <View testID="creator.profile-error" style={styles.error}>
            <Text style={{ color: theme.colors.error }}>{state.error}</Text>
            <Button onPress={load} accessibilityLabel="Retry loading Wing Creator progress">
              Retry
            </Button>
          </View>
        ) : (
          <>
            <View style={styles.metrics} accessible accessibilityLabel="Wing Creator totals">
              <View style={styles.metric}>
                <Text variant="headlineSmall" style={styles.metricValue}>
                  {Number(stats?.creator_xp || 0).toLocaleString()}
                </Text>
                <Text variant="labelMedium">Creator XP</Text>
              </View>
              <View style={styles.metric}>
                <Text variant="headlineSmall" style={styles.metricValue}>
                  {Number(stats?.approved_submissions || 0)}
                </Text>
                <Text variant="labelMedium">Approved</Text>
              </View>
              <View style={styles.metric}>
                <Text variant="headlineSmall" style={styles.metricValue}>
                  {Number(stats?.featured_submissions || 0)}
                </Text>
                <Text variant="labelMedium">Featured</Text>
              </View>
            </View>

            {state.leaderboardEnabled ? (
              <Text
                testID="creator.profile-ranks"
                variant="bodyMedium"
                accessibilityLabel={`Weekly Creator rank ${
                  state.weeklyRank || 'not ranked'
                }. All-time Creator rank ${state.allTimeRank || 'not ranked'}.`}
              >
                Weekly rank: {state.weeklyRank ? `#${state.weeklyRank}` : 'Not ranked yet'}
                {'  ·  '}
                All-time: {state.allTimeRank ? `#${state.allTimeRank}` : 'Not ranked yet'}
              </Text>
            ) : null}

            {badges.length ? (
              <View testID="creator.profile-badges" style={styles.badges}>
                {badges.slice(0, 4).map((badge) => (
                  <Chip
                    compact
                    key={badge.badge_code}
                    icon={badge.badge_icon || 'medal'}
                    accessibilityLabel={`Creator badge earned: ${badge.badge_name}`}
                  >
                    {badge.badge_name}
                  </Chip>
                ))}
              </View>
            ) : (
              <Text variant="bodySmall" style={styles.empty}>
                Your first approved Wing Shot unlocks your first Creator badge.
              </Text>
            )}
          </>
        )}

        <Button
          testID="creator.open-history"
          mode="contained-tonal"
          icon="camera"
          onPress={() => router.push('/profile/wing-shots')}
          accessibilityLabel="Open your private Wing Shot history"
          contentStyle={styles.buttonContent}
        >
          Wing Shot History
        </Button>
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 18, marginBottom: 16 },
  content: { gap: 14 },
  heading: { flexDirection: 'row', alignItems: 'flex-start' },
  title: { fontWeight: '800' },
  subtitle: { marginTop: 4, lineHeight: 20, opacity: 0.78 },
  loading: { minHeight: 76, justifyContent: 'center', alignItems: 'center' },
  error: { gap: 6, alignItems: 'flex-start' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metric: { flexGrow: 1, flexBasis: 90, minWidth: 88 },
  metricValue: { fontWeight: '900' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  empty: { opacity: 0.72, lineHeight: 18 },
  buttonContent: { minHeight: 48 },
});
