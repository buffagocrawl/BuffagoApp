import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { Platform, Text, View } from 'react-native';
import Constants from 'expo-constants';
import NativeMap, { Marker as NativeMarker, Polyline as NativePolyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { fitMap, mapCoordinate, mapCoordinates, mapRegion } from './mapSafety';

export { PROVIDER_GOOGLE };
export function Marker({ coordinate, ...props }) {
  const safe = mapCoordinate(coordinate);
  return safe ? <NativeMarker {...props} coordinate={safe} /> : null;
}
export function Polyline({ coordinates, ...props }) {
  const safe = mapCoordinates(coordinates);
  return safe.length > 1 ? <NativePolyline {...props} coordinates={safe} /> : null;
}

class MapBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { console.warn('[Maps] render unavailable'); }
  render() { return this.state.failed ? <View style={[{ alignItems: 'center', justifyContent: 'center', padding: 16, backgroundColor: '#14161A' }, this.props.style]} accessibilityLabel="Map unavailable"><Text style={{ color: '#F5F6F8', textAlign: 'center' }}>Map unavailable for this location.</Text><Text style={{ color: '#A9AFB9', textAlign: 'center', marginTop: 8 }}>Close the map to continue browsing restaurants and crawls.</Text></View> : this.props.children; }
}

const SafeMap = forwardRef(function SafeMap({ initialRegion, region, provider, onMapReady, children, ...props }, ref) {
  const native = useRef(null);
  const ready = useRef(false);
  const pendingFit = useRef(null);
  const configured = Constants.expoConfig?.extra || {};
  const markerPoints = React.Children.toArray(children).map((child) => mapCoordinate(child?.props?.coordinate)).filter(Boolean);
  useImperativeHandle(ref, () => ({
    fitToCoordinates(values, options) {
      pendingFit.current = { values: mapCoordinates(values), options };
      fitMap(native.current, ready.current, pendingFit.current.values, options);
    },
    animateToRegion(value, duration) {
      const safe = mapRegion(value);
      if (!safe || !ready.current || !native.current) return;
      try { native.current.animateToRegion(safe, duration); } catch { console.warn('[Maps] location unavailable'); }
    },
  }), []);
  const safeInitial = mapRegion(markerPoints[0] || initialRegion) || { latitude: 41.7677, longitude: -72.6748, latitudeDelta: 0.4, longitudeDelta: 0.4 };
  const safeRegion = mapRegion(region);
  if (!markerPoints.length || (Platform.OS === 'android' && !configured.androidMapsConfigured)) {
    ready.current = false;
    pendingFit.current = null;
    return <View style={[{ alignItems: 'center', justifyContent: 'center', padding: 16, backgroundColor: '#14161A' }, props.style]} accessibilityLabel="Map unavailable"><Text style={{ color: '#F5F6F8', textAlign: 'center' }}>Map unavailable for this location.</Text><Text style={{ color: '#A9AFB9', textAlign: 'center', marginTop: 8 }}>Close the map to continue browsing restaurants and crawls.</Text></View>;
  }
  const safeProvider = Platform.OS === 'ios' && !configured.iosGoogleMapsConfigured ? undefined : provider;
  return <MapBoundary style={props.style}><NativeMap {...props} ref={native} provider={safeProvider} initialRegion={safeInitial}
    {...(safeRegion ? { region: safeRegion } : {})}
    onMapReady={(event) => {
      ready.current = true;
      const fit = pendingFit.current || { values: markerPoints, options: { edgePadding: { top: 60, right: 60, bottom: 60, left: 60 }, animated: false } };
      fitMap(native.current, true, fit.values, fit.options);
      try { onMapReady?.(event); } catch { console.warn('[Maps] ready callback failed'); }
    }}>{children}</NativeMap></MapBoundary>;
});
export default SafeMap;
