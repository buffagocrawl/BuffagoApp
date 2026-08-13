import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const home = readFileSync(new URL('../app/(tabs)/home/index.jsx', import.meta.url), 'utf8');
const wizard = readFileSync(new URL('../components/RatingWizardDialog.jsx', import.meta.url), 'utf8');
const flow = readFileSync(new URL('../components/wingShots/WingShotFlow.tsx', import.meta.url), 'utf8');

test('new rating carries a real image session into the rating save', () => {
  assert.match(home, /onDraftContinue=\{\(draft\) =>/);
  assert.match(home, /homeDraftImageRef\.current = \{ draft/);
  assert.match(home, /submitWingShot\(/);
  assert.match(home, /ratingId,\s*media: draft\.media/);
  assert.match(home, /const canOfferWingShot = Boolean\(!draftImage/);
});

test('rating wizard keeps scoring intact and guards finalization double taps', () => {
  assert.match(wizard, /finalizeInFlightRef/);
  assert.match(wizard, /buildRatingPayload\(/);
  assert.match(wizard, /await onFinalize\?\.\(payload\)/);
});

test('draft image is staged and can be skipped with rating-history copy', () => {
  assert.match(flow, /destinationId,\s*signal/);
  assert.match(flow, /draftMode \? 'Continue to rating'/);
  assert.match(flow, /Skip for now/);
  assert.match(flow, /Rating History/);
});
