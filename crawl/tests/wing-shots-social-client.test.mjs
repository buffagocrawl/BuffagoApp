import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const client = readFileSync(new URL('../lib/socialCommunity.js', import.meta.url), 'utf8');
const card = readFileSync(new URL('../components/wingShots/WingShotsPromoCard.jsx', import.meta.url), 'utf8');
const onboarding = readFileSync(new URL('../components/OnboardingFlow.tsx', import.meta.url), 'utf8');
const analytics = readFileSync(new URL('../lib/analyticsSchema.js', import.meta.url), 'utf8');

test('social CTA uses server-timed visit RPCs and never claims a verified follow', () => {
  assert.match(client, /start_social_community_visit/);
  assert.match(client, /complete_social_community_visit/);
  assert.match(client, /externalOpenConfirmed: true/);
  assert.match(client, /pending\.externalOpenConfirmed !== true/);
  assert.match(card, /does not claim this verifies a follow/);
  assert.doesNotMatch(card, /verified follower/i);
});

test('social CTA has deep links, browser fallbacks, selectors, and exact campaign copy', () => {
  assert.match(client, /EXPO_PUBLIC_BUFFAGO_INSTAGRAM_DEEP_LINK/);
  assert.match(client, /EXPO_PUBLIC_BUFFAGO_INSTAGRAM_URL/);
  assert.match(client, /EXPO_PUBLIC_BUFFAGO_FACEBOOK_DEEP_LINK/);
  assert.match(client, /EXPO_PUBLIC_BUFFAGO_FACEBOOK_URL/);
  assert.match(card, /testID={`wing-shots-\${platform}-cta`}/);
  assert.match(card, /instagram: \{ icon: 'instagram'/);
  assert.match(card, /facebook: \{ icon: 'facebook'/);
  assert.match(card, /Upload your Wing Shot—check our Instagram daily to see if you’re featured!/);
});

test('onboarding explains Wing Shots without permission or upload actions', () => {
  const explainer = onboarding.slice(
    onboarding.indexOf('testID="onboarding-wing-shots-explainer"'),
    onboarding.indexOf('testID="onboarding-wing-shots-explainer"') + 1200,
  );
  assert.match(explainer, /Rate wings in person/);
  assert.match(explainer, /Check daily to see if your wings and rating made it!/);
  assert.doesNotMatch(explainer, /requestPermissions|launchCamera|launchImageLibrary/);
});

test('analytics schema allowlists Wing Shot events and blocks private fields', () => {
  for (const name of [
    'wing_shot_prompt_viewed',
    'wing_shot_upload_completed',
    'wing_shot_featured',
    'creator_leaderboard_viewed',
    'social_follow_cta_clicked',
  ]) assert.match(analytics, new RegExp(name));
  assert.match(analytics, /signed_url/);
  assert.match(analytics, /media_path/);
  assert.match(analytics, /moderation/);
});
