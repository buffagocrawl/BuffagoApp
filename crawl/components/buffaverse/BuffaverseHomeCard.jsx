import React, { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { trackEvent } from '../../lib/analytics';

export default function BuffaverseHomeCard({ level, title, xp, objective, onPress }) {
  useEffect(() => {
    trackEvent({ eventName: 'buffaverse_card_viewed', screen: 'home', metadata: { surface: 'home_progress_card' } });
  }, []);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Open your Buffaverse progress" onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.copy}>
        <Text style={styles.eyebrow}>YOUR BUFFAVERSE</Text>
        <Text style={styles.title}>Level {level} · {title || 'Wing Scout'}</Text>
        <Text style={styles.body}>{objective || 'See what your next wing adventure is.'}</Text>
      </View>
      <View style={styles.xp}><Text style={styles.xpValue}>{Number(xp || 0)}</Text><Text style={styles.xpLabel}>XP</Text></View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 12, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.13)', backgroundColor: 'rgba(255,122,24,0.12)', flexDirection: 'row', alignItems: 'center', gap: 12 },
  pressed: { opacity: 0.82 },
  copy: { flex: 1 },
  eyebrow: { fontSize: 10, letterSpacing: 1.4, fontWeight: '900', opacity: 0.7 },
  title: { marginTop: 4, fontSize: 16, fontWeight: '900' },
  body: { marginTop: 4, opacity: 0.75 },
  xp: { minWidth: 48, alignItems: 'center' },
  xpValue: { fontSize: 19, fontWeight: '900' },
  xpLabel: { fontSize: 10, letterSpacing: 1, opacity: 0.7 },
});
