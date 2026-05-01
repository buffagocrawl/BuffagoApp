// app/routes/[id].jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
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
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';

import { useRouteStops } from '../../hooks/useRoutes';
import { getWalkingPath } from '../../utils/walkRoute';
import { routeDistanceKm } from '../../utils/distance';

/* ---------- tiny marker badge ---------- */
function OrderBadge({ n }) {
  return (
    <View
      style={{
        width: 26,
        height: 26,
        borderRadius: 13,
        backgroundColor: '#0B64C0',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: '#fff', fontWeight: '900', fontSize: 12 }}>{n}</Text>
    </View>
  );
}

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
  const [mode, setMode] = useState('details'); // 'details' | 'map'

  // Map preview state
  const [mapCoords, setMapCoords] = useState([]);
  const [mapPath, setMapPath] = useState([]);
  const mapRef = useRef(null);
  const [previewKey, setPreviewKey] = useState(0);

  // Distance
  const km = useMemo(() => Number(routeDistanceKm(stops)) || 0, [stops]);
  const mi = km * 0.621371;

  // Coordinates
  const coords = useMemo(
    () =>
      (stops || [])
        .map((s) => s?.destination)
        .filter(
          (d) =>
            d &&
            d.lat != null &&
            d.lng != null &&
            Number.isFinite(Number(d.lat)) &&
            Number.isFinite(Number(d.lng))
        )
        .map((d) => ({ latitude: Number(d.lat), longitude: Number(d.lng) })),
    [stops]
  );

  // Region
  const region = useMemo(
    () =>
      coords.length
        ? {
            latitude: coords[0].latitude,
            longitude: coords[0].longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          }
        : {
            latitude: 41.7677,
            longitude: -72.6748,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
          },
    [coords]
  );

  // Title resolution
  const resolvedTitle =
    passedTitle ||
    stops?.[0]?.route?.title ||
    stops?.[0]?.routes?.title ||
    'Selected Crawl';

  const fitPreviewMap = useCallback(() => {
    const coordsToFit = mapPath.length >= 2 ? mapPath : mapCoords;
    if (mapRef.current && coordsToFit.length >= 2) {
      mapRef.current.fitToCoordinates(coordsToFit, {
        edgePadding: { top: 60, right: 60, bottom: 60, left: 60 },
        animated: false,
      });
    }
  }, [mapCoords, mapPath]);

  const buildMapPreview = useCallback(async () => {
    if (!coords.length) {
      setMapCoords([]);
      setMapPath([]);
      return;
    }
    setMapCoords(coords);
    try {
      const path = await getWalkingPath(coords);
      setMapPath(Array.isArray(path) && path.length ? path : []);
    } catch {
      setMapPath([]);
    }
  }, [coords]);

  // When switching into map mode, build preview once
  useEffect(() => {
    let alive = true;

    (async () => {
      if (mode !== 'map') return;
      setPreviewKey((k) => k + 1);
      await buildMapPreview();
      if (!alive) return;
      // Fit after a tick
      requestAnimationFrame(() => fitPreviewMap());
    })();

    return () => {
      alive = false;
    };
  }, [mode, buildMapPreview, fitPreviewMap]);

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
          <Dialog.Title style={{ textAlign: 'center', color: themed.textPrimary }}>
            {mode === 'map' ? 'Map preview' : resolvedTitle}
          </Dialog.Title>

          <Dialog.Content>
            {isLoading ? (
              <View style={{ alignItems: 'center', paddingVertical: 12 }}>
                <ActivityIndicator />
              </View>
            ) : mode === 'map' ? (
              !stops.length ? (
                <Text style={{ color: themed.textPrimary }}>No stops to preview.</Text>
              ) : (
                <View style={{ height: 360, borderRadius: 12, overflow: 'hidden' }}>
                  <MapView
                    key={`preview-${previewKey}-${routeId || 'none'}`}
                    ref={mapRef}
                    style={{ flex: 1 }}
                    provider={PROVIDER_GOOGLE}
                    initialRegion={region}
                    onMapReady={fitPreviewMap}
                    onLayout={fitPreviewMap}
                  >
                    {mapPath.length >= 2 ? (
                      <Polyline
                        coordinates={mapPath}
                        strokeWidth={5}
                        strokeColor="#FF6F00"
                        lineDashPattern={[10, 7]}
                        lineCap="round"
                        lineJoin="round"
                      />
                    ) : (
                      mapCoords.length >= 2 && (
                        <Polyline
                          coordinates={mapCoords}
                          strokeWidth={5}
                          strokeColor="#FF6F00"
                          lineDashPattern={[10, 7]}
                          lineCap="round"
                          lineJoin="round"
                          geodesic
                        />
                      )
                    )}

                    {stops
                      .filter((s) => s?.destination?.lat != null && s?.destination?.lng != null)
                      .map((s, idx) => {
                        const latitude = Number(s.destination.lat);
                        const longitude = Number(s.destination.lng);
                        return (
                          <Marker
                            key={s.destination.id || `${latitude}-${longitude}-${idx}`}
                            coordinate={{ latitude, longitude }}
                            title={`${idx + 1}. ${s.destination.name}`}
                            description={s.destination.address}
                          >
                            <OrderBadge n={idx + 1} />
                          </Marker>
                        );
                      })}
                  </MapView>
                </View>
              )
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
            {mode === 'map' ? (
              <Button mode="outlined" onPress={() => setMode('details')}>
                Back
              </Button>
            ) : (
              <Button
                mode="outlined"
                onPress={() => setMode('map')}
                disabled={isLoading || !stops.length}
              >
                Map preview
              </Button>
            )}

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
