import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createGuestRatingPreview,
  loadGuestRatingPreview,
  saveGuestRatingPreview,
} from '../lib/guestRatingPreview.js';
import { submitBuffacoinRatingTransaction } from '../lib/buffacoinRatingTransaction.js';
import {
  evaluateMarketingPublication,
  assertMarketingPublicationAllowed,
} from '../lib/marketingPublicationGate.js';

const migration = readFileSync(
  new URL('../supabase/migrations/20260729153000_serrano_trust_repair.sql', import.meta.url),
  'utf8'
);

test('atomic transaction owns debit crawl rating and idempotency', () => {
  const fn = migration.match(/create or replace function public\.submit_buffacoin_rating_v1[\s\S]*?\n\$\$;/)?.[0] || '';
  assert.match(fn, /auth\.uid\(\)/);
  assert.match(fn, /pg_advisory_xact_lock/);
  assert.match(fn, /for update/);
  assert.match(fn, /balance<p_coin_cost/);
  assert.match(fn, /insert into public\.buffacoin_ledger/);
  assert.match(fn, /insert into public\.destination_ratings/);
  assert.match(fn, /insert into public\.buffacoin_rating_operations/);
  assert.match(migration, /destination_ratings_buffacoin_operation_unique/);
  assert.match(migration, /buffacoin_rating_requires_atomic_transaction/);
});

test('legacy authenticated Buffacoin calls are revoked and reconciliation is service-only', () => {
  assert.match(migration, /revoke execute on function public\.buffacoins_spend_for_wingdex[\s\S]*from authenticated/);
  assert.match(migration, /revoke execute on function public\.buffacoins_get_or_create_token_crawl[\s\S]*from authenticated/);
  assert.match(migration, /revoke all on public\.buffacoin_rating_reconciliation from public,anon,authenticated/);
  assert.match(migration, /grant select on public\.buffacoin_rating_reconciliation to service_role/);
});

test('client rejects ambiguous committed results', async () => {
  const supabase = { rpc: async () => ({ data: { operation_id: 'op' }, error: null }) };
  await assert.rejects(
    submitBuffacoinRatingTransaction({
      supabase, operationId: 'op', destinationId: 'd', stateCode: 'NY',
      coinCost: 1, rating: {},
    }),
    /ambiguous_transaction_result/
  );
});

test('guest preview is versioned stable and retained by storage', async () => {
  const values = new Map();
  const storage = {
    setItem: async (key, value) => values.set(key, value),
    getItem: async (key) => values.get(key) ?? null,
    removeItem: async (key) => values.delete(key),
  };
  const preview = createGuestRatingPreview({ overall: 9 }, 'stable-client-id', '2026-07-29T00:00:00Z');
  await saveGuestRatingPreview(storage, preview);
  assert.deepEqual(await loadGuestRatingPreview(storage), preview);
  assert.equal(preview.schema_version, 1);
  assert.equal(preview.status, 'local_preview');
});

test('every marketing gate and human approval fails closed', () => {
  const all = {
    freshness: true, provenance: true, localization: true, persistence: true,
    media_validation: true, mock_content: true, contradiction: true,
  };
  for (const gate of Object.keys(all)) {
    const result = evaluateMarketingPublication({
      gates: { ...all, [gate]: false },
      approval: { decision: 'approved', reviewer_id: 'reviewer', approved_at: 'now' },
    });
    assert.equal(result.publication_allowed, false, gate);
  }
  assert.throws(() => assertMarketingPublicationAllowed({ gates: all }), /human_approval_missing/);
  assert.equal(evaluateMarketingPublication({
    gates: all,
    approval: { decision: 'approved', reviewer_id: 'reviewer', approved_at: 'now' },
  }).publication_allowed, true);
});
