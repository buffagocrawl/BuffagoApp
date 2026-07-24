import React, { useEffect } from 'react';
import { ScrollView, Share, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Card, Text } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useBuffaverseProgress } from '../../hooks/useBuffaverseProgress';
import { trackEvent } from '../../lib/analytics';
import { ANALYTICS_EVENTS } from '../../lib/analyticsSchema';
import { ENABLE_BUFFAVERSE_SHARING } from '../../config/features';
import { BuffagoMascot } from '../mascot/BuffagoMascot';

export default function BuffaverseOverview({ onOpenHistory }) {
  const router = useRouter();
  const { loading, error, summary, objective, reload, disabled } = useBuffaverseProgress();
  useEffect(() => { trackEvent({ eventName: ANALYTICS_EVENTS.BUFFAVERSE_OPENED, screen: 'buffaverse' }); }, []);
  if (loading) return <View style={styles.center}><ActivityIndicator accessibilityLabel="Loading Buffaverse progress" /><Text style={styles.muted}>Mapping your wing journey…</Text></View>;
  if (error) return <View style={styles.center}><Text variant="titleMedium">{error}</Text><Button mode="outlined" onPress={reload}>Try again</Button></View>;
  if (disabled) return <View style={styles.center}><Text variant="titleLarge" style={styles.heading}>Buffaverse is taking a short break.</Text><Text style={styles.muted}>Your ratings, crawls, and badges are still safe.</Text><Button mode="outlined" onPress={onOpenHistory}>View history</Button></View>;
  if (!summary) return <View style={styles.center}><Text variant="titleLarge" style={styles.heading}>Your Buffaverse starts here.</Text><Text style={styles.muted}>Sign in to see your level, milestones, and next adventure.</Text><Button mode="contained" onPress={() => router.push('/auth/login')}>Sign in</Button></View>;
  const share = async () => {
    if (!ENABLE_BUFFAVERSE_SHARING) return;
    trackEvent({ eventName: ANALYTICS_EVENTS.BUFFAVERSE_ACHIEVEMENT_SHARE_STARTED, screen: 'buffaverse', metadata: { share_type: 'progress_summary' } });
    try { await Share.share({ message: `I'm Level ${summary.level.level} · ${summary.title} in BuffaGo. ${summary.metrics.restaurants} restaurants rated and counting!` }); trackEvent({ eventName: ANALYTICS_EVENTS.BUFFAVERSE_ACHIEVEMENT_SHARE_COMPLETED, screen: 'buffaverse', metadata: { share_type: 'progress_summary' } }); } catch {}
  };
  const selectObjective = () => { trackEvent({ eventName: ANALYTICS_EVENTS.BUFFAVERSE_OBJECTIVE_SELECTED, screen: 'buffaverse', metadata: { objective_id: objective.id } }); router.push(objective.route); };
  return <ScrollView contentContainerStyle={styles.container}>
    <View style={styles.identity}>
      <BuffagoMascot pose="hero" size="small" decorative={false} accessibilityLabel="Your Buffago mascot" analyticsSurface="buffaverse" analyticsMomentType="celebration" sourceScreen="buffaverse" />
      <View style={styles.identityCopy}><Text style={styles.eyebrow}>YOUR BUFFAVERSE</Text><Text variant="headlineSmall" style={styles.heading}>Level {summary.level.level}</Text><Text style={styles.title}>{summary.title}</Text><Text style={styles.xp}>{summary.level.xp} XP · {Math.round(summary.level.percent * 100)}% to next level</Text></View>
    </View>
    <Card style={styles.objective}><Card.Content><Text style={styles.eyebrow}>NEXT OBJECTIVE</Text><Text variant="titleLarge" style={styles.heading}>{objective.label}</Text><Text style={styles.muted}>{objective.description}</Text><Button mode="contained" onPress={selectObjective} accessibilityLabel={`Start objective: ${objective.label}`}>Let’s go</Button></Card.Content></Card>
    <View style={styles.metrics}>{[['Restaurants', summary.metrics.restaurants], ['Crawls', summary.metrics.crawls], ['Badges', summary.metrics.badges], ['States', summary.metrics.states]].map(([label, value]) => <View key={label} style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.muted}>{label}</Text></View>)}</View>
    <Text variant="titleLarge" style={styles.section}>Milestones</Text>
    {summary.milestones.map((milestone) => <View key={milestone.id} accessible accessibilityLabel={`${milestone.label}: ${milestone.complete ? 'complete' : `${milestone.progress} of ${milestone.target}`}`} style={styles.milestone}><Text style={styles.milestoneLabel}>{milestone.complete ? '✓ ' : '○ '}{milestone.label}</Text><Text style={styles.muted}>{milestone.complete ? 'Complete' : `${milestone.progress}/${milestone.target}`}</Text></View>)}
    <View style={styles.actions}><Button mode="outlined" onPress={onOpenHistory}>View history</Button>{ENABLE_BUFFAVERSE_SHARING ? <Button mode="outlined" onPress={share}>Share progress</Button> : null}</View>
  </ScrollView>;
}

const styles = StyleSheet.create({
  container: { padding: 18, gap: 14 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 12 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 14 }, identityCopy: { flex: 1 }, eyebrow: { fontSize: 10, letterSpacing: 1.4, fontWeight: '900', opacity: 0.65 }, heading: { fontWeight: '900' }, title: { fontSize: 17, fontWeight: '800', opacity: 0.85 }, xp: { marginTop: 5, opacity: 0.7 }, muted: { opacity: 0.72, lineHeight: 20 }, objective: { backgroundColor: 'rgba(255,122,24,0.12)' }, metrics: { flexDirection: 'row', borderRadius: 16, padding: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }, metric: { flex: 1, alignItems: 'center' }, metricValue: { fontSize: 20, fontWeight: '900' }, section: { marginTop: 6, fontWeight: '900' }, milestone: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' }, milestoneLabel: { flex: 1, fontWeight: '700' }, actions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', paddingBottom: 20 },
});
