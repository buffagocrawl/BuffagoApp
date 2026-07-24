import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  Button,
  Card,
  ProgressBar,
  Snackbar,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';
import { useRouter } from 'expo-router';
import {
  claimPendingReferral,
  copyReferralCode,
  loadReferralHub,
  nextReferralProgress,
  recognizeReferral,
  shareReferral,
} from '../lib/referrals';
import { trackEvent } from '../lib/analytics';

function Metric({ label, value }) {
  return (
    <View style={styles.metric} accessibilityLabel={`${label}: ${value}`}>
      <Text variant="headlineSmall" style={styles.metricValue}>{value}</Text>
      <Text variant="labelMedium" style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

export default function ReferralHubScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [claiming, setClaiming] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setSummary(await loadReferralHub());
    } catch (nextError) {
      setError(nextError?.message || 'Could not load referrals.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    trackEvent({ eventName: 'referral_hub_viewed', screen: 'referral_hub' });
  }, [load]);

  const progress = useMemo(() => nextReferralProgress(summary || {}), [summary]);

  const claimCode = async () => {
    setClaiming(true);
    try {
      const recognized = await recognizeReferral(codeInput, {
        source: 'manual',
        placement: 'referral_hub',
        screen: 'referral_hub',
      });
      if (!recognized.recognized) {
        setMessage('That code is invalid, disabled, or expired.');
        return;
      }
      const result = await claimPendingReferral({
        source: 'manual',
        placement: 'referral_hub',
        screen: 'referral_hub',
      });
      setMessage(result?.claimed
        ? 'Friend invitation recognized. Finish onboarding and your first valid rating.'
        : ({
            self_referral: 'You cannot use your own referral code.',
            existing_account: 'Referral codes are only available to new accounts.',
            existing_activity: 'This account has already started rating wings.',
            already_claimed: 'This account already has a referral.',
          }[result?.reason] || 'We could not apply that code. You can keep using Buffago.'));
      if (result?.claimed) setCodeInput('');
    } finally {
      setClaiming(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Button icon="arrow-left" mode="text" onPress={() => router.back()}
          accessibilityLabel="Back from Referral Hub" style={styles.back}>
          Back
        </Button>
        <Text variant="headlineMedium" style={styles.title}>Wings taste better with friends.</Text>
        <Text style={styles.subtitle}>
          Your friend joins Buffago and rates their first wing spot. Then you both earn a reward.
        </Text>

        {loading ? (
          <Card style={styles.stableCard}>
            <Card.Content style={styles.center}>
              <ActivityIndicator accessibilityLabel="Loading referral details" />
              <Text>Loading your wing crew…</Text>
            </Card.Content>
          </Card>
        ) : error ? (
          <Card style={styles.stableCard}>
            <Card.Content style={styles.center}>
              <Text variant="titleMedium">Referral details are taking a sauce break.</Text>
              <Text>{error}</Text>
              <Button mode="contained" onPress={load} accessibilityLabel="Retry referral details">
                Retry
              </Button>
            </Card.Content>
          </Card>
        ) : (
          <>
            <Card style={styles.card}>
              <Card.Content>
                <Text variant="labelLarge">YOUR REFERRAL CODE</Text>
                <Text selectable style={styles.code} accessibilityLabel={`Referral code ${summary?.code}`}>
                  {summary?.code}
                </Text>
                <View style={styles.actions}>
                  <Button mode="outlined" icon="content-copy"
                    accessibilityLabel="Copy referral code"
                    onPress={async () => {
                      await copyReferralCode(summary?.code);
                      setMessage('Referral code copied.');
                    }}>
                    Copy code
                  </Button>
                  <Button mode="contained" icon="share-variant"
                    accessibilityLabel="Invite friends with native share sheet"
                    onPress={() => shareReferral({
                      code: summary?.code,
                      rewardAmount: summary?.inviter_reward_xp,
                      placement: 'referral_hub',
                    }).catch(() => setMessage('Sharing is unavailable right now.'))}>
                    Invite Friends
                  </Button>
                </View>
                <Text style={styles.reward}>
                  You earn {summary?.inviter_reward_xp} XP. Your friend earns{' '}
                  {summary?.invitee_reward_xp} XP after their first accepted rating.
                </Text>
              </Card.Content>
            </Card>

            <View style={styles.metrics}>
              <Metric label="Joined" value={summary?.joined_count || 0} />
              <Metric label="Pending" value={summary?.pending_count || 0} />
              <Metric label="Qualified" value={summary?.qualified_count || 0} />
            </View>

            <Card style={styles.card}>
              <Card.Content>
                <Text variant="titleMedium">Referral rewards</Text>
                <Text variant="headlineSmall">{summary?.total_rewards || 0} XP earned</Text>
                {progress.threshold ? (
                  <>
                    <Text>
                      {progress.remaining} more qualified {progress.remaining === 1 ? 'friend' : 'friends'}{' '}
                      until your next referral badge.
                    </Text>
                    <ProgressBar progress={progress.progress} accessibilityLabel="Referral badge progress"
                      style={styles.progress} />
                  </>
                ) : <Text>All verified referral milestones unlocked.</Text>}
              </Card.Content>
            </Card>

            <Card style={styles.card}>
              <Card.Content>
                <Text variant="titleMedium">Recent invitations</Text>
                {(summary?.recent || []).length ? (summary.recent || []).map((item) => (
                  <View key={item.id} style={styles.row}>
                    <Text>{item.status_label}</Text>
                    <Text variant="bodySmall">{new Date(item.created_at).toLocaleDateString()}</Text>
                  </View>
                )) : (
                  <Text>No invitations yet. Share your code when your wing crew is ready.</Text>
                )}
              </Card.Content>
            </Card>
          </>
        )}

        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium">Have a friend’s code?</Text>
            <Text>New accounts can claim one invitation. A failed claim never blocks onboarding.</Text>
            <TextInput label="Referral code" value={codeInput}
              autoCapitalize="characters" autoCorrect={false} maxLength={12}
              accessibilityLabel="Enter referral code"
              onChangeText={setCodeInput} style={styles.input} />
            <Button mode="outlined" loading={claiming} disabled={claiming || !codeInput.trim()}
              accessibilityLabel="Apply referral code" onPress={claimCode}>
              Apply code
            </Button>
          </Card.Content>
        </Card>
      </ScrollView>
      <Snackbar visible={Boolean(message)} onDismiss={() => setMessage('')} duration={4500}>
        {message}
      </Snackbar>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: 18, paddingBottom: 48, gap: 14, width: '100%', maxWidth: 720, alignSelf: 'center' },
  back: { alignSelf: 'flex-start' },
  title: { fontWeight: '900', lineHeight: 38 },
  subtitle: { opacity: 0.8, lineHeight: 21 },
  stableCard: { minHeight: 220, borderRadius: 18 },
  center: { minHeight: 190, alignItems: 'center', justifyContent: 'center', gap: 14 },
  card: { borderRadius: 18 },
  code: { fontSize: 30, fontWeight: '900', letterSpacing: 4, marginVertical: 12 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  reward: { marginTop: 14, lineHeight: 20 },
  metrics: { flexDirection: 'row', gap: 10 },
  metric: { flex: 1, minHeight: 92, borderRadius: 16, padding: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,128,0,0.12)' },
  metricValue: { fontWeight: '900' },
  metricLabel: { opacity: 0.75 },
  progress: { height: 9, borderRadius: 9, marginTop: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(128,128,128,0.35)' },
  input: { marginVertical: 12 },
});
