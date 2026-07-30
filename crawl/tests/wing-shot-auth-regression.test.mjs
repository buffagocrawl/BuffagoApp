import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { invokeWithOneAuthRefresh } from '../lib/wingShotFunctionAuth.js';

const authorize = fs.readFileSync(new URL('../supabase/functions/wing-media-stage-authorize/index.ts', import.meta.url), 'utf8');
const correlationId = '61cae941-9574-42d9-9a38-64a32bf34ec2';

test('stage authorization verifies the explicit bearer token against the project', () => {
  assert.match(authorize, /Bearer\\s\+\(\.\+\)\$/i);
  assert.match(authorize, /auth\.getUser\(token\)/);
  assert.match(authorize, /auth_boundary: 'function'/);
  for (const field of ['ok:', 'code', 'message', 'stage:', 'retryable:', 'correlationId:']) assert.match(authorize, new RegExp(field));
  assert.match(authorize, /authentication_required/);
  assert.match(authorize, /project_ref/);
  assert.doesNotMatch(authorize, /verify_jwt\s*=\s*true/);
});

test('auth refresh retry sends the token returned by refresh and required project headers', async () => {
  const calls = [];
  let getSessionCalls = 0;
  const client = {
    supabaseUrl: 'https://vhfxnizaxdanmvmouuaf.supabase.co',
    supabaseKey: 'anon-key-for-test',
    auth: {
      getSession: async () => {
        getSessionCalls += 1;
        return { data: { session: { access_token: 'stale-token', expires_at: 1, user: { id: 'user-1' } } } };
      },
      refreshSession: async () => ({ data: { session: { access_token: 'fresh-token', expires_at: 999, user: { id: 'user-1' } } }, error: null }),
    },
    functions: {
      invoke: async (_name, options) => {
        calls.push(options);
        if (calls.length === 1) {
          return { error: Object.assign(new Error('FunctionsHttpError'), { context: new Response(JSON.stringify({ ok: false, code: 'authentication_required', message: 'Please sign in again.', stage: 'staging_authorization', retryable: false, correlationId }), { status: 401, headers: { 'content-type': 'application/json' } }) }) };
        }
        return { data: { ok: true, signedUploadUrl: 'https://upload.invalid/signed', objectPath: 'user-1/id/wing.mp4' }, error: null };
      },
    },
  };
  const result = await invokeWithOneAuthRefresh(client, 'wing-media-stage-authorize', { correlationId }, correlationId);
  assert.equal(result.error, null);
  assert.equal(calls.length, 2);
  assert.equal(getSessionCalls, 1, 'retry should use the refresh response directly');
  assert.equal(calls[0].headers.Authorization, 'Bearer stale-token');
  assert.equal(calls[1].headers.Authorization, 'Bearer fresh-token');
  assert.equal(calls[1].headers.apikey, 'anon-key-for-test');
  assert.equal(calls[1].headers['x-wing-correlation-id'], correlationId);
});

test('function-level invalid, missing, and wrong-project tokens have a structured 401 contract', () => {
  assert.match(authorize, /if \(!token\)/);
  assert.match(authorize, /return fail\(request, 'authentication_required'.*401/);
  assert.match(authorize, /auth_source: 'getUser'/);
  assert.match(authorize, /Please sign in again to upload your Wing Shot/);
});
