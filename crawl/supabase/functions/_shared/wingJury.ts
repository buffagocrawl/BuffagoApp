// @ts-nocheck
// Shared trusted boundary helpers for the local-only Wing Jury Edge Functions.
// These functions must be deployed together with the staged Phase 2B SQL.
// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

export function respond(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: HEADERS });
}

export async function readJuryBody(request: Request) {
  try {
    const declared = request.headers.get('content-length');
    if (declared && (!/^\d+$/.test(declared) || Number(declared) > 32768)) return null;
    if (!request.body) return null;
    const reader = request.body.getReader();
    const chunks = []; let length = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.byteLength;
      if (length > 32768) { await reader.cancel(); return null; }
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    return body && typeof body === 'object' && !Array.isArray(body) ? body : null;
  } catch { return null; }
}

export function readToken(request: Request) {
  const value = request.headers.get('Authorization') || '';
  return value.startsWith('Bearer ') ? value.slice(7).trim() : null;
}

export async function createBoundary(request: Request) {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !serviceKey || !anonKey) throw new Error('missing_supabase_secrets');
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const token = readToken(request);
  const authClient = token ? createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } }) : null;
  let user = null;
  if (token) {
    const result = await admin.auth.getUser(token);
    if (!result.error) user = result.data?.user || null;
  }
  return { admin, authClient, user };
}

export function isValidCoordinate(latitude: unknown, longitude: unknown) {
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return false;
  const lat = latitude; const lng = longitude;
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

export function canonicalProcessedPath(id: string) { return `processed/${id}/primary`; }
export function canonicalThumbnailPath(id: string) { return `thumbnails/${id}/preview`; }

// Only the canonical signed object on this project's Storage endpoint may be
// released. A successful signing response alone does not validate its URL.
export function safeJurySignedUrl(value: unknown, path: string) {
  try {
    if (typeof value !== 'string') return null;
    const base = new URL(Deno.env.get('SUPABASE_URL'));
    const url = new URL(value);
    const local = ['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname);
    if (url.origin !== base.origin || (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))
      || url.username || url.password || url.hash
      || url.pathname !== `/storage/v1/object/sign/wing-submissions/${path}`
      || !url.searchParams.get('token')) return null;
    return url.href;
  } catch { return null; }
}

// The service-role-only RPC is the shared database/Edge eligibility authority.
// Storage schema exposure and signing success are not eligibility checks.
export async function isPublicPhoto(admin: any, submissionId: string) {
  const result = await admin.rpc('is_public_wing_jury_photo', { p_submission_id: submissionId });
  if (result.error || typeof result.data !== 'boolean') throw new Error('photo_eligibility_unavailable');
  return result.data;
}

export function hasPublicPhotoMetadata(data: any) {
  const consentTime = typeof data?.consented_at === 'string' ? Date.parse(data.consented_at) : NaN;
  return Boolean(data && UUID.test(data.id) && UUID.test(data.destination_id) && data.media_type === 'photo' && data.status === 'approved'
    && !data.owner_deleted_at && !data.withdrawn_at && data.user_id
    && data.processed_storage_path === canonicalProcessedPath(data.id)
    && typeof data.consent_version === 'string' && data.consent_version.trim()
    && Number.isFinite(consentTime) && consentTime <= Date.now()
    && ['username', 'display_name', 'anonymous'].includes(data.attribution_preference));
}

const CURSOR_LIFETIME_MS = 15 * 60 * 1000;
async function cursorKey() {
  const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!secret) throw new Error('missing_cursor_secret');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`wing-jury-cursor-v1:${secret}`));
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
function cursorContext(user: any, latitude: number | null, longitude: number | null) {
  return new TextEncoder().encode(JSON.stringify({ version: 1, principal: user?.id && !user.is_anonymous ? user.id : 'guest', latitude, longitude }));
}
export async function encodeJuryCursor(position: any, user: any, latitude: number | null, longitude: number | null) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify({ ...position, expires_at: Date.now() + CURSOR_LIFETIME_MS }));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: cursorContext(user, latitude, longitude) }, await cursorKey(), data));
  const bytes = new Uint8Array(iv.length + encrypted.length); bytes.set(iv); bytes.set(encrypted, iv.length);
  return btoa(String.fromCharCode(...bytes));
}
export async function decodeJuryCursor(value: unknown, user: any, latitude: number | null, longitude: number | null) {
  if (value == null) return null;
  if (typeof value !== 'string' || !value || value.length > 4096) throw new Error('invalid_cursor');
  try {
    const bytes = Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
    if (bytes.length < 29) throw new Error('invalid_cursor');
    const clear = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12), additionalData: cursorContext(user, latitude, longitude) }, await cursorKey(), bytes.slice(12));
    const cursor = JSON.parse(new TextDecoder().decode(clear));
    if (!UUID.test(cursor.destination_id) || !UUID.test(cursor.submission_id)
      || typeof cursor.created_at !== 'string' || !Number.isFinite(Date.parse(cursor.created_at))
      || !(cursor.distance === null || (typeof cursor.distance === 'number' && Number.isFinite(cursor.distance) && cursor.distance >= 0))
      || typeof cursor.expires_at !== 'number' || cursor.expires_at <= Date.now()
      || cursor.expires_at > Date.now() + CURSOR_LIFETIME_MS) throw new Error('invalid_cursor');
    return cursor;
  } catch { throw new Error('invalid_cursor'); }
}

export async function eligiblePhoto(admin: any, submissionId: string) {
  if (!UUID.test(submissionId)) return null;
  const { data, error } = await admin.from('wing_media_submissions')
    .select('id,destination_id,media_type,status,processed_storage_path,thumbnail_storage_path,owner_deleted_at,withdrawn_at,user_id,consent_version,consented_at,attribution_preference,created_at')
    .eq('id', submissionId).maybeSingle();
  if (error || !hasPublicPhotoMetadata(data) || !await isPublicPhoto(admin, submissionId)) return null;
  const expiresAt = new Date(Date.now() + 300000).toISOString();
  const signed = await admin.storage.from('wing-submissions').createSignedUrls([data.processed_storage_path], 300);
  const signedUrl = safeJurySignedUrl(signed.data?.[0]?.signedUrl, data.processed_storage_path);
  if (signed.error || !signedUrl || !await isPublicPhoto(admin, submissionId)) return null;
  return { ...data, signed_url: signedUrl, expires_at: expiresAt };
}

export function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number) {
  const radius = 6371000; const rad = (value: number) => value * Math.PI / 180;
  const dLat = rad(bLat - aLat); const dLng = rad(bLng - aLng);
  const a = Math.max(0, Math.min(1, Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2));
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
