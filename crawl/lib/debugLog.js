import { supabase } from './supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DEVICE_KEY = 'buffago:debug_device_id';
const SENSITIVE_KEY = /^(access_?token|refresh_?token|token|code|secret|client_?secret|password|authorization|apikey|anon_?key|state)$/i;
const URL_LIKE_KEY = /url|uri|redirect/i;

function sanitizeUrl(raw) {
  try {
    const parsed = new URL(String(raw));
    for (const key of [...parsed.searchParams.keys()]) {
      if (SENSITIVE_KEY.test(key)) parsed.searchParams.set(key, '[redacted]');
    }
    if (parsed.hash) {
      const fragment = new URLSearchParams(parsed.hash.replace(/^#/, ''));
      for (const key of [...fragment.keys()]) {
        if (SENSITIVE_KEY.test(key)) fragment.set(key, '[redacted]');
      }
      parsed.hash = fragment.toString();
    }
    return parsed.toString();
  } catch {
    return '[invalid-url]';
  }
}

function sanitizeDetail(value, key = '', depth = 0) {
  if (depth > 6) return '[max-depth]';
  if (SENSITIVE_KEY.test(key)) return '[redacted]';
  if (typeof value === 'string') {
    if (URL_LIKE_KEY.test(key) || /^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return sanitizeUrl(value);
    return value.length > 1000 ? `${value.slice(0, 1000)}…` : value;
  }
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitizeDetail(item, key, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [
        childKey,
        sanitizeDetail(childValue, childKey, depth + 1),
      ])
    );
  }
  return value;
}

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

    const safeDetail = sanitizeDetail(detail ?? {});

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
