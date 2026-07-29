import React, { useRef } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View, ActivityIndicator } from 'react-native';
import { Button, Dialog, Portal, Text, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  comparisonFor,
  formatDifference,
  formatScore,
  overallComparisonCopy,
  personalityFor,
} from '../lib/ratingComparison.js';

const METRICS = [
  { key: 'crispiness', label: 'Crispiness' },
  { key: 'sauce', label: 'Sauce' },
  { key: 'meat', label: 'Meat' },
];

const score = formatScore;

function ComparisonRow({ label, user, community }) {
  const result = comparisonFor(user, community);
  const delta = formatDifference(result.delta);
  const meterWidth = community == null ? 0 : Math.min(100, Math.max(0, Number(community) * 10));
  return (
    <View style={styles.categoryRow} accessible accessibilityLabel={`${label}. You ${score(user)}. Crowd ${score(community)}. Difference ${delta}`}>
      <View style={styles.categoryLabelWrap}>
        <Text style={styles.categoryLabel}>{label}</Text>
        <View style={styles.meterTrack}><View style={[styles.meterFill, { width: `${meterWidth}%` }]} /></View>
      </View>
      <Text style={styles.categoryScore}>{score(user)}</Text>
      <Text style={styles.categoryScore}>{score(community)}</Text>
      <Text style={[styles.categoryDelta, { color: result.color }]}>{community == null ? '—' : delta}</Text>
    </View>
  );
}

export default function RatingComparisonModal({ visible, data, onDone, onViewRestaurant }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const actionRef = useRef(false);
  if (!data) return null;

  const communityOverall = data.communityScores?.overall;
  const overall = comparisonFor(data.userScores?.overall, communityOverall);
  const hasCommunity = !data.comparisonError && data.priorRatingCount > 0 && communityOverall != null;
  const personality = personalityFor(data.userScores, data.communityScores);
  const maxHeight = Math.max(360, Math.min(height - insets.top - insets.bottom - 16, height * 0.9));

  const pressAction = async (action) => {
    if (actionRef.current) return;
    actionRef.current = true;
    try { await action?.(); } finally { actionRef.current = false; }
  };

  return (
    <Portal>
      <Dialog
        visible={visible}
        dismissable={false}
        style={[styles.dialog, { maxHeight, backgroundColor: colors.elevation?.level3 ?? colors.surface }]}
        testID="rating-comparison-modal"
      >
        <Dialog.Content style={styles.content}>
          <Text style={styles.eyebrow}>YOU VS. THE WING WORLD</Text>
          <Text style={styles.restaurant} numberOfLines={2}>{data.destinationName}</Text>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[styles.scrollContent, { paddingBottom: 20 }]}
            showsVerticalScrollIndicator={false}
          >
            {data.comparisonStatus === 'loading' ? <View style={styles.loading}><ActivityIndicator color="#FF7A18" /><Text style={styles.heroCopy}>Checking the wing world…</Text></View> : null}
            <View style={styles.hero}>
              <View style={styles.heroHeader}><Text style={styles.heroLabel}>YOUR SCORE</Text><Text style={styles.heroLabel}>COMMUNITY</Text></View>
              <View style={styles.heroScores}><Text style={styles.heroScore}>{score(data.userScores?.overall)}</Text><Text style={styles.heroScore}>{hasCommunity ? score(communityOverall) : '—'}</Text></View>
              <View style={[styles.comparisonPill, { borderColor: overall.color }]}>
                <Text style={[styles.comparisonPillText, { color: overall.color }]}>{hasCommunity ? `${formatDifference(overall.delta)} ${Math.abs(overall.delta) <= 0.1 ? 'right with the crowd' : overall.delta > 0 ? 'above the crowd' : 'below the crowd'}` : 'No crowd score yet'}</Text>
              </View>
              <Text style={styles.heroCopy}>{data.comparisonError ? 'Community comparison unavailable right now.' : hasCommunity ? overallComparisonCopy(overall.delta, true) : 'You’re setting the wing standard.'}</Text>
            </View>

            <View style={styles.categoryCard}>
              <View style={styles.categoryHeader}><Text style={styles.sectionEyebrow}>WING BREAKDOWN</Text><Text style={styles.columnHeading}>YOU   CROWD   DIFF</Text></View>
              {METRICS.map(({ key, label }) => <ComparisonRow key={key} label={label} user={data.userScores?.[key]} community={hasCommunity ? data.communityScores?.[key] : null} />)}
            </View>

            <View style={styles.verdict}>
              <Text style={styles.verdictEyebrow}>YOUR WING VERDICT</Text>
              <Text style={styles.verdictTitle}>{personality.title}</Text>
              <Text style={styles.verdictBody}>{personality.body}</Text>
            </View>
          </ScrollView>
        </Dialog.Content>
        <Dialog.Actions style={[styles.actions, { paddingBottom: Math.max(10, insets.bottom) }]}>
          <Button mode="outlined" compact={false} onPress={() => pressAction(onViewRestaurant)} style={styles.actionButton} contentStyle={styles.actionContent} accessibilityLabel="View Restaurant">View Restaurant</Button>
          <Button mode="contained" compact={false} onPress={() => pressAction(onDone)} style={styles.actionButton} contentStyle={styles.actionContent} accessibilityLabel="Done">Done</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  dialog: { alignSelf: 'center', width: '94%', borderRadius: 20, overflow: 'hidden' },
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 0, flexShrink: 1 },
  eyebrow: { color: '#FF7A18', fontSize: 11, fontWeight: '900', letterSpacing: 1.2, textAlign: 'center' },
  restaurant: { fontSize: 19, fontWeight: '900', textAlign: 'center', marginTop: 3, marginBottom: 10 },
  scroll: { flexShrink: 1 },
  scrollContent: { gap: 10 },
  loading: { alignItems: 'center', paddingVertical: 8 },
  hero: { backgroundColor: 'rgba(255,122,24,0.14)', borderRadius: 16, padding: 14 },
  heroHeader: { flexDirection: 'row', justifyContent: 'space-around' },
  heroScores: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 1 },
  heroLabel: { color: '#FFB27D', fontSize: 10, fontWeight: '800', letterSpacing: 0.7 },
  heroScore: { fontSize: 30, lineHeight: 34, fontWeight: '900', color: '#FFF' },
  comparisonPill: { alignSelf: 'center', borderWidth: 1, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 5, marginTop: 8 },
  comparisonPillText: { fontSize: 12, fontWeight: '900' },
  heroCopy: { textAlign: 'center', fontSize: 13, lineHeight: 18, opacity: 0.82, marginTop: 7 },
  categoryCard: { borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.055)', padding: 11 },
  categoryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 },
  sectionEyebrow: { color: '#FF7A18', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  columnHeading: { fontSize: 9, opacity: 0.55, fontWeight: '800' },
  categoryRow: { minHeight: 47, flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.09)', gap: 7 },
  categoryLabelWrap: { flex: 1, minWidth: 90 },
  categoryLabel: { fontSize: 13, fontWeight: '800' },
  meterTrack: { height: 3, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 4, marginTop: 4, overflow: 'hidden' },
  meterFill: { height: 3, backgroundColor: '#FF7A18', borderRadius: 4 },
  categoryScore: { width: 40, textAlign: 'right', fontSize: 13, fontWeight: '800' },
  categoryDelta: { width: 42, textAlign: 'right', fontSize: 13, fontWeight: '900' },
  verdict: { alignItems: 'center', paddingHorizontal: 8, paddingTop: 3, paddingBottom: 3 },
  verdictEyebrow: { color: '#FF7A18', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  verdictTitle: { fontSize: 18, lineHeight: 24, fontWeight: '900', textAlign: 'center', marginTop: 2 },
  verdictBody: { fontSize: 13, lineHeight: 18, textAlign: 'center', opacity: 0.78, marginTop: 2 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingHorizontal: 14, paddingTop: 10, margin: 0, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' },
  actionButton: { flex: 1, minHeight: 44, borderRadius: 10 },
  actionContent: { minHeight: 44 },
});
