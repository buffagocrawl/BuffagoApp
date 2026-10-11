import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const eas = JSON.parse(readFileSync(new URL('../eas.json', import.meta.url), 'utf8'));
const profile = eas.build['internal-testing'];
assert.equal(profile.extends, 'production');
assert.equal(profile.channel, 'internal-testing');
assert.equal(profile.env.EXPO_PUBLIC_ENABLE_WING_JURY, 'true');
assert.equal(profile.env.EXPO_PUBLIC_ENABLE_SAVED_DESTINATIONS, 'true');
assert.equal(eas.build.production.android.buildType, 'app-bundle');
assert.equal(eas.build.production.android.autoIncrement, true);
assert.equal(eas.cli.appVersionSource, 'remote');
assert.equal(eas.submit['internal-testing'].android.track, 'internal');
assert.equal(eas.build.production.env?.EXPO_PUBLIC_ENABLE_WING_JURY, undefined);
assert.equal(eas.build.production.env?.EXPO_PUBLIC_ENABLE_SAVED_DESTINATIONS, undefined);

process.env.EAS_BUILD_PLATFORM = 'android';
const config = require('../app.config.js')({ config: {} });
assert.equal(config.android.package, 'com.buffago.app');
assert.equal(config.extra.supabaseUrl, 'https://vhfxnizaxdanmvmouuaf.supabase.co');
assert.ok(config.extra.supabaseAnonKey?.trim(), 'Missing production public Supabase key');
assert.ok(config.android.config.googleMaps.apiKey?.trim(), 'Missing production Android Maps key');
assert.ok(config.android.blockedPermissions.includes('android.permission.ACCESS_BACKGROUND_LOCATION'));
console.log(JSON.stringify({ package: config.android.package, version: config.version,
  runtimeVersion: config.runtimeVersion, versionSource: eas.cli.appVersionSource,
  nextVersionCode: 'assigned by EAS autoIncrement', profile: 'internal-testing',
  track: 'internal', channel: profile.channel, supabaseProject: 'vhfxnizaxdanmvmouuaf',
  mapsKeyPresent: true, supabasePublicKeyPresent: true, permissions: config.android.permissions,
  featureFlags: profile.env }));
