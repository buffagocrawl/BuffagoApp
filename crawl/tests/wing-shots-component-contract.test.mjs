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
  assert.match(flow, /OPTIONAL · YOUR RATING IS SAVED/);
  assert.match(flow, /testID="wing-shot\.not-now"/);
  assert.match(flow, /animationType="none"/);
});

test('capture actions and stable selectors are present', () => {
  for (const selector of [
    'wing-shot.take-photo',
    'wing-shot.record-video',
    'wing-shot.choose-library',
    'wing-shot.preview.replace',
    'wing-shot.preview.remove',
    'wing-shot.upload-progress',
    'wing-shot.upload-cancel',
    'wing-shot.upload-retry',
  ]) {
    assert.match(`${flow}\n${preview}`, new RegExp(selector.replace('.', '\\.')));
  }
  assert.match(flow, /targetDurationSeconds: WING_SHOT_VIDEO_TARGET_SECONDS/);
  assert.match(flow, /maximumDurationSeconds: WING_SHOT_VIDEO_MAX_SECONDS/);
});

test('consent is affirmative and attribution has no default', () => {
  assert.match(flow, /useState\(false\)/);
  assert.match(flow, /useState<Attribution \| null>\(null\)/);
  assert.match(flow, /accessibilityRole="checkbox"/);
  assert.match(flow, /accessibilityRole="radio"/);
  assert.match(flow, /testID="wing-shot\.consent"/);
});

test('accessibility labels, live status, font scaling, and no motion animation are explicit', () => {
  assert.match(flow, /announceForAccessibility/);
  assert.match(flow, /accessibilityRole="progressbar"/);
  assert.match(flow, /accessibilityLiveRegion="assertive"/);
  assert.match(flow, /allowFontScaling/);
  assert.doesNotMatch(flow, /\bAnimated\b|withTiming|withSpring/);
});

test('fallback adapter does not ask for permissions or invent media', () => {
  assert.match(adapter, /media_dependency_unavailable/);
  const fallback = adapter.slice(adapter.indexOf('const unavailable ='));
  assert.doesNotMatch(fallback, /requestCameraPermissions|requestMediaLibraryPermissions/);
});

test('production adapter requests permissions only inside user actions', () => {
  assert.match(adapter, /expoWingShotMediaAdapter/);
  assert.match(adapter, /async takePhoto\(\)[\s\S]*requestCameraPermissionsAsync/);
  assert.match(adapter, /async recordVideo[\s\S]*videoMaxDuration: Math\.min\(10/);
  assert.match(
    adapter,
    /async chooseFromLibrary\([^)]*\)[\s\S]*requestMediaLibraryPermissionsAsync/,
  );
  assert.match(adapter, /new ExpoFile\(asset\.uri\)/);
  assert.match(adapter, /arrayBuffer\(\)/);
  assert.match(adapter, /allowedMediaKinds/);
  assert.match(adapter, /media_kind_disabled/);
});

test('video preview is playable but always initialized muted', () => {
  assert.match(preview, /useVideoPlayer/);
  assert.match(preview, /configuredPlayer\.muted = true/);
  assert.match(preview, /<VideoView/);
  assert.match(preview, /nativeControls/);
});

test('photo and video actions fail closed behind independent flags', () => {
  assert.match(flow, /allowPhoto = true/);
  assert.match(flow, /allowVideo = true/);
  assert.match(flow, /\{allowPhoto \? \(/);
  assert.match(flow, /\{allowVideo \? \(/);
  assert.match(flow, /\{allowPhoto \|\| allowVideo \? \(/);
  assert.match(flow, /testID="wing-shot\.media-disabled"/);
  assert.match(flow, /selected\.kind === 'photo' && !allowPhoto/);
  assert.match(flow, /selected\.kind === 'video' && !allowVideo/);
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
