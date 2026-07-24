import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

// Web has no native map or background geofence runtime. Keep route screens
// usable and make the platform limitation visible without loading native code.
const WebMap = ({ children, style, ...props }) => (
  <View accessibilityRole="image" accessibilityLabel="Map unavailable on web" style={[styles.map, style]} {...props}>
    <Text style={styles.title}>Map available in the BuffaGo mobile app</Text>
    <Text style={styles.body}>Web does not support native maps or background proximity reminders.</Text>
    {children}
  </View>
);

const WebMarker = ({ children }) => <>{children}</>;
const WebPolyline = () => null;

export const Marker = WebMarker;
export const Polyline = WebPolyline;
export const PROVIDER_GOOGLE = undefined;
export default WebMap;

const styles = StyleSheet.create({
  map: {
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#eef1f3',
  },
  title: { color: '#182026', fontWeight: '700', textAlign: 'center' },
  body: { color: '#52606b', marginTop: 8, textAlign: 'center' },
});
