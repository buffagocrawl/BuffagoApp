import { createClient } from '@supabase/supabase-js';
import approvedSample from './approvedPhoto';
if (!__DEV__) throw new Error('Development fixtures only');
const uid = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const now = '2026-10-08T12:00:00Z';
const user = { id: uid, aud: 'authenticated', role: 'authenticated', email: 'native-fixture@example.invalid', user_metadata: { username: 'QA Wing Explorer' }, app_metadata: { provider: 'email' } };
const token = 'eyJhbGciOiJIUzI1NiJ9.' + btoa(JSON.stringify({ sub: uid, exp: 2000000000, aud: 'authenticated', role: 'authenticated' })) + '.fixture';
const guestQA = typeof process !== 'undefined' && process.env.EXPO_PUBLIC_BUFFAGO_NATIVE_GUEST_QA === '1';
const ratedJuryQA = !(typeof process !== 'undefined' && process.env.EXPO_PUBLIC_BUFFAGO_NATIVE_JURY_UNRATED_QA === '1');
const exhaustedJuryQA = typeof process !== 'undefined' && process.env.EXPO_PUBLIC_BUFFAGO_NATIVE_JURY_EXHAUSTED_QA === '1';
const wingPhotoAsset = require('../../../assets/wing-user.png');
const logoPhotoAsset = require('../../../assets/logo/BuffaGo-master.png');
const assetUri = (asset) => typeof asset === 'string' ? asset : asset?.uri || asset?.default?.uri || asset?.default || null;
const session = { access_token: token, refresh_token: 'fixture-only', expires_at: 2000000000, expires_in: 86400, token_type: 'bearer', user };
let saved = JSON.stringify(session);
const destinations = ['QA Harbor Wings', 'QA Long Restaurant Name Buffalo Wing House & Grill', 'QA Northside Wings'].map((name, i) => ({ id: `fixture-spot-${i}`, destination_id: `fixture-spot-${i}`, name, city: 'Buffalo', state_id: 1, state_code: 'NY', address: `${i + 1} Fixture Street`, lat: 42.8874 + i * .001, lng: -78.8784 }));
if (approvedSample) {
  destinations[0] = { ...approvedSample.restaurant, destination_id: approvedSample.restaurant.id };
  for (let i = 1; i < destinations.length; i++) { destinations[i].lat = Number(destinations[0].lat) + i * .001; destinations[i].lng = Number(destinations[0].lng); }
}
if (typeof process !== 'undefined' && process.env.EXPO_PUBLIC_BUFFAGO_NATIVE_RADIUS_QA === '1') {
  for (const miles of [8, 18, 38]) {
    const id = `fixture-radius-${miles}`;
    destinations.push({ id, destination_id: id, name: `QA ${miles} Mile Wings`, city: 'Buffalo', state_id: 1, state_code: 'NY', address: `${miles} Radius Fixture Street`, lat: 42.8864 + miles / 69, lng: -78.8784 });
  }
}
const ratings = destinations.map((d, i) => ({ id: `fixture-rating-${i}`, user_id: i === 0 ? other : uid, destination_id: d.id, weight_score: 96.73 - i, overall: 9, crispiness: 8, meat: 8, sauce: 9, wings_eaten: 12345, wings_qty: 12, created_at: now, is_buffacoin: false, destinations: d, destination: d }));
const savedFavorites = [{ user_id: uid, destination_id: destinations[1].id, created_at: now }];
const savedWantToTry = [{ user_id: uid, destination_id: destinations[0].id, created_at: now }];
const routes = [{ id: 'fixture-route', title: 'QA Buffalo Classics', travel_tag_id: 1, stop1_id: destinations[0].id, stop2_id: destinations[1].id, stop3_id: destinations[2].id }];
// The resumed crawl reads PostgREST destination joins, while the list reads IDs.
// Both views describe the same three fixture stops; no writes are enabled.
for (const route of routes) {
  for (let ordinal = 1; ordinal <= 5; ordinal++) {
    route[`stop${ordinal}`] = destinations.find(destination => destination.id === route[`stop${ordinal}_id`]) || null;
  }
}
const tables = {
  destinations, destination_ratings: ratings, routes,
  states: [{ state_id: 1, state_code: 'NY', state_name: 'New York', code: 'NY', name: 'New York' }],
  users: [{ ...user, user_id: uid, username: 'QA Wing Explorer' }],
  user_with_level: [{ user_id: uid, username: 'QA Wing Explorer', level: 4, xp: 1250 }],
  level_thresholds: [{ level: 4, xp_required: 1000, level_title: 'Wing Scout' }, { level: 5, xp_required: 1500, level_title: 'Wing Ranger' }],
  users_check_home: [{ user_id: uid }], users_check_profile: [{ user_id: uid }], users_check_route: [{ user_id: uid }],
  buffacoin_wallets: [{ user_id: uid, balance: 12345 }],
  route_travel_tag: [{ id: 1, travel: 'Walking' }, { id: 2, travel: 'Walkable and Short Drive' }, { id: 3, travel: 'Drivable' }],
  crawls: [{ crawl_id: 'fixture-active', route_id: 'fixture-route', user_id: uid, status: 'in_progress', start_time: now, routes: { title: routes[0].title } }],
  v_social_feed: destinations.map(d => ({ user_id: other, username: 'QA Wing Scout', destination_id: d.id, destination_name: d.name, destination_city: 'Buffalo', destination_state_id: 1, weight_score: 96.7, created_at: now })),
  user_destination_favorites: savedFavorites,
  user_want_to_try: savedWantToTry,
};
const rpc = {
  get_public_challenge_stats: [{ total_completed: 12345, this_week_completed: 12, current_weekly_streak: 123, best_weekly_streak: 234 }],
  get_wing_creator_stats: [{ creator_xp: 12345, approved_submissions: 123, featured_submissions: 12 }],
  get_wing_shots_feature_flags: ['wing_shots_enabled', 'wing_shots_creator_stats_enabled', 'wing_shots_gallery_enabled', 'wing_shot_prompt', 'wing_shot_photo_upload'].map(flag_key => ({ flag_key, enabled_for_user: true })),
  get_random_fun_fact: [{ text: 'QA fixture: flats and drums.' }],
  get_safe_social_profile: [{ user_id: uid, username: 'QA Wing Explorer', level: 4, xp: 1250 }],
};
async function fixtureFetch(input, options = {}) {
  const url = new URL(typeof input === 'string' ? input : input.url);
  if (url.hostname !== 'native-fixture.invalid') throw new Error('Fixture network boundary blocked');
  const method = options.method || 'GET';
  let payload = [];
  if (url.pathname.includes('/auth/v1/user')) payload = guestQA ? null : user;
  else if (url.pathname.includes('/auth/v1/token')) payload = session;
  else if (url.pathname.includes('/functions/v1/wing-jury-feed')) {
    const body = JSON.parse(options.body || '{}');
    const photos = [
      { submission_id: 'fixture-jury-photo-1', signed_url: assetUri(wingPhotoAsset), media_type: 'photo', expires_at: '2099-01-01T00:00:00Z' },
      { submission_id: 'fixture-jury-photo-2', signed_url: assetUri(logoPhotoAsset), media_type: 'photo', expires_at: '2099-01-01T00:00:00Z' },
    ].filter((photo) => !(body.judged_submission_ids || []).includes(photo.submission_id));
    if (exhaustedJuryQA) photos.length = 0;
    payload = { ok: true, photos, has_more: false, next_cursor: null, location_fallback: true };
  } else if (url.pathname.includes('/functions/v1/wing-jury-vote')) {
    payload = { ok: true, status: 'recorded', submission_id: 'fixture-jury-photo-1', vote: Number(JSON.parse(options.body || '{}').vote), like_count: 12, existing_vote: false };
  } else if (url.pathname.includes('/functions/v1/wing-jury-reveal')) {
    const destination = ratedJuryQA ? destinations[1] : destinations[0];
    payload = { ok: true, restaurant: destination, photo_like_count: 12, restaurant_rating: { average_weight_score: ratedJuryQA ? 91.4 : null, rating_count: ratedJuryQA ? 3 : 0 }, personal_rating: ratedJuryQA ? { weight_score: 94.2, created_at: now } : null, favorite: ratedJuryQA, want_to_try: !ratedJuryQA, save_action: guestQA ? 'sign_in_to_save' : (ratedJuryQA ? 'favorite' : 'want_to_try') };
  } else if (url.pathname.includes('/functions/v1/wing-public-gallery')) {
    const body = JSON.parse(options.body || '{}');
    const faultQA = typeof process !== 'undefined' && process.env.EXPO_PUBLIC_BUFFAGO_NATIVE_IMAGE_FAULT_QA === '1';
    const kind = body.submission_id ? 'full' : body.include_images ? 'gallery' : 'covers';
    const fault = faultQA ? await (await fetch(`http://127.0.0.1:8084/state?kind=${kind}`)).json() : null;
    payload = { ok: true, restaurants: (body.destination_ids || []).map(destination_id => {
      if (!approvedSample || destination_id !== String(approvedSample.restaurant.id)) return { destination_id, picture_count: 0, images: [] };
      const gallery = approvedSample.gallery;
      const images = body.submission_id ? gallery.images.filter(image => image.submission_id === body.submission_id)
        : body.include_images ? gallery.images.slice(Number(body.offset) || 0, (Number(body.offset) || 0) + 60)
          : body.include_covers ? gallery.images.slice(0, 1) : [];
      return { ...gallery, images: fault ? images.map(image => ({ ...image,
        signed_url: `http://127.0.0.1:8084/image/${body.submission_id ? 'full' : 'thumb'}/${image.submission_id === 'fixture-photo-1' ? 0 : 1}/${fault.revision}.png`,
        expires_at: fault.scenario === 'expired-full' && body.submission_id ? '2000-01-01T00:00:00Z' : image.expires_at,
      })) : images };
    }) };
  } else if (url.pathname.includes('/rpc/')) {
    const name = url.pathname.split('/').pop();
    if (!name.startsWith('get_') && name !== 'daily_xp_status') return new Response(JSON.stringify({ message: 'Fixture writes blocked' }), { status: 403 });
    payload = rpc[name] || [];
  } else {
    if (!['GET', 'HEAD'].includes(method)) return new Response(JSON.stringify({ message: 'Fixture writes blocked' }), { status: 403 });
    payload = tables[url.pathname.split('/').pop()] || [];
    for (const [key, val] of url.searchParams) {
      if (val.startsWith('eq.')) payload = payload.filter(row => String(row[key]) === val.slice(3));
      if (val.startsWith('in.')) payload = payload.filter(row => val.slice(3).replace(/[()]/g, '').split(',').includes(String(row[key])));
    }
    const accept = new Headers(options.headers).get('Accept') || '';
    if (accept.includes('object+json')) payload = payload[0] || null;
  }
  const total = Array.isArray(payload) ? payload.length : 1;
  return new Response(method === 'HEAD' ? null : JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json', 'Content-Range': `0-${Math.max(0, total - 1)}/${total}` } });
}
export const supabase = createClient('https://native-fixture.invalid', 'fixture.anonymous.key', { auth: { storageKey: 'native-visual-fixture-session', storage: { getItem: async () => guestQA ? null : saved, setItem: async (_key, value) => { saved = value; }, removeItem: async () => { saved = null; } }, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: fixtureFetch } });
