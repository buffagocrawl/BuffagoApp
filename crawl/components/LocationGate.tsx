import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button, Card, useTheme } from 'react-native-paper';
import { useLocationCtx } from '../providers/LocationProvider';
import { openLocationSettings } from '../providers/LocationProvider';

export default function LocationGate({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  const { status, askPermission } = useLocationCtx();

  if (status === 'granted') return children;

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]}>
      <Card style={styles.card} mode="elevated">
        <Card.Content>
          <Text variant="titleLarge" style={styles.title}>Enable Location</Text>
          <Text variant="bodyMedium" style={{ opacity: 0.85, marginBottom: 12 }}>
            BuffaGo uses your location to find nearby routes and verify stop check-ins.
          </Text>
          {status === 'unknown' ? (
            <Button mode="contained" onPress={askPermission} style={styles.btn}>Allow Location</Button>
          ) : (
            <>
              <Button mode="contained" onPress={openLocationSettings} style={styles.btn}>
                Open Settings
              </Button>
              <Button mode="text" onPress={askPermission}>Try Again</Button>
            </>
          )}
        </Card.Content>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { width: '100%', borderRadius: 18 },
  title: { fontWeight: '700', marginBottom: 6 },
  btn: { borderRadius: 12, marginTop: 6 },
});
