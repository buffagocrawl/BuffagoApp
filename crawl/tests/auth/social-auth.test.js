import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveCallbackFallbackRoute,
  withCallbackTimeout,
} from '../../lib/authCallbackHelpers.js';
import {
  executeSocialAuth,
  getSocialAuthButtonModels,
  getSocialAuthErrorMessage,
} from '../../lib/socialAuthHelpers.js';

test('social auth buttons include Google first and Facebook second', () => {
  const buttons = getSocialAuthButtonModels(null);

  assert.deepEqual(
    buttons.map((button) => [button.provider, button.label]),
    [
      ['google', 'Continue with Google'],
      ['facebook', 'Continue with Facebook'],
    ]
  );
});

test('social auth button state shows selected provider loading and disables both buttons', () => {
  const buttons = getSocialAuthButtonModels('google');

  assert.equal(buttons[0].loading, true);
  assert.equal(buttons[0].disabled, true);
  assert.equal(buttons[1].loading, false);
  assert.equal(buttons[1].disabled, true);
});

test('executeSocialAuth calls OAuth with Google provider and clears loading state', async () => {
  const transitions = [];
  const providers = [];

  const result = await executeSocialAuth('google', {
    activeProvider: null,
    setActiveProvider: (provider) => transitions.push(provider),
    startOAuth: async (provider) => {
      providers.push(provider);
      return { outcome: 'callback' };
    },
    onCallbackReady: async () => {},
  });

  assert.equal(result.outcome, 'callback');
  assert.deepEqual(providers, ['google']);
  assert.deepEqual(transitions, ['google', null]);
});

test('executeSocialAuth calls OAuth with Facebook provider', async () => {
  const providers = [];

  const result = await executeSocialAuth('facebook', {
    activeProvider: null,
    setActiveProvider: () => {},
    startOAuth: async (provider) => {
      providers.push(provider);
      return { outcome: 'callback' };
    },
    onCallbackReady: async () => {},
  });

  assert.equal(result.outcome, 'callback');
  assert.deepEqual(providers, ['facebook']);
});

test('executeSocialAuth blocks duplicate taps while another provider is active', async () => {
  const result = await executeSocialAuth('google', {
    activeProvider: 'facebook',
    setActiveProvider: () => {
      throw new Error('should not update active provider');
    },
    startOAuth: async () => {
      throw new Error('should not start oauth');
    },
  });

  assert.deepEqual(result, { blocked: true, outcome: 'busy' });
});

test('executeSocialAuth resets loading state after cancellation', async () => {
  const transitions = [];
  const cancelledProviders = [];

  const result = await executeSocialAuth('facebook', {
    activeProvider: null,
    setActiveProvider: (provider) => transitions.push(provider),
    startOAuth: async () => ({ outcome: 'cancelled' }),
    onCancelled: async (provider) => cancelledProviders.push(provider),
  });

  assert.equal(result.outcome, 'cancelled');
  assert.deepEqual(cancelledProviders, ['facebook']);
  assert.deepEqual(transitions, ['facebook', null]);
});

test('executeSocialAuth resets loading state after error', async () => {
  const transitions = [];

  await assert.rejects(
    executeSocialAuth('google', {
      activeProvider: null,
      setActiveProvider: (provider) => transitions.push(provider),
      startOAuth: async () => {
        throw new Error('Provider misconfigured');
      },
    }),
    /Provider misconfigured/
  );

  assert.deepEqual(transitions, ['google', null]);
});

test('getSocialAuthErrorMessage returns provider fallback when no message exists', () => {
  assert.equal(getSocialAuthErrorMessage('google', null, 'sign in'), 'Google sign in failed');
  assert.equal(getSocialAuthErrorMessage('facebook', null, 'sign in'), 'Facebook sign in failed');
});

test('callback fallback routes stay safe for auth and linking flows', () => {
  assert.equal(resolveCallbackFallbackRoute({ returnPath: '/(tabs)/home', mode: 'sign_in' }), '/(tabs)/home');
  assert.equal(resolveCallbackFallbackRoute({ mode: 'link_identity' }), '/user');
  assert.equal(resolveCallbackFallbackRoute({ mode: 'sign_in' }), '/auth/login');
});

test('callback timeout surfaces provider-specific errors', async () => {
  await assert.rejects(
    withCallbackTimeout(new Promise(() => {}), 'google', 5),
    /Google sign-in took too long to finish/
  );
});
