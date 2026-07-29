import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Dialog, Divider, Portal, Text, useTheme } from 'react-native-paper';

const COLORS = { higher: '#58D68D', close: '#F5A623', lower: '#FF6B6B' };
const METRICS = [
  { key: 'crispiness', label: 'Crispiness' },
  { key: 'sauce', label: 'Sauce' },
  { key: 'meat', label: 'Meat' },
];

const round = (value) => (Number.isFinite(Number(value)) ? Number(value).toFixed(1) : '—');
const comparison = (user, average) => {
  const delta = Number(user) - Number(average);
  const state = Math.abs(delta) <= 0.2 ? 'close' : delta > 0 ? 'higher' : 'lower';
  return { delta, state, color: COLORS[state], arrow: state === 'higher' ? '▲' : state === 'lower' ? '▼' : '=' };
};

function overallComment(state) {
  if (state === 'higher') return 'You liked these wings more than most BuffaGo users.';
  if (state === 'lower') return "You're tougher than the average reviewer.";
  return 'Pretty much everyone agrees with you.';
}

function metricComment(key, state) {
  const comments = {
    crispiness: { higher: 'Nearly perfect. You love a crunchy wing.', close: 'Crunch matters to you.', lower: "You thought they could've been crispier." },
    sauce: { higher: 'Sauce won you over.', close: 'The sauce hit the sweet spot.', lower: "The sauce didn't impress you." },
    meat: { higher: 'Plenty of juicy meat according to your score.', close: 'You found the meat pretty balanced.', lower: 'You expected meatier wings.' },
  };
  return comments[key]?.[state] || '';
}

function personality(scores = []) {
  if (!scores.length) return { title: 'Balanced Judge', body: 'You are building your wing profile one bite at a time.' };
  const avg = (key) => scores.reduce((sum, row) => sum + Number(row[key] || 0), 0) / scores.length;
  const values = { crispiness: avg('crispiness'), sauce: avg('sauce'), meat: avg('meat'), overall: avg('overall') };
  const max = Object.entries(values).filter(([key]) => key !== 'overall').sort((a, b) => b[1] - a[1])[0];
  if (values.crispiness >= 8.5 && values.crispiness >= values.sauce + 0.7) return { title: 'Crispy Wing Connoisseur', body: 'You consistently rate crispiness higher than the average reviewer.' };
  if (values.sauce >= 8.5 && values.sauce >= values.crispiness + 0.7) return { title: 'Sauce Chaser', body: 'A great sauce can make your whole wing experience.' };
  if (values.meat >= 8.5 && values.meat >= values.crispiness + 0.5) return { title: 'Tenderness Critic', body: 'Juicy, meaty wings are your benchmark.' };
  if (values.overall >= 8.5) return { title: 'Wing Optimist', body: 'You know when a wing stop is worth coming back to.' };
  if (max?.[1] >= 7.5) return { title: `${max[0][0].toUpperCase()} Hunter`, body: 'You have a clear favorite in the wing game.' };
  if (values.overall <= 5.5) return { title: 'Tough Critic', body: 'You keep every wing stop honest.' };
  return { title: 'Balanced Judge', body: 'You weigh the whole wing experience.' };
}

function chooseFunStat(data, previous) {
  const options = [];
  const percentile = Number(data.percentile);
  if (Number.isFinite(percentile)) options.push(`You rated these higher than ${Math.round(percentile)}% of users.`);
  if (Number(data.scores?.crispiness) >= 9) options.push('Your crispiness score is in the top 10%.');
  if (Number(data.scores?.overall) >= 9) options.push('You gave one of the highest scores today.');
  if (Math.abs(Number(data.scores?.overall) - Number(data.averages?.overall)) <= 0.2) options.push('Your opinion is almost identical to the community.');
  options.push('This restaurant divides BuffaGo users.');
  const candidates = options.filter((item) => item !== previous);
  return (candidates.length ? candidates : options)[Math.floor(Math.random() * (candidates.length ? candidates.length : options.length))];
}

export default function RatingComparisonModal({ visible, data, onDismiss, onCommunityReviews }) {
  const theme = useTheme();
  const [displayed, setDisplayed] = useState({});
  const [displayedOverall, setDisplayedOverall] = useState(0);
  const [funStat, setFunStat] = useState('');
  const previousFunStat = useRef('');
  const personalityOpacity = useRef(new Animated.Value(0)).current;
  const funOpacity = useRef(new Animated.Value(0)).current;
  const arrowSlide = useRef(new Animated.Value(-12)).current;

  const rows = useMemo(() => METRICS.map((metric) => ({ ...metric, user: data?.scores?.[metric.key], average: data?.averages?.[metric.key] })).filter((row) => row.user != null && row.average != null), [data]);
  const overall = data ? { user: data.scores?.overall, average: data.averages?.overall } : {};
  const overallAverage = overall.average;
  const overallComparison = comparison(overall.user, overall.average);
  const identity = personality(data?.history || []);

  useEffect(() => {
    if (!visible || !data) return undefined;
    setDisplayed({});
    setDisplayedOverall(0);
    personalityOpacity.setValue(0);
    funOpacity.setValue(0);
    arrowSlide.setValue(-12);
    const timers = rows.map((row, index) => setTimeout(() => {
      const target = Number(row.average);
      const start = Date.now();
      const tick = () => {
        const progress = Math.min(1, (Date.now() - start) / 650);
        setDisplayed((current) => ({ ...current, [row.key]: target * Easing.out(Easing.cubic)(progress) }));
        if (progress < 1) requestAnimationFrame(tick);
      };
      tick();
      if (index === rows.length - 1) {
        Animated.sequence([
          Animated.delay(180),
          Animated.parallel([Animated.timing(personalityOpacity, { toValue: 1, duration: 350, useNativeDriver: true }), Animated.timing(arrowSlide, { toValue: 0, duration: 350, useNativeDriver: true })]),
          Animated.timing(funOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        ]).start();
      }
    }, index * 180));
    const overallTarget = Number(overallAverage);
    const overallStart = Date.now();
    const animateOverall = () => {
      const progress = Math.min(1, (Date.now() - overallStart) / 650);
      setDisplayedOverall(overallTarget * Easing.out(Easing.cubic)(progress));
      if (progress < 1) requestAnimationFrame(animateOverall);
    };
    animateOverall();
    const nextStat = chooseFunStat(data, previousFunStat.current);
    previousFunStat.current = nextStat;
    setFunStat(nextStat);
    return () => timers.forEach(clearTimeout);
  }, [visible, data, rows, overallAverage, personalityOpacity, funOpacity, arrowSlide]);

  if (!data) return null;
  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss} style={[styles.dialog, { backgroundColor: theme.colors.surface }]}>
        <Dialog.Title style={styles.title}>Rating Submitted!</Dialog.Title>
        <Dialog.Content>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
            <Text style={styles.eyebrow}>How You Compare</Text>
            <Text style={styles.restaurant}>{data.name || 'These wings'}</Text>

            <View style={styles.overallCard}>
              <Text style={styles.label}>Overall</Text>
              <View style={styles.scoreLine}><Text style={styles.score}>You: {round(overall.user)} ⭐</Text><Text style={styles.community}>Community: {round(displayedOverall)} ⭐</Text></View>
              <Animated.Text style={[styles.delta, { color: overallComparison.color, transform: [{ translateX: arrowSlide }] }]}>{overallComparison.arrow} {Math.abs(overallComparison.delta).toFixed(1)}</Animated.Text>
              <Text style={styles.comment}>{overallComment(overallComparison.state)}</Text>
            </View>

            <Divider />
            {rows.map((row) => {
              const shownAverage = displayed[row.key] ?? 0;
              const state = comparison(row.user, row.average);
              return <View key={row.key} style={styles.metric}><View style={styles.metricTop}><Text style={styles.metricLabel}>{row.label}</Text><Text style={styles.metricValues}>You: {round(row.user)}   Community: {round(shownAverage)}</Text></View><Text style={[styles.metricDelta, { color: state.color }]}>{state.arrow} {Math.abs(state.delta).toFixed(1)}</Text><Text style={styles.comment}>{metricComment(row.key, state.state)}</Text></View>;
            })}

            <Animated.View style={[styles.section, { opacity: personalityOpacity }]}><Text style={styles.sectionTitle}>Your Wing Personality</Text><Text style={styles.badge}>{identity.title}</Text><Text style={styles.comment}>{identity.body}</Text></Animated.View>
            <Animated.View style={[styles.fun, { opacity: funOpacity }]}><Text style={styles.sectionTitle}>✨ Fun Fact</Text><Text style={styles.funText}>{funStat}</Text></Animated.View>
          </ScrollView>
        </Dialog.Content>
        <Dialog.Actions style={styles.actions}><Button mode="outlined" onPress={onCommunityReviews}>See Community Reviews</Button><Button mode="contained" onPress={onDismiss}>Done</Button></Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  dialog: { alignSelf: 'center', width: '94%', maxHeight: '90%' },
  title: { textAlign: 'center', fontWeight: '900' },
  content: { paddingBottom: 8 },
  eyebrow: { color: '#FF6F00', fontSize: 20, fontWeight: '900', textAlign: 'center' },
  restaurant: { fontSize: 17, fontWeight: '800', textAlign: 'center', marginTop: 3, marginBottom: 12 },
  overallCard: { padding: 14, borderRadius: 16, backgroundColor: 'rgba(255,111,0,0.10)', marginBottom: 14 },
  label: { fontWeight: '900', fontSize: 15 },
  scoreLine: { marginTop: 8, gap: 3 },
  score: { fontSize: 20, fontWeight: '900' },
  community: { fontSize: 16, opacity: 0.72, fontWeight: '700' },
  delta: { fontSize: 21, fontWeight: '900', marginTop: 7 },
  comment: { opacity: 0.72, marginTop: 5, lineHeight: 19 },
  metric: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(128,128,128,0.18)' },
  metricTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  metricLabel: { fontWeight: '900', fontSize: 15 },
  metricValues: { opacity: 0.78, fontWeight: '700' },
  metricDelta: { fontWeight: '900', marginTop: 4 },
  section: { paddingTop: 16 },
  sectionTitle: { fontWeight: '900', fontSize: 16 },
  badge: { alignSelf: 'flex-start', marginTop: 9, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: 'rgba(255,111,0,0.16)', color: '#FF6F00', fontWeight: '900' },
  fun: { marginTop: 16, padding: 13, borderRadius: 14, backgroundColor: 'rgba(88,214,141,0.12)' },
  funText: { marginTop: 5, fontWeight: '700' },
  actions: { justifyContent: 'space-between', flexWrap: 'wrap' },
});
