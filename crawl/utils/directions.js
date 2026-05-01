// utils/directions.js
import { Linking, Platform } from 'react-native';

export function openDirections({ lat, lng, label = 'Destination', mode = 'walking' }) {
  if (lat == null || lng == null) return;

  const apple = `http://maps.apple.com/?daddr=${lat},${lng}&dirflg=${mode === 'walking' ? 'w' : 'd'}`;
  const google = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=${mode}`;

  const url = Platform.select({
    ios: apple,
    android: google,
    default: google,
  });

  Linking.openURL(url);
}
