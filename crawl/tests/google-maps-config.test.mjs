import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { getWalkingPath } from '../utils/walkRoute.js';

const source = fs.readFileSync(new URL('../app.config.js', import.meta.url), 'utf8');
function configure(env = {}) {
  const sandbox = { module: { exports: {} }, process: { env } };
  vm.runInNewContext(source, sandbox);
  return sandbox.module.exports({ config: { extra: { preserved: true } } });
}

test('Android Maps reads the authorized EAS variable and preserves unrelated config', () => {
  const config = configure({
    EXPO_PUBLIC_GOOGLE_ANDROID_API_KEY: 'android-test-placeholder',
    EXPO_PUBLIC_GOOGLE_IOS_API_KEY: 'ios-test-placeholder',
    EXPO_PUBLIC_GOOGLE_API_KEY: 'legacy-test-placeholder',
  });
  assert.equal(config.android.config.googleMaps.apiKey, 'android-test-placeholder');
  assert.equal(config.ios.config.googleMapsApiKey, 'ios-test-placeholder');
  assert.equal(config.android.package, 'com.buffago.app');
  assert.equal(config.ios.bundleIdentifier, 'com.buffago.app');
  assert.equal(config.extra.preserved, true);
});

test('Android Maps does not fall back to the legacy Directions variable', () => {
  const config = configure({ EXPO_PUBLIC_GOOGLE_API_KEY: 'legacy-test-placeholder' });
  assert.equal(config.android.config.googleMaps.apiKey, undefined);
  assert.equal(config.ios.config.googleMapsApiKey, undefined);
  assert.equal(config.extra.androidMapsConfigured, false);
});

for (const [platform, variable, other] of [
  ['android', 'EXPO_PUBLIC_GOOGLE_ANDROID_API_KEY', 'EXPO_PUBLIC_GOOGLE_IOS_API_KEY'],
  ['ios', 'EXPO_PUBLIC_GOOGLE_IOS_API_KEY', 'EXPO_PUBLIC_GOOGLE_API_KEY'],
]) {
  test(`${platform} production build rejects missing or blank native key without leaking values`, () => {
    for (const value of [undefined, '', '   ']) {
      assert.throws(() => configure({
        EAS_BUILD_PLATFORM: platform, EAS_BUILD_PROFILE: 'production',
        [variable]: value, [other]: 'other-test-placeholder',
      }), { message: `Missing ${variable} for native Maps build` });
    }
  });
  test(`${platform} production build requires only its own native key`, () => {
    assert.doesNotThrow(() => configure({
      EAS_BUILD_PLATFORM: platform, EAS_BUILD_PROFILE: 'production',
      [variable]: 'native-test-placeholder',
    }));
  });
}

test('production web export and config inspection work without native keys', () => {
  assert.doesNotThrow(() => configure({ NODE_ENV: 'production' }));
  assert.doesNotThrow(() => configure({ NODE_ENV: 'production', EAS_BUILD_PLATFORM: 'web' }));
});

test('production EAS profile uses production environment and excludes generated native sources', () => {
  const eas = JSON.parse(fs.readFileSync(new URL('../eas.json', import.meta.url), 'utf8'));
  assert.equal(eas.build.production.environment, 'production');
  for (const [file, pattern] of [['../../.easignore', /^crawl\/android\/$/m], ['../.easignore', /^android\/$/m]]) {
    assert.match(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), pattern);
  }
});

test('Expo Android config plugin writes Maps API metadata from app configuration', () => {
  const require = createRequire(import.meta.url);
  const { setGoogleMapsApiKey } = require('@expo/config-plugins/build/android/GoogleMapsApiKey.js');
  const config = configure({ EAS_BUILD_PLATFORM: 'android', EXPO_PUBLIC_GOOGLE_ANDROID_API_KEY: 'maps-test-placeholder' });
  const manifest = { manifest: { application: [{ $: { 'android:name': '.MainApplication' } }] } };
  setGoogleMapsApiKey(config, manifest);
  const metadata = manifest.manifest.application[0]['meta-data'].find((row) => row.$['android:name'] === 'com.google.android.geo.API_KEY');
  assert.equal(metadata.$['android:value'], 'maps-test-placeholder');
});

test('Directions uses the configured variable without exposing it in diagnostics', async () => {
  const route = fs.readFileSync(new URL('../utils/walkRoute.js', import.meta.url), 'utf8');
  assert.doesNotMatch(route, /EXPO_PUBLIC_GOOGLE_(ANDROID|IOS)_API_KEY/);
  let requested;
  const fetchImpl = async (url) => {
      requested = new URL(url);
      return { json: async () => ({ status: 'OK', routes: [{ overview_polyline: { points: '??' } }] }) };
    };
  const points = await getWalkingPath([
    { latitude: 1, longitude: 2 }, { latitude: 3, longitude: 4 },
  ], { fetchImpl, apiKey: 'legacy-test-placeholder' });
  assert.equal(requested.pathname, '/maps/api/directions/json');
  assert.equal(requested.searchParams.get('mode'), 'walking');
  assert.equal(requested.searchParams.get('key'), 'legacy-test-placeholder');
  assert.equal(points.length, 1);
});

test('rotation source and template contain no literal Google API keys', () => {
  for (const file of ['app.config.js', '.env.example', 'utils/walkRoute.js', 'README.md', 'SECURITY.md']) {
    assert.doesNotMatch(fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), /AIza[0-9A-Za-z_-]{35}/);
  }
  const template = fs.readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
  for (const variable of ['EXPO_PUBLIC_GOOGLE_ANDROID_API_KEY', 'EXPO_PUBLIC_GOOGLE_IOS_API_KEY', 'EXPO_PUBLIC_GOOGLE_API_KEY']) {
    assert.match(template, new RegExp(`^${variable}=$`, 'm'));
  }
});
