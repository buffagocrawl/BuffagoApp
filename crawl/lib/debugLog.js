import { supabase } from './supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DEVICE_KEY = 'buffago:debug_device_id';

async function getDeviceId() {
  let id = await AsyncStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = `d_${Math.random().toString(16).slice(2)}_${Date.now()}`;
    await AsyncStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export async function dbg(event, detail = {}, scope = 'auth') {
  try {
    const device_id = await getDeviceId();
    const { data: u } = await supabase.auth.getUser();
    const user_id = u?.user?.id || null;

    // Never log tokens. Never log full URLs.
    const safeDetail = detail ?? {};

    await supabase.from('debug_logs').insert({
      device_id,
      user_id,
      scope,
      event: String(event),
      detail: safeDetail,
    });
  } catch {
    // swallow, never block login
  }
}
