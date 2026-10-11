import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import ts from 'typescript';
const sourceRoot = new URL('../../supabase/functions/', import.meta.url);
const otherId = '22222222-2222-4222-8222-222222222222';
const photoId = '33333333-3333-4333-8333-333333333333';
const destinationId = '44444444-4444-4444-8444-444444444444';
const photo = {
  id: photoId, destination_id: destinationId, user_id: otherId,
  media_type: 'photo', status: 'approved', owner_deleted_at: null,
  withdrawn_at: null, processed_storage_path: `processed/${photoId}/primary`,
  consent_version: 'v1', consented_at: '2020-01-01T00:00:00Z',
  attribution_preference: 'anonymous', created_at: '2020-01-01T00:00:00Z',
};

function networkClient(tables = {}, overrides = {}) {
  const calls = [];
  const writes = [];
  const signedPaths = [];
  const client = {
    calls, writes, signedPaths,
    rpc: async (name, args) => {
      calls.push({ rpc: name, args });
      if (name === 'wing_jury_feed_candidates') {
        if (overrides.feedError) return { data: null, error: { message: 'private feed detail' } };
        if (overrides.feedQuery) return overrides.feedQuery(args);
        const distance = (destination) => {
          if (args.p_latitude == null || typeof destination.lat !== 'number' || typeof destination.lng !== 'number'
            || Math.abs(destination.lat) > 90 || Math.abs(destination.lng) > 180) return null;
          const radians = (value) => value * Math.PI / 180;
          const a = Math.sin(radians(destination.lat - args.p_latitude) / 2) ** 2
            + Math.cos(radians(args.p_latitude)) * Math.cos(radians(destination.lat))
            * Math.sin(radians(destination.lng - args.p_longitude) / 2) ** 2;
          return 12742000 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, a))));
        };
        const compare = (left, right) => {
          const ld = left.distance ?? Infinity; const rd = right.distance ?? Infinity;
          if (ld !== rd) return ld < rd ? -1 : 1;
          for (const key of ['destination_id', 'created_at', 'id']) {
            if (left[key] !== right[key]) return left[key] < right[key] ? -1 : 1;
          }
          return 0;
        };
        let rows = (tables.wing_media_submissions || []).flatMap((row) => {
          const destination = (tables.destinations || []).find((item) => item.id === row.destination_id);
          if (!destination) return [];
          if (args.p_user_id ? (tables.wing_jury_votes || []).some((vote) => vote.user_id === args.p_user_id && vote.submission_id === row.id)
            : args.p_judged_submission_ids.includes(row.id)) return [];
          return [{ ...row, distance: distance(destination) }];
        }).sort(compare);
        if (args.p_after_destination_id) rows = rows.filter((row) => compare(row, {
          distance: args.p_after_distance, destination_id: args.p_after_destination_id,
          created_at: args.p_after_created_at, id: args.p_after_submission_id,
        }) > 0);
        return { data: rows.slice(0, args.p_limit), error: null };
      }
      if (name === 'wing_jury_restaurant_rating_summary') {
        if (overrides.summaryError) return { data: null, error: { message: 'private summary detail' } };
        const scores = (tables.destination_ratings || []).filter((row) => row.destination_id === args.p_destination_id && row.weight_score != null).map((row) => Number(row.weight_score));
        return { data: overrides.summaryData ?? { average_weight_score: scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null, rating_count: scores.length }, error: null };
      }
      if (overrides.eligibilityError) return { data: null, error: { message: 'private eligibility detail' } };
      const data = typeof overrides.publicEligibility === 'function'
        ? await overrides.publicEligibility(args.p_submission_id)
        : overrides.publicEligibility ?? true;
      return { data, error: null };
    },
    auth: { getUser: async (token) => {
      calls.push({ authToken: token });
      return { data: { user: overrides.user ?? null }, error: overrides.authError ?? null };
    } },
    storage: { from: (bucket) => ({ createSignedUrls: async (paths) => {
      signedPaths.push({ bucket, paths });
      if (overrides.storageError) return { data: null, error: { message: 'private storage detail' } };
      return { error: null, data: paths.map((path) => ({ path, ...(overrides.missingSignedPaths?.includes(path) ? { error: 'object unavailable' } : { signedUrl: overrides.signedUrl ?? `https://project.example/storage/v1/object/sign/wing-submissions/${path}?token=signed-${signedPaths.length}` }) })) };
    } }) },
    from(table) {
      const call = { table, predicates: [], columns: null, orders: [] };
      calls.push(call);
      let single = false;
      let inserted = null;
      let limit = Infinity;
      const execute = async () => {
        if (inserted) {
          if (overrides.insertError) return { error: overrides.insertError, data: null };
          return { error: null, data: { ...inserted, created_at: '2026-10-09T00:00:00Z' } };
        }
        if (overrides.errors?.[table]) return { data: null, error: { message: 'private database detail' } };
        let rows = (tables[table] || []).filter((row) => call.predicates.every(([op, key, value]) => {
          if (op === 'eq' || op === 'is') return row[key] === value;
          if (op === 'in') return value.includes(row[key]);
          if (op === 'not') return row[key] != null;
          if (op === 'gte') return row[key] >= value;
          if (op === 'lte') return row[key] <= value;
          return true;
        }));
        rows.sort((a, b) => {
          for (const { key, options } of call.orders) {
            if (a[key] === b[key]) continue;
            const direction = options?.ascending === false ? -1 : 1;
            return (a[key] < b[key] ? -1 : 1) * direction;
          }
          return 0;
        });
        rows = rows.slice(0, limit);
        if (call.columns && call.columns !== '*') rows = rows.map((row) => Object.fromEntries(call.columns.split(',').map((key) => [key, row[key]])));
        return { error: null, data: single ? rows[0] || null : rows };
      };
      const query = {
        select(columns) { call.columns = columns; return query; },
        insert(value) { inserted = structuredClone(value); writes.push({ table, value: inserted }); return query; },
        order(key, options) { call.orders.push({ key, options: structuredClone(options) }); return query; },
        limit(value) { limit = value; return query; },
        single() { single = true; return execute(); },
        maybeSingle() { single = true; return execute(); },
        then(resolve, reject) { return execute().then(resolve, reject); },
      };
      for (const op of ['eq', 'is', 'in', 'not', 'gte', 'lte']) query[op] = (key, ...values) => {
        call.predicates.push([op, key, op === 'not' ? values[1] : values[0]]); return query;
      };
      return query;
    },
  };
  return client;
}

export function evaluate(source, requireModule, deno) {
  const module = { exports: {} };
  const result = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    reportDiagnostics: true,
  });
  assert.deepEqual(result.diagnostics, [], 'Edge source must transpile');
  vm.runInNewContext(result.outputText, {
    module, exports: module.exports, require: requireModule, Deno: deno,
    Request, Response, atob, btoa, URL, console, crypto: webcrypto, TextEncoder, TextDecoder,
  });
  return module.exports;
}

export async function boundaryFixture({ user = null, adminOverrides = {}, authOverrides = {}, tables = {} } = {}) {
  const admin = networkClient({ wing_media_submissions: [photo], ...tables }, { user, ...adminOverrides });
  const auth = networkClient(tables, authOverrides);
  const clientOptions = [];
  const deno = { env: { get: (name) => ({ SUPABASE_URL: 'https://project.example', SUPABASE_SERVICE_ROLE_KEY: 'server-secret', SUPABASE_ANON_KEY: 'public-key' })[name] } };
  const shared = evaluate(await readFile(new URL('_shared/wingJury.ts', sourceRoot), 'utf8'), () => ({ createClient: (_url, key, options) => {
    clientOptions.push({ key, options }); return key === 'server-secret' ? admin : auth;
  } }), deno);
  return {
    shared, admin, auth, clientOptions,
    async handler(name) {
      let handler;
      evaluate(await readFile(new URL(`${name}/index.ts`, sourceRoot), 'utf8'), () => shared, { ...deno, serve: (value) => { handler = value; } });
      return handler;
    },
  };
}

export function request(body, token = 'verified-user-token', method = 'POST') {
  return new Request('https://edge.example/wing-jury', {
    method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' },
    ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
  });
}

