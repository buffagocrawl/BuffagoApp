import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const edge = readFileSync(
  new URL('../supabase/functions/delete-account/index.ts', import.meta.url),
  'utf8',
);

test('account deletion prepares and completes Wing Shot cleanup before auth deletion', () => {
  const prepare = edge.indexOf('prepare_wing_account_media_cleanup');
  const storage = edge.indexOf('.from("wing-submissions")');
  const complete = edge.indexOf('complete_wing_account_media_cleanup');
  const authDelete = edge.indexOf('admin.auth.admin.deleteUser');
  assert.ok(prepare >= 0);
  assert.ok(storage > prepare);
  assert.ok(complete > storage);
  assert.ok(authDelete > complete);
});

test('private deletion is bounded and fails closed without returning paths', () => {
  assert.match(edge, /objectPaths\.length; index \+= 100/);
  assert.match(edge, /if \(!objectsDeleted \|\| completionError\)/);
  assert.match(edge, /Private media cleanup did not complete/);
  assert.doesNotMatch(edge, /JSON\.stringify\(\{[^}]*objectPaths/);
});
