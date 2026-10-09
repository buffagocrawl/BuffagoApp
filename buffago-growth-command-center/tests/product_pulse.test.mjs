import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

// Reuse the repository's pinned PostgreSQL test runtime; no runtime dependency
// is added to the Raspberry Pi application.
const require = createRequire(new URL('../../crawl/package.json', import.meta.url));
const { PGlite } = require('@electric-sql/pglite');
const migration = readFileSync(new URL('../supabase/migrations/20261008130000_growth_command_center_redesign.sql', import.meta.url), 'utf8');
const baseline = readFileSync(new URL('./fixtures/deployed_snapshot.sql', import.meta.url), 'utf8');

test('Product Pulse RPC: mobile devices, calendar MAU, totals, monthly history, alerts and compatibility', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table user_events(anonymous_id text, user_id text, event_name text, platform text, occurred_at timestamptz);
      create table wing_media_submissions(media_type text, status text);
      create table destination_ratings(created_at timestamptz);
      create table destinations(id int);
      create table users(created_at timestamptz);
      create table "00_Open_Work"(source text, status text, item_count int);
      create table user_feedback(status text, created_at timestamptz);
      create table buffago_store_metrics_daily(platform text, downloads_total int, downloads_daily int,
        store_rating numeric, store_rating_count int, metric_date date, fetched_at timestamptz);
    `);
    await db.exec(baseline);
    // Production already has this older helper, whose total includes non-mobile platforms.
    await db.exec(`create or replace function public.buffago_product_pulse_operations()
      returns jsonb language sql stable as $$
      select jsonb_build_object(
        'device_opens', jsonb_build_object(
          'all_time', jsonb_build_object('total', count(distinct anonymous_id),
            'ios', count(distinct anonymous_id) filter(where lower(platform)='ios'),
            'android', count(distinct anonymous_id) filter(where lower(platform)='android')),
          'last_24h', jsonb_build_object('total', count(distinct anonymous_id) filter(where occurred_at>=now()-interval '24 hours'),
            'ios', count(distinct anonymous_id) filter(where occurred_at>=now()-interval '24 hours' and lower(platform)='ios'),
            'android', count(distinct anonymous_id) filter(where occurred_at>=now()-interval '24 hours' and lower(platform)='android')),
          'previous_24h', jsonb_build_object('total', count(distinct anonymous_id) filter(where occurred_at>=now()-interval '48 hours' and occurred_at<now()-interval '24 hours'),
            'ios', count(distinct anonymous_id) filter(where occurred_at>=now()-interval '48 hours' and occurred_at<now()-interval '24 hours' and lower(platform)='ios'),
            'android', count(distinct anonymous_id) filter(where occurred_at>=now()-interval '48 hours' and occurred_at<now()-interval '24 hours' and lower(platform)='android'))),
        'pending_photos', jsonb_build_object('total', (select count(*) from wing_media_submissions where media_type='photo' and status='in_review')))
      from user_events where event_name='app_opened';
      $$;
      do $legacy$
      declare definition text := pg_get_functiondef('public.get_buffago_growth_snapshot()'::regprocedure);
      begin
        execute replace(definition, '''product_pulse'', jsonb_build_object(',
          '''product_pulse'', public.buffago_product_pulse_operations() || jsonb_build_object(');
      end;
      $legacy$;`);
    await db.exec(`revoke all on function public.buffago_product_pulse_operations() from public, anon, authenticated;
      grant execute on function public.buffago_product_pulse_operations() to service_role;`);
    await db.exec(`
      revoke all on function get_buffago_growth_snapshot() from public, anon, authenticated;
      grant execute on function get_buffago_growth_snapshot() to service_role;
    `);
    const rpcContract = async () => (await db.query(`select pg_get_userbyid(p.proowner) owner,
      p.prosecdef security_definer,
      has_function_privilege('anon',p.oid,'execute') anon_execute,
      has_function_privilege('authenticated',p.oid,'execute') authenticated_execute,
      has_function_privilege('service_role',p.oid,'execute') service_execute
      from pg_proc p where p.oid='public.get_buffago_growth_snapshot()'::regprocedure`)).rows[0];
    const rpcBefore = await rpcContract();
    await db.exec(`begin;
      insert into user_events values
        ('a', null, 'app_opened', 'IOS', now()),
        ('a', 'signed-in', 'app_opened', 'ios', now()),
        ('a', 'signed-in', 'app_opened', 'ios', now()-interval '1 hour'),
        ('a', null, 'app_opened', 'ANDROID', now()),
        ('b', null, 'app_opened', 'android', now()-interval '24 hours'),
        ('c', null, 'app_opened', 'android', now()-interval '24 hours 1 second'),
        ('d', null, 'app_opened', 'ios', now()-interval '48 hours'),
        ('e', null, 'app_opened', 'ios', now()-interval '48 hours 1 second'),
        ('track-start', null, 'app_opened', 'ios', '2026-06-15T12:00:00Z'),
        ('boundary-sep', 'september-user', 'app_opened', 'ios', '2026-10-01T03:30:00Z'),
        ('boundary-oct', 'october-user', 'app_opened', 'android', '2026-10-01T04:00:00Z'),
        ('web', null, 'app_opened', 'web', now()),
        ('unknown', null, 'app_opened', null, now()),
        ('other', null, 'app_opened', 'other', now()),
        (null, 'user-only', 'app_opened', 'android', now()),
        ('ignored', null, 'rating_created', 'ios', now());
      insert into wing_media_submissions values
        ('photo','in_review'), ('photo','in_review'), ('video','in_review'),
        ('photo','approved'), ('photo','rejected'), ('photo','withdrawn'), ('photo','failed'),
        ('photo','uploaded'), ('photo','processing'), ('photo','pending_review');
      insert into destination_ratings select now() from generate_series(1, 3);
      insert into destinations select generate_series from generate_series(1, 2);
      insert into users select now() from generate_series(1, 4);
      insert into "00_Open_Work" values ('feedback','open',2), ('contact','OPEN',3), ('route','closed',100), ('other','open',null);
    `);
    const before = (await db.query('select get_buffago_growth_snapshot() as snapshot')).rows[0].snapshot;
    await db.exec(migration);
    await db.exec(migration); // Safe to reapply; no duplicate fields or grants.
    const { rows } = await db.query('select get_buffago_growth_snapshot() as snapshot');
    const s = rows[0].snapshot;
    assert.deepEqual(await rpcContract(), rpcBefore);
    assert.deepEqual(s.product_pulse.device_opens, {
      all_time: {total: 8, ios: 5, android: 3},
      last_24h: {total: 2, ios: 1, android: 1},
      previous_24h: {total: 2, ios: 1, android: 1},
    });
    assert.deepEqual(s.product_pulse.pending_photos, {total: 2});
    assert.deepEqual(s.product_pulse.open_work, {total: 5});
    assert.deepEqual(s.product_pulse.totals, {wing_ratings: 3, restaurants: 2, accounts: 4});
    assert.equal(s.product_pulse.device_opens.all_time.total,
      s.product_pulse.device_opens.all_time.ios + s.product_pulse.device_opens.all_time.android);
    assert.ok(s.product_pulse.monthly_history.length >= 12);
    assert.ok(s.product_pulse.monthly_history[0].month <= '2026-06-01');
    assert.equal(s.product_pulse.monthly_history.at(-1).month, '2026-10-01');
    assert.ok(s.product_pulse.monthly_history.some(point => point.app_open_tracking_available));
    assert.equal(s.product_pulse.monthly_history.find(point => point.app_open_tracking_available).month, '2026-06-01');
    assert.ok(s.product_pulse.monthly_history.some(point => !point.app_open_tracking_available && point.mau === null));
    const september = s.product_pulse.monthly_history.find(point => point.month === '2026-09-01');
    const august = s.product_pulse.monthly_history.find(point => point.month === '2026-08-01');
    assert.equal(september.app_open_tracking_available, true);
    assert.equal(september.mau, 1); // 03:30 UTC is still September 30 in New York.
    assert.equal(august.app_open_tracking_available, true);
    assert.equal(august.mau, 0); // Tracked zero is distinct from unavailable null.
    assert.deepEqual(s.product_pulse.calendar_mau.previous_month,
      {month: '2026-09-01', value: 1});
    assert.equal(s.product_pulse.calendar_mau.current_month.month, '2026-10-01');
    assert.equal(s.marketing.score_version, 'v1');
    assert.ok(s.marketing.score >= 0 && s.marketing.score <= 100);
    const { device_opens, pending_photos, open_work, calendar_mau, totals, monthly_history, ...legacyPulse } = s.product_pulse;
    const { device_opens: old_devices, pending_photos: old_photos, ...old_legacy_pulse } = before.product_pulse;
    assert.deepEqual(legacyPulse, old_legacy_pulse);
    assert.equal(old_devices.all_time.total, 11); // Web, unknown and other IDs were part of the old total.
    assert.equal(old_photos.total, 2);
    assert.deepEqual(s.growth_7d, before.growth_7d);
    assert.deepEqual(s.history_14d, before.history_14d);
    assert.equal(s.product_pulse.store.ios.downloads_daily, null);
    assert.equal(s.product_pulse.store.android.downloads_daily, null);
    await db.exec('commit; truncate user_events, wing_media_submissions;');
    const empty = (await db.query('select buffago_product_pulse_growth() as pulse')).rows[0].pulse;
    assert.deepEqual(empty.device_opens.last_24h, {total: 0, ios: 0, android: 0});
    const emptySnapshot = (await db.query('select get_buffago_growth_snapshot() as snapshot')).rows[0].snapshot;
    assert.deepEqual(emptySnapshot.product_pulse.pending_photos, {total: 0});
    const permissions = (await db.query(`select
      has_function_privilege('anon','buffago_product_pulse_growth()','execute') as anon,
      has_function_privilege('authenticated','buffago_product_pulse_growth()','execute') as authenticated,
      has_function_privilege('service_role','buffago_product_pulse_growth()','execute') as service`)).rows[0];
    assert.deepEqual(permissions, {anon: false, authenticated: false, service: true});

    const contrastingHistory = Array.from({length: 12}, (_, index) => {
      const high = index >= 6;
      return {app_open_tracking_available: true,
        mau: high ? 10000 : 100, unique_devices: high ? 0 : 10000,
        wing_ratings: high ? 10000 : 100, new_accounts: high ? 0 : 10000};
    });
    const weighted = (await db.query('select public.buffago_marketing_score($1::jsonb) as score',
      [JSON.stringify(contrastingHistory)])).rows[0].score;
    assert.equal(weighted.score, 60); // (100*.40 + 0*.25 + 100*.20 + 0*.15)
    assert.deepEqual(weighted.factors, {mau: 100, acquisition: 0, engagement: 100, account_growth: 0});
    assert.match(weighted.explanation, /MAU is improving while device acquisition remains weak/);
  } finally { await db.close(); }
});
