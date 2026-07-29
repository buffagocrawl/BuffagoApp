import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../hooks/useWingShotsFeatureFlags.js', import.meta.url),
  'utf8',
);

test('Wing Shot client feature flags fail closed and use server rollout decisions', () => {
  assert.match(source, /prompt: false/);
  assert.match(source, /photo: false/);
  assert.match(source, /video: false/);
  assert.match(source, /get_wing_shots_feature_flags/);
  assert.match(source, /row\.enabled_for_user === true/);
  assert.match(source, /catch \{[\s\S]*setFlags\(DISABLED_FLAGS\)/);
});
