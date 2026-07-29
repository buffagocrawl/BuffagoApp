import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { reconcileDisplayedProgress } from '../lib/wingShotProgress.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const flow = fs.readFileSync(path.join(root, 'components/wingShots/WingShotFlow.tsx'), 'utf8');
const preview = fs.readFileSync(path.join(root, 'components/wingShots/WingShotMediaPreview.tsx'), 'utf8');
const hook = fs.readFileSync(path.join(root, 'components/wingShots/useInterpolatedUploadProgress.ts'), 'utf8');
const client = fs.readFileSync(path.join(root, 'lib/wingShots.js'), 'utf8');

test('real progress is monotonic and capped before success', () => {
  assert.equal(reconcileDisplayedProgress({ displayed: 20, real: 10, stage: 'uploading' }), 20);
  assert.equal(reconcileDisplayedProgress({ displayed: 20, real: 45, stage: 'uploading' }), 45);
  assert.equal(reconcileDisplayedProgress({ displayed: 89, real: 100, stage: 'uploading' }), 90);
  assert.equal(reconcileDisplayedProgress({ displayed: 90, real: 100, stage: 'finalizing' }), 95);
});

test('interpolation and lifecycle safeguards are wired to the flow', () => {
  assert.match(hook, /setInterval\(tick, TICK_MS\)/);
  assert.match(hook, /clearInterval\(timerRef\.current\)/);
  assert.match(hook, /useEffect\(\(\) => \(\) =>/);
  assert.match(flow, /progressController\.complete\(\)/);
  assert.match(flow, /controller\.signal\.aborted/);
  assert.match(preview, /fullscreenOptions=\{\{ enable: false \}\}/);
  assert.match(flow, /AccessibilityInfo\.isReduceMotionEnabled/);
  assert.match(flow, /accessibilityValue=\{\{ min: 0, max: 100, now: Math\.round\(safeProgress\) \}\}/);
});

test('the client exposes separate progress stages and never declares UI success', () => {
  assert.match(client, /onStage = \(_stage\) => \{\}/);
  assert.match(client, /onStage\('uploading'\)/);
  assert.match(client, /onStage\('finalizing'\)/);
  assert.match(client, /onProgress\(95\)/);
  assert.doesNotMatch(client, /onProgress\(100\)/);
  assert.doesNotMatch(`${flow}\n${client}`, /console\.(log|info|debug|warn)\s*\(/);
});
