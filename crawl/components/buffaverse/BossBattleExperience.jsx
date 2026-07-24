import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { projectBossBattle } from '../../lib/buffaverse/bossBattles';

function BattleCard({ fixture }) {
  const battle = projectBossBattle(fixture);
  const disabled = battle.state === 'expired';
  return <View accessible accessibilityRole="summary" accessibilityLabel={`${battle.title} at ${battle.restaurantName}`} style={styles.card}>
    <Text style={styles.eyebrow}>{battle.state === 'live' ? 'LIVE BOSS BATTLE' : battle.state.replace('_', ' ').toUpperCase()}</Text>
    <Text style={styles.title}>{battle.title}</Text>
    <Text style={styles.restaurant}>{battle.restaurantName}</Text>
    <Text style={styles.copy}>Your mission: complete {battle.target} qualifying actions. Community progress is shown only from verified activity.</Text>
    <Text accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: battle.target, now: battle.progress }}>{battle.progress}/{battle.target} personal progress · {battle.communityProgress}/{battle.communityTarget} community</Text>
    <Pressable disabled={disabled} accessibilityRole="button" accessibilityState={{ disabled }} style={[styles.button, disabled && styles.disabled]} onPress={() => {}}><Text style={styles.buttonText}>{battle.cta}</Text></Pressable>
  </View>;
}

export function BossBattleShowcaseHarness({ fixtures }) {
  return <ScrollView contentContainerStyle={styles.container} accessibilityLabel="Restaurant Boss Battle showcase"><Text style={styles.heading}>Restaurant Boss Battles</Text><Text style={styles.intro}>A time-bounded community mission. Counts are verified, and rewards remain pending references until separately settled.</Text>{fixtures.map((fixture) => <BattleCard key={fixture.id} fixture={fixture} />)}</ScrollView>;
}

const styles = StyleSheet.create({ container: { padding: 20, gap: 14 }, heading: { fontSize: 28, fontWeight: '800' }, intro: { fontSize: 16, lineHeight: 23 }, card: { borderRadius: 18, borderWidth: 1, borderColor: '#eadfce', backgroundColor: '#fffaf3', padding: 16, gap: 8 }, eyebrow: { fontSize: 12, fontWeight: '800', color: '#a94b22', letterSpacing: 1 }, title: { fontSize: 21, fontWeight: '800' }, restaurant: { fontSize: 16, fontWeight: '600' }, copy: { fontSize: 14, lineHeight: 20 }, button: { backgroundColor: '#1e3a34', padding: 13, borderRadius: 12, alignItems: 'center', marginTop: 4 }, disabled: { opacity: 0.45 }, buttonText: { color: '#fff', fontWeight: '800' } });
