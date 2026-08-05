import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { reconcileDisplayedProgress } from '../lib/wingShotProgress.js';
import {
  createWingShotValidationProgress,
  VALIDATION_PROGRESS_CAP,
} from '../lib/wingShotValidationProgress.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const flow = fs.readFileSync(path.join(root, 'components/wingShots/WingShotFlow.tsx'), 'utf8');
const preview = fs.readFileSync(path.join(root, 'components/wingShots/WingShotMediaPreview.tsx'), 'utf8');
const hook = fs.readFileSync(path.join(root, 'components/wingShots/useInterpolatedUploadProgress.ts'), 'utf8');
const client = fs.readFileSync(path.join(root, 'lib/wingShots.js'), 'utf8');

function createFakeTimers() {
  let now = 0;
  let nextId = 1;
  const timers = new Map();
  return {
    now: () => now,
    setIntervalFn(callback, interval) {
      const id = nextId++;
      timers.set(id, { callback, interval, due: now + interval });
      return id;
    },
    clearIntervalFn(id) {
      timers.delete(id);
    },
    advance(ms) {
      const target = now + ms;
      while (true) {
        const next = [...timers.entries()]
          .filter(([, timer]) => timer.due <= target)
          .sort((a, b) => a[1].due - b[1].due)[0];
        if (!next) break;
        const [id, timer] = next;
        now = timer.due;
        timer.due += timer.interval;
        if (timers.has(id)) timer.callback();
      }
      now = target;
    },
    count: () => timers.size,
  };
}

test('validation progress advances visibly through a fifteen-second validation', () => {
  const timers = createFakeTimers();
  const updates = [];
  const progress = createWingShotValidationProgress({ ...timers, onProgress: (value) => updates.push(value) });

  progress.start();
  timers.advance(3_000);
  assert.ok(progress.getProgress() >= 19 && progress.getProgress() <= 21);
  timers.advance(4_000);
  assert.ok(progress.getProgress() >= 44 && progress.getProgress() <= 46);
  timers.advance(4_000);
  assert.ok(progress.getProgress() >= 69 && progress.getProgress() <= 71);
  timers.advance(4_000);
  assert.ok(progress.getProgress() >= 85 && progress.getProgress() <= 90);
  assert.ok(updates.length > 10);
  assert.ok(updates.every((value, index) => index === 0 || value >= updates[index - 1]));
});

test('simulated validation progress is capped until a real success completes it', async () => {
  const timers = createFakeTimers();
  const progress = createWingShotValidationProgress(timers);
  const operation = progress.start();
  timers.advance(120_000);
  assert.ok(progress.getProgress() <= VALIDATION_PROGRESS_CAP);

  const completed = progress.complete(operation);
  timers.advance(300);
  assert.equal(await completed, true);
  assert.equal(progress.getProgress(), 100);
});

test('only success reaches 100%; failure freezes at the current validation progress', () => {
  const timers = createFakeTimers();
  const progress = createWingShotValidationProgress(timers);
  const operation = progress.start();
  timers.advance(7_000);
  const failedAt = progress.getProgress();

  progress.stop(operation);
  timers.advance(60_000);
  assert.equal(progress.getProgress(), failedAt);
  assert.ok(progress.getProgress() < 100);
});

test('validation timers are cleaned up on completion, failure, restart, and explicit cleanup', async () => {
  const timers = createFakeTimers();
  const progress = createWingShotValidationProgress(timers);
  const first = progress.start();
  assert.equal(timers.count(), 1);
  const second = progress.start();
  assert.notEqual(first, second);
  assert.equal(timers.count(), 1);
  progress.stop(second);
  assert.equal(timers.count(), 0);

  const successful = progress.start();
  const completed = progress.complete(successful);
  assert.equal(timers.count(), 1);
  timers.advance(300);
  assert.equal(await completed, true);
  assert.equal(timers.count(), 0);
  progress.clearTimer();
  assert.equal(timers.count(), 0);
});

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
  assert.match(flow, /progressController\.complete\(/);
  assert.match(flow, /createWingShotValidationProgress/);
  assert.match(flow, /validationProgressControllerRef\.current\?\.stop\(\)/);
  assert.match(flow, /validationProgressControllerRef\.current\?\.complete\(validationOperation\)/);
  assert.match(flow, /controller\.signal\.aborted/);
  assert.match(preview, /testID="wing-shot\.preview\.photo"/);
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
