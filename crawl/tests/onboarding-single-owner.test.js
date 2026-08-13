import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = fs.readFileSync(new URL('../app/_layout.tsx', import.meta.url), 'utf8');
const route = fs.readFileSync(new URL('../app/onboarding.jsx', import.meta.url), 'utf8');

test('onboarding has one route owner and is not globally overlaid during auth hydration', () => {
  assert.match(route, /OnboardingExperimentRoute/);
  assert.doesNotMatch(root, /<OnboardingFlow/);
  assert.doesNotMatch(root, /useOnboardingGate/);
  assert.match(root, /Stack\.Screen name="onboarding"/);
});
