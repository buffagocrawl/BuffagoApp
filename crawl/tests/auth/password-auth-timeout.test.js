import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PASSWORD_AUTH_TIMEOUT_MS,
  withPasswordAuthTimeout,
} from '../../lib/passwordAuthTimeout.js';

test('password authentication returns a successful result before its timeout', async () => {
  const result = await withPasswordAuthTimeout(Promise.resolve({ data: { session: true } }), 20);
  assert.deepEqual(result, { data: { session: true } });
});

test('password authentication rejects with a safe timeout error', async () => {
  await assert.rejects(
    withPasswordAuthTimeout(new Promise(() => {}), 1),
    (error) => error?.code === 'PASSWORD_AUTH_TIMEOUT' && !String(error.message).includes('token')
  );
  assert.equal(PASSWORD_AUTH_TIMEOUT_MS, 15000);
});
