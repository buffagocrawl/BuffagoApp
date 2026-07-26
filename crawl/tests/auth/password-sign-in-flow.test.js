import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getPasswordSignInErrorMessage,
  runPasswordSignInAttempt,
} from '../../lib/passwordSignInFlow.js';

const session = { user: { id: 'user-id' } };
const signedIn = () => Promise.resolve({ data: { session, user: session.user }, error: null });

test('successful password sign-in bootstraps a profile before one navigation request', async () => {
  const phases = [];
  let navigations = 0;
  const result = await runPasswordSignInAttempt({
    signIn: signedIn,
    bootstrapProfile: async () => phases.push('bootstrapped'),
    onPhase: (phase) => phases.push(phase),
    timeoutMs: 20,
  });
  if (result.user.id) navigations += 1;
  assert.equal(navigations, 1);
  assert.deepEqual(phases, ['supabase_request_started', 'supabase_response_received', 'session_present', 'profile_bootstrap_started', 'bootstrapped', 'profile_bootstrap_completed']);
});

test('invalid credentials produce a safe user-facing error', async () => {
  await assert.rejects(
    runPasswordSignInAttempt({ signIn: async () => ({ data: {}, error: new Error('Invalid login credentials') }), bootstrapProfile: async () => {} }),
    /Invalid login credentials/
  );
  assert.equal(getPasswordSignInErrorMessage(new Error('Invalid login credentials')), 'Email or password is incorrect.');
});

test('a rejected Supabase request clears through the caller error path', async () => {
  await assert.rejects(
    runPasswordSignInAttempt({ signIn: async () => { throw new Error('network request failed'); }, bootstrapProfile: async () => {} }),
    /network request failed/
  );
  assert.match(getPasswordSignInErrorMessage(new Error('network request failed')), /Check your connection/);
});

test('the complete operation times out when profile bootstrap never resolves', async () => {
  await assert.rejects(
    runPasswordSignInAttempt({ signIn: signedIn, bootstrapProfile: () => new Promise(() => {}), timeoutMs: 1 }),
    (error) => error?.code === 'PASSWORD_AUTH_TIMEOUT'
  );
});

test('profile query failures and missing profile rows are distinguishable from auth failure', async () => {
  await assert.rejects(
    runPasswordSignInAttempt({ signIn: signedIn, bootstrapProfile: async () => { throw new Error('RLS denied'); } }),
    (error) => error?.code === 'PASSWORD_PROFILE_BOOTSTRAP_FAILED'
  );
  const result = await runPasswordSignInAttempt({ signIn: signedIn, bootstrapProfile: async () => {} });
  assert.equal(result.user.id, 'user-id');
});

test('cancelled and late attempts cannot bootstrap or navigate', async () => {
  let current = true;
  let resolveSignIn;
  let bootstrapCalls = 0;
  const pending = runPasswordSignInAttempt({
    signIn: () => new Promise((resolve) => { resolveSignIn = resolve; }),
    bootstrapProfile: async () => { bootstrapCalls += 1; },
    isCurrent: () => current,
    timeoutMs: 50,
  });
  current = false;
  resolveSignIn({ data: { session, user: session.user }, error: null });
  await assert.rejects(pending, (error) => error?.code === 'PASSWORD_SIGN_IN_CANCELLED');
  assert.equal(bootstrapCalls, 0);
});

test('missing session is rejected and a second submit can start after the first settles', async () => {
  await assert.rejects(
    runPasswordSignInAttempt({ signIn: async () => ({ data: { user: session.user }, error: null }), bootstrapProfile: async () => {} }),
    (error) => error?.code === 'PASSWORD_SESSION_MISSING'
  );
  const first = await runPasswordSignInAttempt({ signIn: signedIn, bootstrapProfile: async () => {} });
  const second = await runPasswordSignInAttempt({ signIn: signedIn, bootstrapProfile: async () => {} });
  assert.equal(first.user.id, second.user.id);
});
