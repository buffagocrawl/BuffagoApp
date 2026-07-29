import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const client = readFileSync(new URL('../lib/socialCommunity.js', import.meta.url), 'utf8');
const home = readFileSync(new URL('../app/(tabs)/home/index.jsx', import.meta.url), 'utf8');
const onboarding = readFileSync(new URL('../components/OnboardingFlow.tsx', import.meta.url), 'utf8');
const wingShotFlow = readFileSync(new URL('../components/wingShots/WingShotFlow.tsx', import.meta.url), 'utf8');
const composer = readFileSync(new URL('../components/wingShots/WingShotComposer.tsx', import.meta.url), 'utf8');
const analytics = readFileSync(new URL('../lib/analyticsSchema.js', import.meta.url), 'utf8');

test('home social links use native deep links with browser fallbacks', () => {
  assert.match(client, /EXPO_PUBLIC_BUFFAGO_INSTAGRAM_DEEP_LINK/);
  assert.match(client, /EXPO_PUBLIC_BUFFAGO_INSTAGRAM_URL/);
  assert.match(client, /EXPO_PUBLIC_BUFFAGO_FACEBOOK_DEEP_LINK/);
  assert.match(client, /EXPO_PUBLIC_BUFFAGO_FACEBOOK_URL/);
  assert.match(client, /instagram:\/\/user\?username=buffago/);
  assert.match(client, /https:\/\/www\.instagram\.com\/buffago\//);
  assert.match(home, /testID={`home-social-\${platform}`}/);
  assert.match(home, /platform: 'instagram', icon: 'instagram'/);
  assert.match(home, /platform: 'facebook', icon: 'facebook'/);
  assert.match(home, /isSocialCommunityConfigured/);
  assert.doesNotMatch(home, /WingShotsPromoCard/);
  assert.doesNotMatch(home, /Get Featured/);
});

test('Wing Shot education and entry points never require proximity', () => {
  const explainer = onboarding.slice(
    onboarding.indexOf('testID="onboarding-wing-shots-explainer"'),
    onboarding.indexOf('testID="onboarding-wing-shots-explainer"') + 1200,
  );
  assert.match(explainer, /Share a photo or short video of wings from any restaurant/);
  assert.match(explainer, /Add a Wing Shot \(optional\)/);
  assert.match(explainer, /approved creators earn XP, badges, and recognition/);
  assert.doesNotMatch(explainer, /requestPermissions|launchCamera|launchImageLibrary/);
  assert.match(wingShotFlow, /from this restaurant/);
  assert.match(wingShotFlow, /Every submission is reviewed/);
  assert.match(wingShotFlow, /only approved photos may be featured/);
  assert.match(wingShotFlow, /Approved\s+creators earn XP, badges, and recognition/);
  assert.match(composer, /Search restaurants/);
  for (const source of ['onboarding', 'buffacoin', 'profile', 'home_cta']) assert.match(composer, new RegExp(source));
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
