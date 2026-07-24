import React from 'react';
import { Pressable, Share, StyleSheet, View } from 'react-native';
import { Button, ProgressBar, Text } from 'react-native-paper';
import { buildLegendaryShareMessage } from './LegendaryExperience';

const ORANGE = '#FF6B2C';
const GOLD = '#F2B705';
const INK = '#17110E';

const remaining = (minutes) => {
  if (minutes <= 0) return 'Ending now';
  if (minutes < 60) return `${minutes}m left`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m left`;
};

export function LegendaryHomeHero({ event, onOpenMission, onRate }) {
  if (!event) return null;
  return (
    <View
      accessible
      accessibilityLabel={`Legendary right now at ${event.restaurantName}. ${event.reason}. ${remaining(event.minutesRemaining)}.`}
      style={styles.hero}
      testID="legendary-home-hero"
    >
      <View style={styles.eyebrowRow}>
        <Text style={styles.eyebrow}>✦ LEGENDARY RIGHT NOW</Text>
        <Text accessibilityLabel={`${remaining(event.minutesRemaining)} remaining`} style={styles.timer}>
          {remaining(event.minutesRemaining)}
        </Text>
      </View>
      <Text accessibilityRole="header" style={styles.title}>{event.restaurantName}</Text>
      <Text style={styles.reason}>{event.reason}</Text>
      <Text style={styles.mission}>Taste the wings. Rate this stop before the window closes.</Text>
      <ProgressBar progress={0} color={GOLD} style={styles.progress} accessibilityLabel="Mission not yet complete" />
      <View style={styles.actionRow}>
        <Button mode="contained" onPress={onRate} style={styles.primary} accessibilityLabel={`Rate wings at ${event.restaurantName}`}>
          Rate wings to finish
        </Button>
        <Button mode="text" textColor="#FFF7E9" onPress={onOpenMission} accessibilityLabel={`Open ${event.restaurantName} Legendary details`}>
          Why Legendary?
        </Button>
      </View>
      <Text style={styles.disclaimer}>{event.sponsorshipDisclaimer}</Text>
    </View>
  );
}

export function LegendaryMapMarker({ event, selected = false, onPress }) {
  if (!event) return null;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`Legendary restaurant, ${event.restaurantName}, ${remaining(event.minutesRemaining)}`}
      style={[styles.marker, selected && styles.markerSelected]}
      testID={`legendary-map-marker-${event.restaurantId}`}
    >
      <Text style={styles.markerGlyph}>✦</Text>
      <Text style={styles.markerText}>LEGENDARY</Text>
    </Pressable>
  );
}

export function LegendaryDetailBanner({ event, onRate }) {
  if (!event) return null;
  const share = () => Share.share({ message: buildLegendaryShareMessage(event, false) });
  return (
    <View style={styles.detail} testID="legendary-restaurant-detail">
      <View style={styles.eyebrowRow}>
        <Text style={styles.detailEyebrow}>✦ BUFFAGO LEGENDARY</Text>
        <Text style={styles.detailTimer}>{remaining(event.minutesRemaining)}</Text>
      </View>
      <Text accessibilityRole="header" style={styles.detailTitle}>One rating completes this local mission.</Text>
      <Text style={styles.detailReason}>{event.reason}</Text>
      <View style={styles.actionRow}>
        <Button mode="contained" onPress={onRate} style={styles.primary} accessibilityLabel={`Rate ${event.restaurantName} and complete Legendary mission`}>
          Rate to complete
        </Button>
        <Button mode="outlined" onPress={share} textColor={INK} accessibilityLabel={`Share ${event.restaurantName} Legendary discovery`}>
          Share the find
        </Button>
      </View>
      <Text style={styles.detailDisclaimer}>{event.sponsorshipDisclaimer}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: INK, borderRadius: 24, padding: 18, marginBottom: 16, overflow: 'hidden' },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  eyebrow: { color: '#FFDFA7', fontWeight: '900', letterSpacing: 1, fontSize: 12 },
  timer: { color: GOLD, fontWeight: '900', fontSize: 14 },
  title: { color: '#FFF7E9', fontWeight: '900', fontSize: 28, lineHeight: 32, marginTop: 14 },
  reason: { color: '#F6EADF', fontSize: 16, lineHeight: 22, marginTop: 6 },
  mission: { color: '#FFFFFF', fontWeight: '800', fontSize: 15, lineHeight: 21, marginTop: 14 },
  progress: { height: 8, borderRadius: 8, backgroundColor: '#49382D', marginTop: 12 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 14 },
  primary: { backgroundColor: ORANGE, borderRadius: 12 },
  disclaimer: { color: '#B9AEA6', fontSize: 10, marginTop: 12 },
  marker: { minWidth: 64, paddingHorizontal: 7, paddingVertical: 6, borderRadius: 15, borderWidth: 3, borderColor: '#FFFFFF', backgroundColor: ORANGE, alignItems: 'center' },
  markerSelected: { backgroundColor: GOLD, transform: [{ scale: 1.08 }] },
  markerGlyph: { color: INK, fontSize: 22, lineHeight: 23, fontWeight: '900' },
  markerText: { color: INK, fontSize: 7, lineHeight: 9, letterSpacing: 0.4, fontWeight: '900' },
  detail: { backgroundColor: '#FFF1D6', borderColor: GOLD, borderWidth: 1, borderRadius: 20, padding: 16, marginTop: 12, marginBottom: 4 },
  detailEyebrow: { color: '#9A3A0F', fontSize: 11, letterSpacing: 1, fontWeight: '900' },
  detailTimer: { color: '#9A3A0F', fontWeight: '900' },
  detailTitle: { color: INK, fontSize: 20, lineHeight: 25, fontWeight: '900', marginTop: 10 },
  detailReason: { color: '#5E4030', fontSize: 15, lineHeight: 21, marginTop: 5 },
  detailDisclaimer: { color: '#755E50', fontSize: 10, marginTop: 10 },
});
