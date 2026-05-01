import React from 'react';
import { SafeAreaView, StyleSheet, Image, View } from 'react-native';
import { Text, Button, Card, Chip, useTheme, Divider } from 'react-native-paper';

export default function HomeScreen() {
  const { colors } = useTheme();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      {/* Header / Logo */}
      <View style={styles.header}>
        <Image
          source={require('../../assets/images/buffago-logo.png')}
          resizeMode="contain"
          style={styles.logo}
        />
        <Text variant="headlineSmall" style={[styles.title, { color: colors.onSurface }]}>
          BuffaGo
        </Text>
        <Text variant="bodyMedium" style={[styles.subtitle, { color: colors.onSurface, opacity: 0.8 }]}>
          Wing crawls for teams — fast, fun, fair.
        </Text>
      </View>

      {/* Featured CTA */}
      <Card style={styles.heroCard} mode="elevated">
        <Card.Content>
          <Text variant="titleLarge" style={styles.heroTitle}>Closest Route Start</Text>
          <Text variant="bodyMedium" style={styles.heroCopy}>
            Head to the first stop and kick off your crawl.
          </Text>
          <Button
            mode="contained"
            style={styles.cta}
            onPress={() => {/* navigate to location check */}}
          >
            Start Nearby
          </Button>

          <View style={styles.heroChips}>
            <Chip compact style={styles.chip}>3–5 stops</Chip>
            <Chip compact style={styles.chip}>≤ 1.5 miles</Chip>
            <Chip compact style={styles.chip}>Public scores</Chip>
          </View>
        </Card.Content>
      </Card>

      {/* Quick actions */}
      <View style={styles.row}>
        <Card style={styles.card} mode="elevated">
          <Card.Content>
            <Text variant="titleMedium">Browse Routes</Text>
            <Text variant="bodySmall" style={styles.muted}>
              Pick a manual route in your city.
            </Text>
            <Button mode="elevated" style={styles.btn} onPress={() => {/* navigate */}}>
              View Routes
            </Button>
          </Card.Content>
        </Card>

        <Card style={styles.card} mode="elevated">
          <Card.Content>
            <Text variant="titleMedium">Ratings</Text>
            <Text variant="bodySmall" style={styles.muted}>
              See top wing spots near you.
            </Text>
            <Button mode="elevated" style={styles.btn} onPress={() => {/* navigate */}}>
              Open Ratings
            </Button>
          </Card.Content>
        </Card>
      </View>

      {/* Subtle brand bar */}
      <Divider style={[styles.brandBar, { backgroundColor: colors.tertiary }]} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, padding: 20, gap: 16 },
  header: { alignItems: 'center', gap: 8, marginTop: 4, marginBottom: 4 },
  logo: { width: 180, height: 60 },
  title: { fontWeight: '800', letterSpacing: 0.5 },
  subtitle: { textAlign: 'center' },

  heroCard: { borderRadius: 18 },
  heroTitle: { marginBottom: 6, fontWeight: '700' },
  heroCopy: { opacity: 0.9, marginBottom: 10 },
  cta: { borderRadius: 12, paddingVertical: 6 },
  heroChips: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  chip: { borderRadius: 999 },

  row: { flexDirection: 'row', gap: 12 },
  card: { flex: 1, borderRadius: 16 },
  btn: { marginTop: 8, borderRadius: 12 },
  muted: { opacity: 0.8, marginTop: 2 },

  brandBar: { height: 6, borderRadius: 999, marginTop: 6 },
});
