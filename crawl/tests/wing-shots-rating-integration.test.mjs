import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const crawl = readFileSync(new URL('../app/crawl/[id].jsx', import.meta.url), 'utf8');
const home = readFileSync(new URL('../app/(tabs)/home/index.jsx', import.meta.url), 'utf8');

test('authenticated crawl ratings use canonical provenance and prompt only on server eligibility', () => {
  assert.match(crawl, /submit_validated_crawl_rating/);
  assert.match(crawl, /ratingResult\?\.accepted/);
  assert.match(crawl, /ratingResult\?\.wing_shot_eligible/);
  assert.match(crawl, /ratingResult\?\.rating_id/);
  assert.match(crawl, /wingShotFlags\.prompt/);
  assert.match(crawl, /setWingShotVisible\(true\)/);
});

test('Home uses an idempotent server rating transaction while guests remain ineligible', () => {
  assert.match(home, /submit_validated_restaurant_rating/);
  assert.match(home, /p_operation_id: operationId/);
  assert.match(home, /Guest ratings remain supported but are never Wing Shot eligible/);
  assert.match(home, /ratingResult\?\.wing_shot_eligible/);
  assert.match(home, /wingShotFlags\.prompt/);
});

test('skip closes only media flow and explicitly preserves the saved rating', () => {
  for (const source of [crawl, home]) {
    assert.match(source, /wing_shot_prompt_skipped/);
    assert.match(source, /rating_remains_saved: true/);
  }
});

test('BuffaCoin onboarding imported administrative and unverified paths cannot reach the prompt seam', () => {
  for (const source of [crawl, home]) {
    assert.doesNotMatch(source, /is_buffacoin[\s\S]{0,500}setWingShotVisible\(true\)/);
    assert.doesNotMatch(source, /onboarding[\s\S]{0,500}setWingShotVisible\(true\)/i);
    assert.doesNotMatch(source, /imported[\s\S]{0,500}setWingShotVisible\(true\)/i);
  }
});
