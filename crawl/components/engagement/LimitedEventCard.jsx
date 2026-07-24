import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

export default function LimitedEventCard({ event, onPress }) {
  if (!event) return null;
  const ends = new Date(event.ends_at);
  const timeLabel = Number.isNaN(ends.getTime())
    ? 'Limited time'
    : `Ends ${ends.toLocaleDateString(undefined, { weekday: 'short' })}`;
  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>LIVE WING EVENT · {timeLabel.toUpperCase()}</Text>
      <Text style={styles.title}>{event.title}</Text>
      <Text style={styles.body}>{event.description}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${event.cta_label}. Open ${event.title}`}
        onPress={onPress}
        style={({ pressed }) => [styles.button, pressed && { opacity: 0.82 }]}
      >
        <Text style={styles.buttonText}>{event.cta_label}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(242,201,76,0.55)',
    backgroundColor: 'rgba(242,201,76,0.08)',
    padding: 14,
  },
  eyebrow: { color: '#F2C94C', fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  title: { color: '#FFF', fontSize: 18, fontWeight: '900', marginTop: 5 },
  body: { color: 'rgba(255,255,255,0.75)', marginTop: 4, lineHeight: 18 },
  button: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: '#F2C94C',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  buttonText: { color: '#1A1203', fontWeight: '900' },
});
