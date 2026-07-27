import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, Text } from 'react-native-paper';
import { loadPublicChallengeStats } from '../lib/challengeStats';
import { trackEvent } from '../lib/analytics';

export default function WeeklyChallengeStats({ client, userId, isPublic }) {
  const [stats, setStats] = useState(null);
  useEffect(() => { let live = true; if (!userId) return undefined; loadPublicChallengeStats(client, userId).then((x) => { if (live) setStats(x); }).catch(() => { if (live) setStats(null); }); if (isPublic) trackEvent({ eventName:'public_profile_challenge_stats_viewed', screen:'profile_history', metadata:{} }); return () => { live = false; }; }, [client, userId, isPublic]);
  if (!stats) return null;
  return <Card style={styles.card} testID="weekly-challenge-stats"><Card.Content><Text variant="titleMedium" style={styles.title}>Weekly Challenges</Text><View style={styles.grid}><Stat value={`${stats.total} completed`} /><Stat value={`${stats.thisWeek} this week`} /><Stat value={`${stats.currentStreak}-week streak`} /><Stat value={`Best: ${stats.bestStreak} weeks`} /></View></Card.Content></Card>;
}
function Stat({ value }) { return <Text style={styles.stat} numberOfLines={2}>{value}</Text>; }
const styles=StyleSheet.create({card:{marginTop:16},title:{fontWeight:'800',marginBottom:10},grid:{flexDirection:'row',flexWrap:'wrap',gap:8},stat:{width:'47%',fontWeight:'600'}});
