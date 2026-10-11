import { Linking, Platform } from 'react-native';
import {
  HOME_NEXT_SPOT_EVENT,
  HOME_NEXT_SPOT_KEY,
  DestinationNavigationError,
  normalizeDestination,
  buildDirectionsUrl,
  openDestinationDirections as openCoreDirections,
} from './destinationNavigationCore.js';

export { HOME_NEXT_SPOT_EVENT, HOME_NEXT_SPOT_KEY, DestinationNavigationError, normalizeDestination, buildDirectionsUrl };

export function openDestinationDirections({ destination, platform = Platform.OS, openURL = (url) => Linking.openURL(url), canOpenURL = (url) => Linking.canOpenURL(url) } = {}) {
  return openCoreDirections({ destination, platform, openURL, canOpenURL });
}
