import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const historyPath = path.join(process.cwd(), 'app', 'profile', 'history', 'index.jsx');
const history = fs.readFileSync(historyPath, 'utf8');

test('Journey history exposes add-image only for the signed-in owner', () => {
  assert.match(history, /isViewingSelf && item\.imageEligibilityKnown && item\.imageEligible && !item\.hasMediaSubmission/);
  assert.match(history, /testID=\{`rating\.add-image\.\$\{item\.id\}`\}/);
  assert.match(history, /\.from\('wing_media_submissions'\)[\s\S]*?\.eq\('user_id', userId\)/);
});

test('Journey add-image reuses the review upload pipeline in photo-only mode', () => {
  assert.match(history, /eligibleRatingId=\{imageRating\.id\}/);
  assert.match(history, /submissionSource="profile"/);
  assert.match(history, /allowPhoto/);
  assert.doesNotMatch(history, /allowVideo/);
  assert.match(history, /onSubmitted=\{async \(\) =>/);
});

test('History query includes stable rating IDs and filters ineligible ratings locally', () => {
  assert.match(history, /\bid,\s*\n\s*destination_id/);
  assert.match(history, /!rating\.is_buffacoin/);
  assert.match(history, /Number\(value\) >= 1 && Number\(value\) <= 10/);
});
