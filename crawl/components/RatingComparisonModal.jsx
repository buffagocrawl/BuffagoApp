import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Dialog, Portal, Text, useTheme } from 'react-native-paper';
import { comparisonFor, comparisonMessage, personalityFor } from '../lib/ratingComparison.js';

const METRICS = [
  { key: 'overall', label: 'OVERALL' },
  { key: 'crispiness', label: 'CRISPINESS' },
  { key: 'sauce', label: 'SAUCE' },
  { key: 'meat', label: 'MEAT' },
];

const score = (value) => value == null ? '—' : Number(value).toFixed(1);

export default function RatingComparisonModal({ visible, data, onDone, onViewRestaurant }) {
  const { colors } = useTheme();
  if (!data) return null;
  const firstRating = data.priorRatingCount === 0;
  const personality = personalityFor(data.userScores, data.communityScores);

  const close = () => onDone?.();
  return (
    <Portal>
      <Dialog visible={visible} dismissable={false} style={[styles.dialog, { backgroundColor: colors.elevation?.level3 ?? colors.surface }]}>
        <Dialog.Title style={styles.title}>RATING LOCKED IN</Dialog.Title>
        <Dialog.Content style={styles.content}>
          <Text style={styles.restaurant} numberOfLines={2}>{data.destinationName}</Text>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator>
            {firstRating ? (
              <View style={styles.firstCard}>
                <Text style={styles.firstTitle}>YOU SET THE BAR</Text>
                <Text style={styles.body}>You are the first BuffaGo user to rate these wings.</Text>
                <Text style={styles.body}>Future wing hunters will be compared against you.</Text>
              </View>
            ) : null}
            {METRICS.map(({ key, label }) => {
              const user = data.userScores[key];
              const community = data.communityScores[key];
              const result = comparisonFor(user, community);
              return (
                <View key={key} style={styles.row}>
                  <Text style={styles.metric}>{label}</Text>
                  <View style={styles.columns}>
                    <View style={styles.column}><Text style={styles.columnLabel}>You</Text><Text style={styles.value}>{score(user)}</Text></View>
                    <View style={styles.column}><Text style={styles.columnLabel}>Community</Text><Text style={styles.value}>{score(community)}</Text></View>
                    <Text style={[styles.delta, { color: result.color }]}>{result.symbol} {result.delta == null ? '—' : Math.abs(result.delta).toFixed(1)}</Text>
                  </View>
                  <Text style={styles.body}>{community == null ? 'No community average yet.' : comparisonMessage(key, result.delta)}</Text>
                </View>
              );
            })}
            <View style={styles.verdict}>
              <Text style={styles.verdictEyebrow}>YOUR WING VERDICT</Text>
              <Text style={styles.verdictTitle}>{personality.title}</Text>
              <Text style={styles.body}>{personality.body}</Text>
            </View>
          </ScrollView>
        </Dialog.Content>
        <Dialog.Actions style={styles.actions}>
          <Button mode="outlined" onPress={onViewRestaurant}>View Restaurant</Button>
          <Button mode="contained" onPress={close}>Done</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  dialog: { alignSelf: 'center', width: '94%', maxHeight: '92%', borderRadius: 18 },
  title: { textAlign: 'center', color: '#FF6F00', fontWeight: '900', letterSpacing: 1 },
  content: { paddingTop: 0 },
  restaurant: { textAlign: 'center', fontSize: 17, fontWeight: '800', marginBottom: 8 },
  scroll: { maxHeight: 520 },
  scrollContent: { paddingBottom: 8 },
  row: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.12)' },
  metric: { fontWeight: '900', fontSize: 13, letterSpacing: 0.6, marginBottom: 5 },
  columns: { flexDirection: 'row', alignItems: 'center' },
  column: { flex: 1 },
  columnLabel: { opacity: 0.65, fontSize: 11, fontWeight: '700' },
  value: { fontSize: 18, fontWeight: '900' },
  delta: { fontSize: 16, fontWeight: '900', textAlign: 'right' },
  body: { opacity: 0.78, marginTop: 5, lineHeight: 18 },
  firstCard: { padding: 12, borderRadius: 14, backgroundColor: 'rgba(255,111,0,0.13)', marginBottom: 6 },
  firstTitle: { color: '#FF6F00', fontWeight: '900', letterSpacing: 1, marginBottom: 5 },
  verdict: { paddingTop: 14, alignItems: 'center' },
  verdictEyebrow: { color: '#FF6F00', fontWeight: '900', letterSpacing: 1 },
  verdictTitle: { fontSize: 22, fontWeight: '900', marginTop: 5, textAlign: 'center' },
  actions: { justifyContent: 'space-between', paddingBottom: 8, flexWrap: 'wrap', gap: 6 },
});
