import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../hooks/useWingShotsFeatureFlags.js', import.meta.url),
  'utf8',
);

test('Wing Shot client feature flags fail closed and require resolved server decisions', () => {
  assert.match(source, /prompt: false/);
  assert.match(source, /photo: false/);
  assert.match(source, /video: false/);
  const helper = readFileSync(new URL('../lib/photoWorkflowFlags.js', import.meta.url), 'utf8');
  assert.match(helper, /get_wing_shots_feature_flags/);
  assert.match(helper, /row\.enabled_for_user === true/);
  assert.match(source, /catch \(error\) \{[\s\S]*setFlags\(DISABLED_FLAGS\)/);
  assert.match(source, /if \(required\) throw error/);
});
