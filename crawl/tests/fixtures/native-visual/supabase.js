import { createClient } from '@supabase/supabase-js';
import { Image } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
const round3QA = typeof process !== 'undefined' && process.env.EXPO_PUBLIC_BUFFAGO_NATIVE_ROUND3_QA === '1';
const coinQA = typeof process !== 'undefined' && process.env.EXPO_PUBLIC_BUFFAGO_NATIVE_COIN_QA;
const homeUnratedQA = typeof process !== 'undefined' && process.env.EXPO_PUBLIC_BUFFAGO_NATIVE_HOME_UNRATED_QA === '1';
const wingPhotoAsset = require('../../../assets/wing-user.png');
const logoPhotoAsset = require('../../../assets/logo/BuffaGo-master.png');
const assetUri = (asset) => typeof asset === 'number' ? Image.resolveAssetSource(asset)?.uri : typeof asset === 'string' ? asset : asset?.uri || asset?.default?.uri || asset?.default || null;
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
if (coinQA) destinations.forEach((destination, index) => { destination.address = `${index + 1} Fixture Street, Buffalo, NY 14201`; });
const ratings = destinations.map((d, i) => ({ id: `fixture-rating-${i}`, user_id: i === 0 ? other : uid, destination_id: d.id, weight_score: 96.73 - i, overall: 9, crispiness: 8, meat: 8, sauce: 9, wings_eaten: 12345, wings_qty: 12, created_at: now, is_buffacoin: false, destinations: d, destination: d }));
if (homeUnratedQA) ratings[1].user_id = other;
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
  wing_jury_photo_vote_counts: [{ submission_id: 'fixture-history-1', like_count: 7, dislike_count: 2, neutral_count: 3 }],
};
// Four-issue bonus screenshots: synthetic committed ledger rows only.
const bonusQA = process.env.EXPO_PUBLIC_BUFFAGO_NATIVE_BONUS_QA;
if (['welcome', 'early-bird'].includes(bonusQA)) {
  const welcome = bonusQA === 'welcome';
  tables.buffacoin_ledger = [{ id: `fixture-${bonusQA}-bonus`, user_id: uid,
    delta: welcome ? 100 : 250,
    reason: welcome ? 'Welcome Bonus — 100 BuffaCoins' : 'Early Bird Bonus — 250 BuffaCoins' }];
  tables.buffacoin_wallets[0].balance = welcome ? 100 : 12595;
}
const rpc = {
  get_my_wing_submission_history: ['in_review', 'approved', 'rejected'].map((status, index) => ({ submission_id: `fixture-history-${index}`, destination_id: destinations[0].id, destination_name: destinations[0].name, destination_city: 'Buffalo', media_type: 'photo', internal_status: status, display_status: ['In Review', 'Approved', 'Rejected'][index], created_at: `2026-10-0${8 - index}T12:00:00Z`, preview_available: true, user_caption: 'Isolated synthetic QA Wing Shot', attribution_preference: 'anonymous' })),
  get_public_challenge_stats: [{ total_completed: 12345, this_week_completed: 12, current_weekly_streak: 123, best_weekly_streak: 234 }],
  get_wing_creator_stats: [{ creator_xp: 12345, approved_submissions: 123, featured_submissions: 12 }],
  get_wing_shots_feature_flags: ['wing_shots_enabled', 'wing_shots_creator_stats_enabled', 'wing_shots_gallery_enabled', 'wing_shot_prompt', 'wing_shot_photo_upload'].map(flag_key => ({ flag_key, enabled_for_user: true })),
  get_random_fun_fact: [{ text: 'QA fixture: flats and drums.' }],
  get_safe_social_profile: [{ user_id: uid, username: 'QA Wing Explorer', level: 4, xp: 1250 }],
};
// Synthetic server state persists independently of the real client operation
// record so a fixture app restart can recover a lost-response receipt.
const coinFixtureKey = 'native-visual:coin-server:round3-v1';
let coinFixture;
async function fixtureCoinState() {
  if (!coinFixture) coinFixture = JSON.parse(await AsyncStorage.getItem(coinFixtureKey) || 'null') || { balance: 12345, receipts: {}, paidRows: [] };
  tables.buffacoin_wallets[0].balance = coinFixture.balance;
  tables.destination_ratings = [...ratings, ...(coinFixture.paidRows || [])];
  for (const paid of coinFixture.paidRows || []) {
    const index = savedWantToTry.findIndex(row => row.destination_id === paid.destination_id);
    if (index >= 0) savedWantToTry.splice(index, 1);
  }
  return coinFixture;
}
async function fixtureFetch(input, options = {}) {
  const url = new URL(typeof input === 'string' ? input : input.url);
  if (url.hostname !== 'native-fixture.invalid') throw new Error('Fixture network boundary blocked');
  if (round3QA && coinQA && !guestQA) await fixtureCoinState();
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
    payload = { ok: true, feed_version: 2, photos, has_more: false, next_cursor: null, location_fallback: true };
  } else if (url.pathname.includes('/functions/v1/wing-jury-vote')) {
    payload = { ok: true, status: 'recorded', submission_id: 'fixture-jury-photo-1', vote: Number(JSON.parse(options.body || '{}').vote), like_count: 12, existing_vote: false };
  } else if (url.pathname.includes('/functions/v1/wing-media-preview')) {
    payload = { ok: true, signed_url: assetUri(wingPhotoAsset), expires_in_seconds: 3600 };
  } else if (url.pathname.includes('/functions/v1/wing-jury-reveal')) {
    const destination = ratedJuryQA ? destinations[1] : destinations[0];
    payload = { ok: true, restaurant: destination, photo_like_count: 12, restaurant_rating: { average_weight_score: ratedJuryQA ? 91.4 : null, rating_count: ratedJuryQA ? 3 : 0 }, personal_rating: ratedJuryQA ? { weight_score: 94.2, created_at: now } : null, favorite: savedFavorites.some(row => row.destination_id === destination.id), want_to_try: savedWantToTry.some(row => row.destination_id === destination.id), save_action: guestQA ? 'sign_in_to_save' : (ratedJuryQA ? 'favorite' : 'want_to_try') };
  } else if (url.pathname.includes('/functions/v1/wingman-intake')) {
    // Only the invalid-host development fixture creates this in-memory spot.
    const body = JSON.parse(options.body || '{}');
    const name = body.restaurant || 'QA New Wingman Wings';
    if (body.action === 'insertDestination') {
      const destination = { id: 'fixture-wingman-created', destination_id: 'fixture-wingman-created',
        name, city: 'Buffalo', state_id: 1, address: '4 Fixture Street', lat: 42.8874, lng: -78.8784 };
      if (!destinations.some(row => row.id === destination.id)) destinations.push(destination);
      payload = { destination };
    } else payload = { normalized_name: name, city: 'Buffalo', state: 'NY',
      address: '4 Fixture Street', lat: 42.8874, lng: -78.8784,
      confidence: 0.99, is_real_restaurant: true, wings_probability: 0.99,
      category: 'Restaurant', reasoning: 'Isolated QA fixture' };
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
    if (name === 'submit_buffacoin_rating_v1' && round3QA && coinQA && !guestQA) {
      const body = JSON.parse(options.body || '{}');
      const state = await fixtureCoinState();
      const previous = state.receipts[body.p_operation_id];
      if (previous) return new Response(JSON.stringify([previous]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      if (coinQA === 'rejected') return new Response(JSON.stringify({ code: '42703', message: 'column c.created_at does not exist' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      if (!body.p_operation_id || !Number.isInteger(body.p_coin_cost) || body.p_coin_cost < 1 || state.balance < body.p_coin_cost) return new Response(JSON.stringify({ code: 'P0001', message: 'insufficient_balance' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      state.balance -= body.p_coin_cost;
      const receipt = { operation_id: body.p_operation_id, rating_id: `fixture-paid-${body.p_operation_id}`, crawl_id: 'fixture-paid-crawl', debit_ledger_id: `fixture-debit-${body.p_operation_id}`, new_balance: state.balance };
      state.receipts[body.p_operation_id] = receipt;
      const destination = destinations.find(row => row.id === body.p_destination_id);
      state.paidRows ||= [];
      state.paidRows.push({ ...body.p_rating, id: receipt.rating_id, user_id: uid, destination_id: body.p_destination_id,
        is_buffacoin: true, buffacoin_operation_id: body.p_operation_id, weight_score: Number(body.p_rating.overall) * 10, created_at: now,
        destinations: destination, destination });
      await AsyncStorage.setItem(coinFixtureKey, JSON.stringify(state));
      tables.buffacoin_wallets[0].balance = state.balance;
      if (coinQA === 'lost-response') throw new TypeError('Fixture response lost after commit');
      return new Response(JSON.stringify([receipt]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (name === 'request_wing_media_access' && round3QA && !guestQA) return new Response(JSON.stringify({ request_id: 'fixture-preview-request' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (!name.startsWith('get_') && name !== 'daily_xp_status') return new Response(JSON.stringify({ message: 'Fixture writes blocked' }), { status: 403 });
    if (name === 'get_my_wing_shot_jury_counts') payload = guestQA ? [] : tables.wing_jury_photo_vote_counts.filter(row => (JSON.parse(options.body || '{}').p_submission_ids || []).includes(row.submission_id));
    else if (name === 'get_my_wing_submission_detail') payload = guestQA ? [] : rpc.get_my_wing_submission_history.filter(row => row.submission_id === JSON.parse(options.body || '{}').p_submission_id);
    else payload = guestQA && name === 'get_my_wing_submission_history' ? [] : rpc[name] || [];
  } else {
    const table = url.pathname.split('/').pop();
    // Explicit Round 3 fixture only: mutate the existing collections in memory.
    // The invalid-host boundary above prevents any production request.
    if (round3QA && !guestQA && ['user_destination_favorites', 'user_want_to_try'].includes(table) && ['POST', 'DELETE'].includes(method)) {
      const rows = tables[table];
      if (method === 'POST') {
        const row = JSON.parse(options.body || '{}');
        if (row.user_id !== uid) return new Response('{}', { status: 403 });
        const rated = ratings.some(rating => rating.user_id === uid && rating.destination_id === row.destination_id);
        if ((table === 'user_destination_favorites') !== rated) return new Response(JSON.stringify({ message: rated ? 'want_to_try_requires_unrated_restaurant' : 'favorite_requires_existing_rating' }), { status: 400 });
        if (!rows.some(old => old.destination_id === row.destination_id)) rows.push({ ...row, created_at: now });
      } else {
        if (url.searchParams.get('user_id') !== `eq.${uid}`) return new Response('{}', { status: 403 });
        const id = url.searchParams.get('destination_id')?.slice(3);
        const index = rows.findIndex(row => row.destination_id === id);
        if (index >= 0) rows.splice(index, 1);
      }
      return new Response(null, { status: 204 });
    }
    if (!['GET', 'HEAD'].includes(method)) return new Response(JSON.stringify({ message: 'Fixture writes blocked' }), { status: 403 });
    payload = tables[url.pathname.split('/').pop()] || [];
    for (const [key, val] of url.searchParams) {
      if (val.startsWith('eq.')) payload = payload.filter(row => String(row[key]) === val.slice(3));
      if (val.startsWith('ilike.')) payload = payload.filter(row => String(row[key] || '').toLowerCase().includes(val.slice(6).replace(/%/g, '').toLowerCase()));
      if (val.startsWith('in.')) payload = payload.filter(row => val.slice(3).replace(/[()]/g, '').split(',').includes(String(row[key])));
    }
    const accept = new Headers(options.headers).get('Accept') || '';
    if (accept.includes('object+json')) payload = payload[0] || null;
  }
  const total = Array.isArray(payload) ? payload.length : 1;
  return new Response(method === 'HEAD' ? null : JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json', 'Content-Range': `0-${Math.max(0, total - 1)}/${total}` } });
}
export const supabase = createClient('https://native-fixture.invalid', 'fixture.anonymous.key', { auth: { storageKey: 'native-visual-fixture-session', storage: { getItem: async () => guestQA ? null : saved, setItem: async (_key, value) => { saved = value; }, removeItem: async () => { saved = null; } }, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: fixtureFetch } });
