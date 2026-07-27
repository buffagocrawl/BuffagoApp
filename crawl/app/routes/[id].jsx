// app/routes/[id].jsx
import React, { useMemo, useState, useCallback } from 'react';
import { View, Text } from 'react-native';
import {
  Dialog,
  Portal,
  Button,
  Divider,
  ActivityIndicator,
  useTheme,
} from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useRouteStops } from '../../hooks/useRoutes';
import { routeDistanceKm } from '../../utils/distance';

const fmt1 = (n) => (Number.isFinite(Number(n)) ? Number(n).toFixed(1) : '—');
const toStr = (v) => (Array.isArray(v) ? v[0] : v) ?? undefined;

export default function RouteDetail() {
  const router = useRouter();

  const { id: idParam, title: titleParam, returnTo: returnToParam } = useLocalSearchParams();
  const routeId = toStr(idParam);
  const passedTitle = toStr(titleParam);
  const returnTo = toStr(returnToParam);

  const { colors, dark } = useTheme();

  const themed = useMemo(
    () => ({
      bg: colors.background,
      textPrimary: colors.onSurface,
      textMuted: dark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)',
    }),
    [colors, dark]
  );

  // Data
  const { data: stops = [], isLoading } = useRouteStops(routeId);

  // Single dialog + “mode”
  const [open, setOpen] = useState(true);
  // Distance
  const km = useMemo(() => Number(routeDistanceKm(stops)) || 0, [stops]);
  const mi = km * 0.621371;

  // Title resolution
  const resolvedTitle =
    passedTitle ||
    stops?.[0]?.route?.title ||
    stops?.[0]?.routes?.title ||
    'Selected Crawl';

  // Close behavior
  const onClose = useCallback(() => {
    setOpen(false);

    requestAnimationFrame(() => {
      if (returnTo && typeof returnTo === 'string') {
        router.replace({ pathname: returnTo, params: { r: Date.now().toString() } });
        return;
      }
      if (typeof router.canGoBack === 'function' && router.canGoBack()) {
        router.back();
        return;
      }
      router.replace('/routes');
    });
  }, [returnTo, router]);

  const saveSelectedRoute = useCallback(async () => {
    if (!routeId) return;
    if (!stops.length) return;

    const destDto = (s) =>
      s?.destination
        ? {
            id: s.destination.id,
            name: s.destination.name,
            address: s.destination.address,
            city: s.destination.city,
            lat: s.destination.lat ?? null,
            lng: s.destination.lng ?? null,
          }
        : null;

    const stop1 = destDto(stops[0]);

    const payload = {
      id: routeId,
      title: resolvedTitle,
      stop1,
      startOrd: 1,
      startDestination: stop1,
      stopsOrdered: stops.map(destDto),
      savedAt: new Date().toISOString(),
    };

    await AsyncStorage.setItem('buffago:selectedRoute', JSON.stringify(payload));

    // ✅ kill the dialog BEFORE navigating so nothing “reopens”
    setOpen(false);

    requestAnimationFrame(() => {
      router.replace({ pathname: '/home', params: { r: Date.now().toString() } });
    });
  }, [routeId, stops, resolvedTitle, router]);

  const summaryLine = isLoading
    ? 'Loading…'
    : !stops.length
    ? 'No stops found for this route.'
    : `Stops: ${stops.length} • ~${fmt1(mi)} mi total`;

  return (
    <View style={{ flex: 1, backgroundColor: themed.bg }}>
      <Portal>
        <Dialog
          visible={open}
          onDismiss={onClose}
          style={{ alignSelf: 'center', width: '92%', maxWidth: 520, borderRadius: 16 }}
        >
          <Dialog.Title style={{ textAlign: 'center', color: themed.textPrimary }}>{resolvedTitle}</Dialog.Title>

          <Dialog.Content>
            {isLoading ? (
              <View style={{ alignItems: 'center', paddingVertical: 12 }}>
                <ActivityIndicator />
              </View>
            ) : (
              <>
                <Text style={{ opacity: 0.7, marginBottom: 10, color: themed.textMuted }}>
                  {summaryLine}
                </Text>

                <Divider style={{ marginBottom: 10 }} />

                <Text style={{ opacity: 0.75, color: themed.textMuted }}>
                  Selecting this route will start you at the first stop.
                </Text>
              </>
            )}
          </Dialog.Content>

          <Dialog.Actions style={{ gap: 8 }}>
            <Button
              mode="contained"
              onPress={saveSelectedRoute}
              disabled={isLoading || !stops.length}
            >
              Select this route
            </Button>

            <Button onPress={onClose}>Close</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}
