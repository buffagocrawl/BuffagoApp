import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const flow = fs.readFileSync(
  path.join(root, 'components/wingShots/WingShotFlow.tsx'),
  'utf8',
);
const preview = fs.readFileSync(
  path.join(root, 'components/wingShots/WingShotMediaPreview.tsx'),
  'utf8',
);
const adapter = fs.readFileSync(
  path.join(root, 'components/wingShots/mediaAdapter.ts'),
  'utf8',
);

test('flow is full-screen, scrollable, keyboard-safe, and post-rating optional', () => {
  assert.match(flow, /presentationStyle="fullScreen"/);
  assert.match(flow, /<ScrollView/);
  assert.match(flow, /<KeyboardAvoidingView/);
  assert.match(flow, /OPTIONAL · YOUR RATING HAS ALREADY SAVED/);
  assert.match(flow, /flexGrow: 1/);
  assert.match(flow, /justifyContent: 'center'/);
  assert.match(flow, /testID="wing-shot\.not-now"/);
  assert.match(flow, /animationType="none"/);
});

test('capture actions and stable selectors are present', () => {
  for (const selector of [
    'wing-shot.take-photo',
    'wing-shot.choose-library',
    'wing-shot.preview.replace',
    'wing-shot.preview.remove',
    'wing-shot.upload-progress',
    'wing-shot.upload-cancel',
    'wing-shot.upload-retry',
  ]) {
    assert.match(`${flow}\n${preview}`, new RegExp(selector.replace('.', '\\.')));
  }
  assert.doesNotMatch(flow, /record-video|targetDurationSeconds|maximumDurationSeconds/);
});

test('consent is affirmative and attribution has no default', () => {
  assert.match(flow, /useState\(false\)/);
  assert.match(flow, /useState<Attribution \| null>\(null\)/);
  assert.match(flow, /accessibilityRole="checkbox"/);
  assert.match(flow, /accessibilityRole="radio"/);
  assert.match(flow, /testID="wing-shot\.consent"/);
});

test('accessibility labels, reduced-motion-aware animation, and live status are explicit', () => {
  assert.match(flow, /announceForAccessibility/);
  assert.match(flow, /accessibilityRole="progressbar"/);
  assert.match(flow, /accessibilityLiveRegion="assertive"/);
  assert.match(flow, /allowFontScaling/);
  assert.match(flow, /AccessibilityInfo\.isReduceMotionEnabled/);
  assert.match(flow, /Animated\.timing/);
  assert.match(flow, /duration: reduceMotion \? 0 : 220/);
});

test('fallback adapter does not ask for permissions or invent media', () => {
  assert.match(adapter, /media_dependency_unavailable/);
  const fallback = adapter.slice(adapter.indexOf('const unavailable ='));
  assert.doesNotMatch(fallback, /requestCameraPermissions|requestMediaLibraryPermissions/);
});

test('production adapter requests permissions only inside user actions', () => {
  assert.match(adapter, /expoWingShotMediaAdapter/);
  assert.match(adapter, /async takePhoto\(\)[\s\S]*requestCameraPermissionsAsync/);
  assert.match(
    adapter,
    /async chooseFromLibrary\([^)]*\)[\s\S]*requestMediaLibraryPermissionsAsync/,
  );
  assert.match(adapter, /new ExpoFile\(asset\.uri\)/);
  assert.match(adapter, /arrayBuffer\(\)/);
  assert.match(adapter, /mediaTypes: \['images'\]/);
});

test('photo preview remains image-only', () => {
  assert.match(preview, /<Image/);
  assert.doesNotMatch(preview, /useVideoPlayer|VideoView/);
});

test('photo actions fail closed and video actions are absent', () => {
  assert.match(flow, /allowPhoto = true/);
  assert.match(flow, /\{allowPhoto \? \(/);
  assert.match(flow, /testID="wing-shot\.media-disabled"/);
  assert.match(flow, /selected\.kind !== 'photo' \|\| !allowPhoto/);
  assert.doesNotMatch(flow, /allowVideo|record-video|videocam/);
});

test('optional post-rating skip is accessible, idempotent, and resets media state', () => {
  assert.match(flow, /testID="wing-shot\.skip-media"/);
  assert.match(flow, /accessibilityLabel="Skip photo upload and continue"/);
  assert.match(flow, /eventName: 'wing_shot_upload_skipped'/);
  assert.match(flow, /metadata: \{ media_selected: Boolean\(media\) \}/);
  assert.match(flow, /skipNavigationRef\.current/);
  assert.match(flow, /resetWingShotForm\(\);[\s\S]*onClose\(\);/);
  assert.match(flow, /setMedia\(null\)/);
  assert.match(flow, /setCaption\(''\)/);
  assert.match(flow, /setUploadResult\(null\)/);
});

test('validation failures clear media and return to the empty state', () => {
  assert.match(flow, /validateWingShotMediaRemotely/);
  assert.match(flow, /setMedia\(null\)/);
  assert.match(flow, /setPhaseSafely\('empty'\)/);
  assert.doesNotMatch(flow, /testID="wing-shot\.try-again"/);
  assert.doesNotMatch(flow, /testID="wing-shot\.choose-different-video"/);
  assert.match(flow, /validationSequenceRef\.current/);
  assert.match(flow, /validationAbortRef\.current\?\.abort/);
  assert.match(flow, /mountedRef\.current/);
  assert.match(flow, /testID="wing-shot\.skip-media"/);
  assert.match(flow, /ratingId: eligibleRatingId/);
  assert.match(flow, /resetWingShotForm\('explicit_close'\)/);
});

test('selection automatically validates and submit is gated on valid state', () => {
  assert.match(flow, /void validateSelectedMedia\(selected\)/);
  assert.match(flow, /<Text[^>]*>Validating your Wing Shot…<\/Text>/);
  assert.match(flow, /<Text[^>]*>Wing Shot ready!<\/Text>/);
  assert.match(flow, /phase === 'valid' && media/);
  assert.match(flow, /setPhaseSafely\('submitting'\)/);
  assert.match(flow, /setPhaseSafely\('submitted'\)/);
});

test('submit remains disabled without valid media and skip follows submit', () => {
  const submitStart = flow.indexOf('disabled={!canSubmit}');
  const skipStart = flow.indexOf('testID="wing-shot.skip-media"');
  assert.notEqual(submitStart, -1);
  assert.ok(skipStart > submitStart);
  assert.match(flow, /disabled=\{!canSubmit\}/);
  assert.match(flow, /const canSubmit = Boolean\([\s\S]*media && selectedKindEnabled/);
});

test('privacy-safe Wing Shot analytics cover capture consent upload and failure', () => {
  for (const event of [
    'wing_shot_capture_started',
    'wing_shot_consent_completed',
    'wing_shot_upload_started',
    'wing_shot_upload_completed',
    'wing_shot_upload_failed',
  ]) assert.match(flow, new RegExp(event));
  assert.doesNotMatch(flow, /signed_url|upload_path|user_caption/);
});
