import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const root = new URL('..', import.meta.url);
const copy = fs.readFileSync(new URL('./lib/wingShots.js', root), 'utf8');
const flow = fs.readFileSync(new URL('./components/wingShots/WingShotFlow.tsx', root), 'utf8');
const migration = fs.readFileSync(new URL('./supabase/migrations/20260729200000_duplicate_media_classification.sql', root), 'utf8');
const mango = fs.readFileSync(new URL('../Agents/Mango Habanero/src/main.jsx', root), 'utf8');

test('duplicate processing copy is explicit and never calls it an upload failure', () => {
  assert.match(copy, /DUPLICATE_MEDIA/);
  assert.match(copy, /Duplicate video/);
  assert.match(copy, /Choose a different video/);
  assert.match(copy, /another Wing Shot/);
  assert.doesNotMatch(copy.slice(copy.indexOf('export function wingShotProcessingCopy')), /Upload failed/);
  assert.match(flow, /testID="wing-shot\.choose-different-video"/);
});

test('exact identity is server-authoritative and approximate fingerprints stay separate', () => {
  assert.match(migration, /register_wing_exact_media/);
  assert.match(migration, /sha256/);
  assert.match(migration, /size_bytes/);
  assert.match(migration, /DUPLICATE_MEDIA/);
  assert.match(migration, /2f55fb57-b8e7-4d34-8a29-db3e24ee76b2/);
  assert.doesNotMatch(migration, /update public\.wing_media_submissions[\s\S]{0,300}where status = 'invalid'/i);
});

test('owner and Mango surfaces expose sanitized duplicate state only', () => {
  assert.match(migration, /Duplicate video/);
  assert.match(migration, /This clip matches a previous Wing Shot/);
  assert.doesNotMatch(migration.slice(migration.indexOf('create or replace function public.get_my_wing_submission_detail')), /matched_submission|other_user|signed_url/i);
  assert.match(mango, /Status: Duplicate media/);
  assert.match(mango, /Exact duplicate detected/);
  assert.match(mango, /No publication occurred/);
});

