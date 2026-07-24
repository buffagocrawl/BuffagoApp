import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const INSTALLATION_KEY = '@buffago/push-installation-id/v1';

export async function getInstallationId() {
  const existing = await AsyncStorage.getItem(INSTALLATION_KEY);
  if (existing) return existing;
  const created = Crypto.randomUUID();
  await AsyncStorage.setItem(INSTALLATION_KEY, created);
  return created;
}

export function mapPermissionStatus(status) {
  if (status?.granted) return 'granted';
  if (status?.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) return 'provisional';
  if (status?.canAskAgain === false) return 'denied';
  return 'undetermined';
}

export async function getPushPermissionState() {
  return mapPermissionStatus(await Notifications.getPermissionsAsync());
}

export async function registerPushInstallation(supabase, { requestPermission = false } = {}) {
  if (!supabase?.rpc) throw new Error('A Supabase client is required');
  let permission = await Notifications.getPermissionsAsync();
  if (requestPermission && !permission.granted && permission.canAskAgain) {
    permission = await Notifications.requestPermissionsAsync();
  }
  const permissionStatus = mapPermissionStatus(permission);
  let token = null;
  if (permissionStatus === 'granted' || permissionStatus === 'provisional') {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) throw new Error('Expo project ID is unavailable');
    token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  }
  const installationId = await getInstallationId();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const locale = Intl.DateTimeFormat().resolvedOptions().locale || 'und';
  const { data, error } = await supabase.rpc('register_push_installation', {
    p_installation_id: installationId,
    p_expo_push_token: token,
    p_platform: Platform.OS,
    p_app_version: Constants.expoConfig?.version || 'unknown',
    p_locale: locale,
    p_timezone: timezone,
    p_permission_status: permissionStatus,
  });
  if (error) throw new Error('Push registration failed', { cause: error });
  return { installationId, permissionStatus, registered: Boolean(token), data };
}

export async function refreshPushRegistration(supabase) {
  return registerPushInstallation(supabase, { requestPermission: false });
}
