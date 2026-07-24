import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const screens = [
  'app/(tabs)/ratings/index.jsx',
  'app/(tabs)/routes/index.jsx',
  'app/ratings/index.jsx',
  'app/routes/index.jsx',
  'app/routes/[id].jsx',
];

test('map screens use the platform boundary instead of importing native maps', () => {
  for (const screen of screens) {
    const source = fs.readFileSync(path.join(root, screen), 'utf8');
    assert.doesNotMatch(source, /from ['"]react-native-maps['"]/);
    assert.match(source, /platformMap/);
  }
});

test('web map fallback states native limitations', () => {
  const source = fs.readFileSync(path.join(root, 'lib/platformMap.web.js'), 'utf8');
  assert.match(source, /background proximity reminders/);
  assert.match(source, /Map available in the BuffaGo mobile app/);
});
