import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = (name) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const crawl = root('app/crawl/[id].jsx');
const home = root('app/(tabs)/home/index.jsx');
const ratings = root('app/(tabs)/ratings/index.jsx');
const profile = root('components/creator/WingCreatorSummaryCard.jsx');
const onboarding = root('components/OnboardingFlow.tsx');
const client = root('lib/wingShots.js');
const sql = root('supabase/migrations/20260729140000_wing_shots_unrestricted_sources.sql');

test('remote and admin-bypassed rating results both receive the optional prompt', () => {
  assert.match(crawl, /ratingResult\?\.accepted/);
  assert.doesNotMatch(crawl, /ratingResult\?\.wing_shot_eligible/);
  assert.doesNotMatch(home, /ratingResult\?\.wing_shot_eligible/);
  assert.match(crawl, /submissionSource="rating"/);
  assert.match(home, /submissionSource="rating"/);
});

test('independent sources are intentional and restaurant selection is searchable', () => {
  for (const [source, content] of [['buffacoin', ratings], ['profile', profile], ['home_cta', home], ['onboarding', onboarding]]) {
    assert.match(content, new RegExp(`source=${source}`));
  }
  assert.match(root('components/wingShots/WingShotComposer.tsx'), /ilike\('name'/);
});

test('rating and media are independent while source and restaurant are persisted', () => {
  assert.doesNotMatch(client, /An eligible rating is required/);
  assert.match(client, /destinationId/);
  assert.match(client, /submissionSource/);
  assert.match(sql, /alter column rating_id drop not null/);
  assert.match(sql, /submission_source/);
  assert.doesNotMatch(sql, /wing_shot_rating_is_eligible/);
  assert.match(sql, /rating_not_found/);
});

test('authentication and moderation boundaries remain server enforced', () => {
  assert.match(sql, /authentication_required/);
  assert.match(sql, /storage\.objects/);
  assert.match(sql, /object_id|owner_id = v_user_id::text/);
  assert.match(sql, /status','uploaded/);
  assert.doesNotMatch(sql, /approved.*insert into public\.wing_media_submissions/i);
  assert.match(root('supabase/migrations/20260729122000_wing_shots_creator_rewards.sql'), /approved/);
});
