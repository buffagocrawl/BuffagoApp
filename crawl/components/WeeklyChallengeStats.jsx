import React, { useCallback, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { loadPublicChallengeStats } from '../lib/challengeStats';
import { loadWeeklyMission } from '../lib/weeklyMission';
import { trackEvent } from '../lib/analytics';
import { SurfaceCard, SectionHeader, ProgressBar } from './ui/OperationUI';
import { ENABLE_GROWTH_MISSIONS } from '../config/features';

export default function WeeklyChallengeStats({ client, userId, isPublic }) {
  const [stats, setStats] = useState(null);
  const [mission, setMission] = useState(null);
  useFocusEffect(useCallback(() => {
    let live = true;
    setStats(null); setMission(null);
    if (!userId) return undefined;
    loadPublicChallengeStats(client, userId).then((value) => { if (live) setStats(value); }).catch(() => { if (live) setStats(null); });
    // Current assignments are owner-only; public profiles use the visibility RPC.
    if (!isPublic && ENABLE_GROWTH_MISSIONS) loadWeeklyMission(client).then((value) => { if (live) setMission(value); }).catch(() => { if (live) setMission(null); });
    if (isPublic) trackEvent({ eventName: 'public_profile_challenge_stats_viewed', screen: 'profile_history', metadata: {} });
    return () => { live = false; };
  }, [client, userId, isPublic]));
  if (!stats && !mission) return null;
  return <SurfaceCard style={styles.card} testID="weekly-challenge-stats">
    <SectionHeader title="Weekly Challenges" />
    {mission?.mission ? <View style={{ gap: 6 }}>
      <Text variant="titleSmall">{mission.mission.label}</Text>
      <Text variant="bodySmall">{mission.mission.current} / {mission.mission.target}</Text>
      <ProgressBar progress={mission.completionRatio} />
      <Text variant="bodySmall">{mission.resetCopy}</Text>
    </View> : null}
    {stats ? <View style={styles.grid}>
      <SurfaceCard style={styles.stat}><Text numberOfLines={2}>{stats.total} completed</Text></SurfaceCard>
      <SurfaceCard style={styles.stat}><Text numberOfLines={2}>{stats.thisWeek} this week</Text></SurfaceCard>
      <SurfaceCard style={styles.stat}><Text numberOfLines={2}>{stats.currentStreak}-week streak</Text></SurfaceCard>
      <SurfaceCard style={styles.stat}><Text numberOfLines={2}>Best: {stats.bestStreak} weeks</Text></SurfaceCard>
    </View> : null}
  </SurfaceCard>;
}
const styles = StyleSheet.create({ card: { marginVertical: 8 }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, stat: { flexBasis: '45%', flexGrow: 1, minWidth: 100 } });
