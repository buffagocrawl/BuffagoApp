import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from '../lib/platformMap';
import { buildMapPreviewRegion, prepareMapPreview } from '../utils/mapPreview';

class MapPreviewBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) { console.warn('[map-preview] render_failed', { category: 'render_failed', message: error?.message || 'unknown' }); }
  render() { return this.state.failed ? <MapPreviewFallback /> : this.props.children; }
}

export function MapPreviewFallback() {
  return <View testID="map-preview-fallback" style={styles.fallback}><Text style={styles.copy}>Map preview is unavailable for this route. You can still open the full route.</Text></View>;
}

export default function RouteMapPreview({ stops, path, onMapReady, mapRef, previewKey }) {
  const preview = prepareMapPreview(stops);
  const safePath = prepareMapPreview(path).coordinates;
  const region = buildMapPreviewRegion(safePath.length >= 2 ? safePath : preview.coordinates);
  if (!region || preview.coordinates.length === 0) return <MapPreviewFallback />;
  return <MapPreviewBoundary><View style={styles.map}><MapView key={`preview-${previewKey}`} ref={mapRef} style={StyleSheet.absoluteFill} provider={PROVIDER_GOOGLE} initialRegion={region} onMapReady={onMapReady} onError={(event) => console.warn('[map-preview] native_error', { category: 'native_error', message: event?.nativeEvent?.error || 'unknown' })}>
    {safePath.length >= 2 ? <Polyline coordinates={safePath} strokeWidth={5} strokeColor="#FF6F00" lineDashPattern={[10, 7]} /> : preview.canRenderPolyline ? <Polyline coordinates={preview.coordinates} strokeWidth={5} strokeColor="#FF6F00" lineDashPattern={[10, 7]} geodesic /> : null}
    {preview.coordinateStops.map(({ stop, coordinate, stopIndex }) => <Marker key={stop.id || `${coordinate.latitude}-${coordinate.longitude}-${stopIndex}`} coordinate={coordinate} title={`${stopIndex + 1}. ${stop.name || 'Stop'}`} description={stop.address || undefined} />)}
  </MapView></View></MapPreviewBoundary>;
}

const styles = StyleSheet.create({ map: { height: 360, borderRadius: 12, overflow: 'hidden' }, fallback: { minHeight: 180, padding: 20, justifyContent: 'center', alignItems: 'center' }, copy: { textAlign: 'center' } });
