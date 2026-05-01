// lib/supabase.js
import './polyfills';    
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

/** ──────────────────────────────────────────────────────────────────────────
 *  HARD-CODE OVERRIDES (leave empty unless testing)
 *  ───────────────────────────────────────────────────────────────────────── */
const HARDCODE_URL = ''; // Example: 'https://your-project.supabase.co'
const HARDCODE_KEY = ''; // Example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'

/** Sanitize .env values */
function sanitize(raw) {
  if (!raw) return '';
  let v = String(raw);

  // Strip BOM
  if (v.charCodeAt(0) === 0xFEFF) v = v.slice(1);

  // Normalize line endings and trim
  v = v.replace(/\r\n/g, '\n').trim();

  // Remove surrounding quotes
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1).trim();
  }

  // Replace literal \n with actual newlines
  v = v.replace(/\\n/g, '\n');

  return v;
}

/** Load and sanitize env values */
const RAW_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const RAW_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

const ENV_URL = sanitize(RAW_URL);
const ENV_KEY = sanitize(RAW_KEY);

/** Final values (hardcoded wins if non-empty) */
const SUPABASE_URL = HARDCODE_URL && HARDCODE_URL.length > 0 ? HARDCODE_URL : ENV_URL;
const SUPABASE_ANON_KEY = HARDCODE_KEY && HARDCODE_KEY.length > 0 ? HARDCODE_KEY : ENV_KEY;

/** Config flags */
const USE_PROXY = (process.env.EXPO_PUBLIC_USE_PROXY || '').toLowerCase() === 'true';
const STRICT_ENV = (process.env.EXPO_PUBLIC_STRICT_ENV || '').toLowerCase() === 'true';

/** JWT validator */
function dotCount(str) {
  return (String(str).match(/\./g) || []).length;
}
function isLikelyJwt(key) {
  return typeof key === 'string' && dotCount(key) >= 2;
}

/** Diagnostics 
try {
  console.log('[Supabase DIAG raw]', {
    urlPresent: !!RAW_URL,
    keyLen: RAW_KEY.length,
    keyDots: dotCount(RAW_KEY),
  });
  console.log('[Supabase DIAG env.cleaned]', {
    urlPresent: !!ENV_URL,
    keyLen: ENV_KEY.length,
    keyDots: dotCount(ENV_KEY),
    keyPreview: ENV_KEY ? `${ENV_KEY.slice(0, 6)}…${ENV_KEY.slice(-4)}` : '—',
  });
  console.log('[Supabase DIAG final]', {
    source: HARDCODE_KEY.length > 0 || HARDCODE_URL.length > 0 ? 'HARDCODE' : 'ENV',
    urlPresent: !!SUPABASE_URL,
    keyLen: SUPABASE_ANON_KEY.length,
    keyDots: dotCount(SUPABASE_ANON_KEY),
    keyPreview: SUPABASE_ANON_KEY ? `${SUPABASE_ANON_KEY.slice(0, 6)}…${SUPABASE_ANON_KEY.slice(-4)}` : '—',
    proxy: USE_PROXY,
  });
} catch (e) {
  console.warn('[Supabase DIAG error]', e);
}
*/

/** Strict mode validation */
const problems = [];
if (!SUPABASE_URL) problems.push('missing URL');
if (!SUPABASE_ANON_KEY) problems.push('missing anon key');
if (SUPABASE_ANON_KEY && !isLikelyJwt(SUPABASE_ANON_KEY)) {
  problems.push('anon key does not look like a JWT (needs 2 dots)');
}
if (problems.length > 0 && typeof __DEV__ !== 'undefined' && __DEV__ && STRICT_ENV) {
  throw new Error(`Supabase env invalid: ${problems.join(', ')}. Check your .env formatting.`);
}

/** Create Supabase client */
export const supabase = createClient(
  SUPABASE_URL || 'https://example.invalid',
  SUPABASE_ANON_KEY || 'invalid',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storage: AsyncStorage,
      detectSessionInUrl: false,
    },
    global: {
      headers: { 'X-Client-Info': 'buffago-app' },
    },
  }
);
