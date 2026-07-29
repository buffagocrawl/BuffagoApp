import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const appConfig = fs.readFileSync(path.join(root, 'app.config.js'), 'utf8');
const onboarding = fs.readFileSync(
  path.join(root, 'components/OnboardingFlow.tsx'),
  'utf8',
);

test('Wing Shot native modules are SDK-pinned rather than blanket upgraded', () => {
  assert.match(packageJson.dependencies['expo-image-picker'], /^~17\./);
  assert.match(packageJson.dependencies['expo-file-system'], /^~19\./);
  assert.match(packageJson.dependencies['expo-video'], /^~3\./);
  assert.match(packageJson.dependencies['expo-network'], /^~8\./);
});

test('native permission copy is purpose-specific and configured through plugins', () => {
  assert.match(appConfig, /"expo-image-picker"/);
  assert.match(appConfig, /Choose a Wing Shot/);
  assert.match(appConfig, /Take a Wing Shot/);
  assert.match(appConfig, /removes its audio during processing/);
  assert.match(appConfig, /"expo-video"/);
  assert.match(appConfig, /"CAMERA"/);
  assert.match(appConfig, /"RECORD_AUDIO"/);
});

test('onboarding does not import media modules or request media permissions', () => {
  assert.doesNotMatch(onboarding, /expo-image-picker|expo-file-system|expo-video/);
  assert.doesNotMatch(
    onboarding,
    /requestCameraPermissionsAsync|requestMediaLibraryPermissionsAsync/,
  );
});
