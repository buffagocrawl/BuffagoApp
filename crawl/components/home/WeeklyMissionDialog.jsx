import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Dialog, Portal, Text } from 'react-native-paper';

export default function WeeklyMissionDialog({ visible, onDismiss, summary, loading, error, onRetry, onAction, tab, onTabChange }) {
  const renderContent = () => {
    if (tab === 'rewards') return summary ? <View style={styles.content}><Text style={styles.heading}>Rewards</Text><Text style={styles.sectionTitle}>{summary.reward.title}</Text><Text style={styles.body}>{summary.reward.detail}</Text></View> : <View style={styles.state}><Text style={styles.stateTitle}>Rewards are available with your next weekly mission.</Text></View>;
    if (tab === 'how') return <View style={styles.content}><Text style={styles.heading}>How it works</Text><Text style={styles.body}>Weekly missions track eligible BuffaGo activity and reset each week.</Text><Text style={styles.body}>{summary?.resetCopy || 'Open Active to check your current mission.'}</Text></View>;
    if (loading) return <View style={styles.state}><ActivityIndicator color="#FF7A18" /><Text>Loading your weekly mission…</Text></View>;
    if (error) return <View style={styles.state}><Text style={styles.stateTitle}>We couldn’t load your mission.</Text><Button mode="contained" onPress={onRetry}>Try again</Button></View>;
    if (!summary) return <View style={styles.state}><Text style={styles.stateTitle}>No weekly mission is available right now.</Text><Text style={styles.muted}>Check back after the next weekly reset.</Text></View>;
    const item = summary.mission || summary.items[0];
    const next = summary.nextMission;
    return <View style={styles.content}><View style={styles.task}><Text accessibilityRole="header" style={styles.taskLabel}>{item.complete ? '✓ ' : ''}{item.label}</Text><Text style={styles.taskDetail}>{item.detail}</Text></View><Text style={styles.progress}>Progress: {item.current} / {item.target}</Text>{summary.reward?.kind === 'xp' && Number(summary.reward.title?.match(/\d+/)?.[0]) > 0 ? <Text style={styles.reward}>Reward: {summary.reward.title}</Text> : null}<Text style={styles.reset}>{summary.resetCopy}</Text>{next ? <Button mode="contained" buttonColor="#FF7A18" onPress={() => onAction(next)}>{next.actionLabel}</Button> : <Text style={styles.complete}>All weekly goals are complete.</Text>}</View>;
  };
  return <Portal><Dialog visible={visible} onDismiss={onDismiss} style={styles.dialog} dismissable={!loading}><Dialog.Title>Weekly Mission</Dialog.Title><Dialog.Content style={styles.dialogContent}><View style={styles.tabs}>{[['active', 'Active'], ['rewards', 'Rewards'], ['how', 'How it works']].map(([key, label]) => <Button key={key} compact mode={tab === key ? 'contained-tonal' : 'text'} onPress={() => onTabChange(key)}>{label}</Button>)}</View><ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>{renderContent()}</ScrollView></Dialog.Content><Dialog.Actions><Button onPress={onDismiss}>Done</Button></Dialog.Actions></Dialog></Portal>;
}

const styles = StyleSheet.create({
  dialog: { maxHeight: '84%', backgroundColor: '#24201E' }, dialogContent: { paddingBottom: 0 }, tabs: { flexDirection: 'row', gap: 4, marginBottom: 8, flexWrap: 'wrap' }, scroll: { paddingBottom: 16 }, content: { gap: 14 }, state: { minHeight: 180, justifyContent: 'center', alignItems: 'center', gap: 14 }, stateTitle: { fontSize: 17, fontWeight: '800', textAlign: 'center' }, heading: { fontSize: 22, fontWeight: '900' }, sectionTitle: { fontSize: 18, fontWeight: '800' }, body: { lineHeight: 21 }, muted: { opacity: 0.72, lineHeight: 20 }, task: { paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.2)' }, taskLabel: { fontSize: 22, lineHeight: 28, fontWeight: '900' }, taskDetail: { marginTop: 6, fontSize: 16, lineHeight: 23, opacity: 0.82 }, progress: { fontSize: 16, fontWeight: '900', color: '#FFB36F' }, reward: { fontSize: 16, fontWeight: '800', color: '#FFB36F' }, reset: { opacity: 0.75, lineHeight: 19 }, complete: { color: '#A8E6A3', fontWeight: '800' },
});
