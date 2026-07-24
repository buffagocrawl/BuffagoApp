import Constants from 'expo-constants';
import { Platform } from 'react-native';

/** Test mode is opt-in, non-production, and never grants authorization. */
export const CAYENNE_TEST_MODE =
  __DEV__ &&
  Constants.expoConfig?.extra?.cayenneTestMode === true &&
  Constants.expoConfig?.extra?.environment !== 'production';

export const cayenneClock = (fallback: Date = new Date()): Date => {
  if (!CAYENNE_TEST_MODE) return fallback;
  const raw = Constants.expoConfig?.extra?.cayenneFixedNow;
  const parsed = raw ? new Date(raw) : fallback;
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
};

export const cayenneRuntimeInfo = () => ({
  enabled: CAYENNE_TEST_MODE,
  platform: Platform.OS,
  environment: Constants.expoConfig?.extra?.environment ?? 'unknown',
});

