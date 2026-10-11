import test from 'node:test';
import assert from 'node:assert/strict';
import { mobileModule, hookRuntime, findElement } from '../helpers/mobile-runtime.mjs';
import * as signInFlow from '../../lib/passwordSignInFlow.js';

const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
const session = { user: { id: 'qa-owner' } };
const result = { data: { session, user: session.user }, error: null };
const byType = (tree, type) => {
  if (!tree) return null;
  if (Array.isArray(tree)) return tree.map((node) => byType(node, type)).find(Boolean);
  if (tree.type === type) return tree;
  return byType(tree.props?.children, type);
};

function screenHarness(signIn, bootstrap = async () => ({ data: { username: 'qa' }, error: null })) {
  const runtime = hookRuntime(); const navigations = []; let listener; let requests = 0;
  const query = { select() { return this; }, eq() { return this; }, maybeSingle: bootstrap };
  const native = Object.fromEntries(['View', 'Pressable', 'ScrollView', 'KeyboardAvoidingView'].map((name) => [name, name]));
  const textInput = Object.assign(function Input() {}, { Icon: 'input-icon' });
  const paper = { ...Object.fromEntries(['Text', 'Button', 'HelperText', 'ActivityIndicator', 'SegmentedButtons', 'Snackbar'].map((name) => [name, name])),
    TextInput: textInput, Card: Object.assign(function Card() {}, { Content: 'card-content' }), useTheme: () => ({ colors: {}, dark: false }) };
  const screen = mobileModule('app/auth/login.jsx', { react: runtime.react, 'react/jsx-runtime': runtime.jsx,
    'react-native': { ...native, Platform: { OS: 'android' }, StyleSheet: { create: (value) => value } },
    '@expo/vector-icons': { MaterialCommunityIcons: 'icon' }, '@react-native-async-storage/async-storage': { getItem: async () => null },
    'expo-crypto': { randomUUID: () => 'operation' }, 'react-native-paper': paper,
    'expo-router': { useRouter: () => ({ replace: (path) => navigations.push(path), back: () => navigations.push('back') }) },
    '../../lib/supabase.js': { supabase: { auth: { signInWithPassword: () => { requests++; return signIn(); },
      getUser: async () => ({ data: { user: session.user } }),
      onAuthStateChange: (fn) => { listener = fn; return { data: { subscription: { unsubscribe() { listener = null; } } } }; } }, from: () => query } },
    '../../lib/passwordSignInFlow': signInFlow, '../../lib/debugLog': { dbg: async () => {} },
    '../../lib/facebookOAuth': {}, '../../lib/socialAuthHelpers': { getSocialAuthButtonModels: () => [] },
    '../../config/features': { ENABLE_GOOGLE_AUTH: false }, '../../lib/analytics': { trackEvent: async () => {} },
    '../../lib/savedDestinations.js': { claimSavedDestinationIntent: async () => null },
    '../../lib/buffacoinRatingTransaction': {} });
  const render = () => runtime.render(screen.default);
  byType(render(), 'SegmentedButtons').props.onValueChange('signin');
  findElement(render(), 'auth.email.input').props.onChangeText('qa@example.test');
  findElement(render(), 'auth.password.input').props.onChangeText('test-password');
  return { render, runtime, navigations, requests: () => requests, session: (value = session) => listener?.('SIGNED_IN', value),
    submit: () => findElement(render(), 'auth.signin.native-action').props.onPress(),
    back: () => byType(render(), 'Pressable').props.onPress(),
    error: () => findElement(render(), 'auth.error').props };
}

test('normal password auth navigates exactly once and clears loading', async () => {
  const h = screenHarness(async () => result); await h.submit(); await flush();
  assert.deepEqual(h.navigations, ['/(tabs)/home']); assert.equal(h.error().visible, false);
  assert.equal(findElement(h.render(), 'auth.loading'), null); h.runtime.unmount();
});
test('auth network timeout with no session shows controlled error and ends spinner', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] }); const h = screenHarness(() => new Promise(() => {}));
  const attempt = h.submit(); await flush(); t.mock.timers.tick(15000); await attempt;
  assert.match(h.error().children, /Sign-in timed out/); assert.equal(findElement(h.render(), 'auth.loading'), null);
  h.runtime.unmount();
});
test('invalid credentials remain an authentication error', async () => {
  const h = screenHarness(async () => ({ data: {}, error: new Error('Invalid login credentials') }));
  await h.submit(); assert.equal(h.error().children, 'Email or password is incorrect.'); assert.deepEqual(h.navigations, []); h.runtime.unmount();
});
for (const [label, bootstrap] of [['slow', () => new Promise(() => {})], ['failed', async () => { throw Error('offline'); }]]) {
  test(`valid session with ${label} bootstrap can never become a sign-in timeout`, async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] }); const h = screenHarness(async () => result, bootstrap);
    await h.submit(); await flush(); t.mock.timers.tick(30000); await flush();
    assert.deepEqual(h.navigations, ['/(tabs)/home']); assert.equal(h.error().visible, false); h.runtime.unmount();
  });
}
for (const boundary of [14999, 15001]) test(`auth completion at ${boundary}ms reconciles to success exactly once`, async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] }); const pending = deferred(); const h = screenHarness(() => pending.promise);
  const attempt = h.submit(); await flush(); t.mock.timers.tick(boundary); await flush();
  pending.resolve(result); await attempt; await flush(); h.session(); await flush();
  assert.deepEqual(h.navigations, ['/(tabs)/home']); assert.equal(h.error().visible, false); h.runtime.unmount();
});
test('existing valid auth-state listener session clears stale error and navigates once', async () => {
  const h = screenHarness(() => new Promise(() => {})); h.session(); h.session(); await flush();
  assert.deepEqual(h.navigations, ['/(tabs)/home']); assert.equal(h.error().visible, false); h.runtime.unmount();
});
test('failed optional profile bootstrap retries once for the same user without changing login result', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] }); let attempts = 0;
  const h = screenHarness(async () => result, async () => {
    if (++attempts === 1) throw Error('temporary network issue');
    return { data: { username: 'qa' }, error: null };
  });
  await h.submit(); await flush(); assert.equal(attempts, 1);
  t.mock.timers.tick(2000); await flush();
  assert.equal(attempts, 2); assert.deepEqual(h.navigations, ['/(tabs)/home']);
  assert.equal(h.error().visible, false); h.runtime.unmount();
});
test('Back cancels attempt and a stale successful request cannot navigate', async () => {
  const pending = deferred(); const h = screenHarness(() => pending.promise); const attempt = h.submit();
  h.back(); h.runtime.unmount(); pending.resolve(result); await attempt; await flush();
  assert.deepEqual(h.navigations, ['back']);
});

test('Back suppresses request and listener navigation before the screen actually unmounts', async () => {
  const pending = deferred(); const h = screenHarness(() => pending.promise); const attempt = h.submit();
  h.back(); h.session(); pending.resolve(result); await attempt; await flush();
  assert.deepEqual(h.navigations, ['back']); h.runtime.unmount();
});
test('double tap and retry during outstanding timed-out request cannot start another auth request', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] }); const pending = deferred(); const h = screenHarness(() => pending.promise);
  const attempt = h.submit(); await h.submit(); await flush(); t.mock.timers.tick(15000); await attempt;
  await h.submit(); assert.equal(h.requests(), 1); pending.resolve(result); await flush();
  assert.deepEqual(h.navigations, ['/(tabs)/home']); assert.equal(h.error().visible, false); h.runtime.unmount();
});
