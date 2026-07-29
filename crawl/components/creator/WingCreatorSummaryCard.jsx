import React, { useCallback, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator, Button, Card, Chip, IconButton, Text, useTheme } from 'react-native-paper';
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
  const [infoVisible, setInfoVisible] = useState(false);

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
  const badges = (state.summary?.badges || []).filter(
    (badge) => badge.badge_code !== 'wing_shot_first'
  );

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
          </View>
          <IconButton
            testID="creator.info-button"
            icon="information-outline"
            iconColor={theme.colors.primary}
            size={20}
            onPress={() => setInfoVisible(true)}
            accessibilityLabel="How Wing Creator works"
            accessibilityHint="Opens an explanation of Wing Creator, approval, and reputation."
            style={styles.infoButton}
          />
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
                  <Text variant="labelMedium">Creator Reputation</Text>
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
          onPress={() => router.push('/profile/wing-shots/history')}
          accessibilityLabel="Open your private Wing Shot history"
          contentStyle={styles.buttonContent}
        >
          Wing Shot History
        </Button>
      </Card.Content>

      <Modal
        visible={infoVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setInfoVisible(false)}
        accessibilityViewIsModal
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setInfoVisible(false)}>
          <Pressable
            testID="creator.info-modal"
            style={[
              styles.modalSheet,
              { backgroundColor: theme.colors.elevation?.level3 ?? theme.colors.surface },
            ]}
            onPress={(event) => event.stopPropagation()}
          >
            <SafeAreaView edges={['bottom']} style={styles.modalSafe}>
              <ScrollView
                contentContainerStyle={styles.modalContent}
                showsVerticalScrollIndicator
                accessibilityLabel="Wing Creator explanation"
              >
                <View style={styles.modalHeader}>
                  <Text variant="headlineSmall" style={styles.modalTitle}>Wing Creator</Text>
                  <IconButton
                    icon="close"
                    onPress={() => setInfoVisible(false)}
                    accessibilityLabel="Close Wing Creator explanation"
                  />
                </View>
                <Text style={styles.modalIntro}>
                  Share short videos of the wings you rate and build your reputation as a BuffaGo creator.
                </Text>
                <Text variant="titleMedium" style={styles.modalSection}>How it works</Text>
                {[
                  ['1. Submit a Wing Shot', 'After an in-person rating, upload a short video showing the wings or your experience.'],
                  ['2. BuffaGo reviews it', 'Submissions are reviewed for quality, safety, and whether the wings are clearly visible.'],
                  ['3. Earn Creator Reputation', 'Approved Wing Shots increase your Creator Reputation.'],
                  ['4. Get featured', 'Exceptional Wing Shots may be featured on BuffaGo’s social channels and receive an additional reputation boost.'],
                ].map(([title, body]) => (
                  <View key={title} style={styles.modalStep}>
                    <Text variant="titleSmall" style={styles.modalStepTitle}>{title}</Text>
                    <Text style={styles.modalBody}>{body}</Text>
                  </View>
                ))}
                <Text variant="titleMedium" style={styles.modalSection}>Statuses</Text>
                {[
                  ['Processing', 'Your Wing Shot is being prepared or reviewed.'],
                  ['Approved', 'Your submission passed review and earned Creator Reputation.'],
                  ['Featured', 'Your Wing Shot was selected to represent BuffaGo and earned a bonus.'],
                  ['Rejected', 'The submission could not be used. Show a friendly reason when one is available.'],
                ].map(([title, body]) => (
                  <View key={title} style={styles.statusRow}>
                    <Text variant="labelLarge" style={styles.statusTitle}>{title}</Text>
                    <Text style={styles.modalBody}>{body}</Text>
                  </View>
                ))}
                <Text style={styles.modalFooter}>
                  Creator Reputation is separate from your overall BuffaGo XP.
                </Text>
                <Button mode="contained" onPress={() => setInfoVisible(false)} contentStyle={styles.buttonContent}>
                  Got It
                </Button>
              </ScrollView>
            </SafeAreaView>
          </Pressable>
        </Pressable>
      </Modal>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, marginBottom: 12 },
  content: { gap: 10, paddingVertical: 14 },
  heading: { flexDirection: 'row', alignItems: 'flex-start' },
  title: { fontWeight: '800' },
  infoButton: { margin: -8, marginTop: -10, minWidth: 44, minHeight: 44 },
  loading: { minHeight: 76, justifyContent: 'center', alignItems: 'center' },
  error: { gap: 6, alignItems: 'flex-start' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  metric: { flexGrow: 1, flexBasis: 90, minWidth: 88 },
  metricValue: { fontWeight: '900' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  empty: { opacity: 0.72, lineHeight: 18 },
  buttonContent: { minHeight: 44 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.58)' },
  modalSheet: { maxHeight: '82%', borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  modalSafe: { flexShrink: 1 },
  modalContent: { padding: 18, paddingBottom: 30, gap: 10 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontWeight: '800' },
  modalIntro: { lineHeight: 21, opacity: 0.86 },
  modalSection: { fontWeight: '800', marginTop: 6 },
  modalStep: { gap: 2 },
  modalStepTitle: { fontWeight: '800' },
  modalBody: { lineHeight: 20, opacity: 0.82 },
  statusRow: { gap: 2 },
  statusTitle: { fontWeight: '800' },
  modalFooter: { lineHeight: 20, opacity: 0.86, marginTop: 4 },
});
