import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceExtensions = new Set(['.js', '.jsx', '.ts', '.tsx']);

function applicationSourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return applicationSourceFiles(file);
    return sourceExtensions.has(path.extname(entry.name)) ? [file] : [];
  });
}

function filesNamed(directory, name) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return filesNamed(file, name);
    return entry.name === name ? [file] : [];
  });
}

test('Android manifest removes background location from all merged dependencies', () => {
  const manifestDirectory = path.join(root, 'android', 'app', 'src');
  const manifests = filesNamed(manifestDirectory, 'AndroidManifest.xml');

  for (const manifest of manifests) {
    const source = fs.readFileSync(manifest, 'utf8');
    const declarations = source.match(/<uses-permission\b[^>]*ACCESS_BACKGROUND_LOCATION[^>]*>/g) ?? [];
    for (const declaration of declarations) {
      assert.match(declaration, /tools:node\s*=\s*["']remove["']/);
    }
  }

  const mainManifest = fs.readFileSync(path.join(manifestDirectory, 'main', 'AndroidManifest.xml'), 'utf8');
  assert.match(mainManifest, /xmlns:tools\s*=\s*["']http:\/\/schemas\.android\.com\/tools["']/);
  assert.match(
    mainManifest,
    /<uses-permission\b[^>]*android:name\s*=\s*["']android\.permission\.ACCESS_BACKGROUND_LOCATION["'][^>]*tools:node\s*=\s*["']remove["'][^>]*>/
  );
  assert.match(
    mainManifest,
    /<service\b[^>]*android:name\s*=\s*["']expo\.modules\.location\.services\.LocationTaskService["'][^>]*tools:node\s*=\s*["']remove["'][^>]*>/
  );
});

test('Expo location configuration keeps background location and foreground services disabled', () => {
  const config = fs.readFileSync(path.join(root, 'app.config.js'), 'utf8');
  assert.match(config, /blockedPermissions:\s*\[[^\]]*android\.permission\.ACCESS_BACKGROUND_LOCATION/);
  assert.match(config, /isAndroidBackgroundLocationEnabled:\s*false/);
  assert.match(config, /isAndroidForegroundServiceEnabled:\s*false/);
  assert.match(config, /isIosBackgroundLocationEnabled:\s*false/);
  assert.doesNotMatch(config, /permissions:\s*\[[^\]]*ACCESS_BACKGROUND_LOCATION/);
});

test('application code does not request or start background location tracking', () => {
  const bannedCalls = /requestBackgroundPermissionsAsync|getBackgroundPermissionsAsync|startLocationUpdatesAsync|stopLocationUpdatesAsync|startGeofencingAsync|stopGeofencingAsync|TaskManager\.defineTask/;
  const sources = ['app', 'components', 'config', 'hooks', 'lib', 'providers', 'src', 'utils']
    .flatMap((directory) => {
      const absolute = path.join(root, directory);
      return fs.existsSync(absolute) ? applicationSourceFiles(absolute) : [];
    });

  for (const sourceFile of sources) {
    assert.doesNotMatch(fs.readFileSync(sourceFile, 'utf8'), bannedCalls, sourceFile);
  }
});
