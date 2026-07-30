import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const flow = fs.readFileSync(new URL('../components/wingShots/WingShotFlow.tsx', import.meta.url), 'utf8');

test('media confirmation only populates the draft and never resets it', () => {
  const acceptMedia = flow.slice(flow.indexOf('const acceptMedia'), flow.indexOf('const chooseMedia'));
  assert.match(acceptMedia, /setMedia\(selected\)/);
  assert.doesNotMatch(acceptMedia, /resetWingShotForm\(\)/);
  assert.doesNotMatch(flow, /useEffect\(\(\) => \(\) =>[\s\S]*resetWingShotForm/);
});

test('upload progress, failure, and success preserve the draft until Done', () => {
  const submit = flow.slice(flow.indexOf('const submit'), flow.indexOf('const selectedKindEnabled'));
  assert.match(submit, /setPhaseSafely\('uploading'\)/);
  assert.match(submit, /setPhaseSafely\(controller\.signal\.aborted \? 'cancelled' : 'error'\)/);
  assert.match(submit, /setUploadResult\(result\)/);
  assert.match(submit, /setPhaseSafely\('success'\)/);
  assert.doesNotMatch(submit, /resetWingShotForm\(\)/);
});

test('completed and skipped flows reset safely while X preserves unfinished drafts', () => {
  const directResetCalls = flow.match(/resetWingShotForm\(\);/g) ?? [];
  assert.equal(directResetCalls.length, 2);
  assert.match(flow, /const handleCompletedFlowClose = useCallback/);
  assert.match(flow, /if \(phaseRef\.current !== 'success'\) return;/);
  assert.match(flow, /onPress=\{handleCompletedFlowClose\}[\s\S]*testID="wing-shot\.done"/);
  assert.match(flow, /onPress=\{closeFlow\}[\s\S]*testID="wing-shot\.not-now"/);
  assert.match(flow, /onPress=\{skipMediaUpload\}[\s\S]*testID="wing-shot\.skip-media"/);
});
