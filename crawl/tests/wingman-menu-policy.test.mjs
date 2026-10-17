import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { mobileModule } from './helpers/mobile-runtime.mjs';

const deadline = mobileModule('supabase/functions/_shared/wingmanDeadline.ts', {});
const exports = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../supabase/functions/_shared/wingmanMenuEvidence.ts', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText, { exports, URL, AbortSignal, TextDecoder, require: () => deadline });
const menu = exports;
const { assessWingmanMenu } = mobileModule('supabase/functions/_shared/wingmanMenuPolicy.ts', { './wingmanMenuEvidence.ts': menu });
const raw = { wings_probability: null, wing_evidence_status: 'unknown', wing_evidence: null };
const options = { restaurantName: 'Fixture Restaurant', city: 'Buffalo', resolveAddresses: async () => ['8.8.8.8'] };
const html = (text, headers = {}) => new Response(text, { headers: { 'content-type': 'text/html', ...headers } });
const page = (text, overrides = {}) => ({ url: 'https://fixture.example/menu', ...menu.wingMenuText(text), source: 'official', locationMatched: true, updatedAt: new Date().toISOString(), ...overrides });

for (const text of ['Chicken wings $12', 'Bone-in wings', 'Boneless wings', 'Buffalo wings', '10 wings', '12 pc wings', 'Wings $14', 'Smoked wings with garlic parmesan']) {
  test('official wing terminology: ' + text, () => {
    const result = assessWingmanMenu([page(text)], raw);
    assert.equal(result.wings_probability, .95); assert.equal(result.wing_evidence_status, 'supports');
  });
}
for (const text of ['Burgers and fries', 'Buffalo cauliflower', 'Wing sauce', 'Wings are sold out', 'We do not serve wings on Mondays.']) {
  test('incomplete or temporary menu condition remains neutral: ' + text, () => {
    const result = assessWingmanMenu([page(text)], raw);
    assert.equal(result.wings_probability, .5); assert.equal(result.wing_evidence_status, 'unknown');
  });
}
test('fresh location-specific explicit denial is negative; stale, unmatched or third-party denial is not', () => {
  const denial = page('We do not serve chicken wings.');
  assert.equal(assessWingmanMenu([denial], raw).wings_probability, .1);
  for (const overrides of [{ updatedAt: null }, { updatedAt: '2000-01-01' }, { updatedAt: '2100-01-01' }, { locationMatched: false }, { source: 'third_party' }]) {
    assert.equal(assessWingmanMenu([{ ...denial, ...overrides }], raw).wings_probability, .5);
  }
});
test('retrieved contradictory evidence is retained and allowed neutrally', () => {
  const result = assessWingmanMenu([page('We no longer serve chicken wings.'), page('Boneless wings $12', { source: 'third_party' })], raw);
  assert.equal(result.wings_probability, .5); assert.equal(result.wing_evidence_status, 'unknown');
  assert.equal(JSON.parse(result.wing_evidence).condition, 'conflicting');
});
test('model score/status alone never supplies a positive or negative source', () => {
  for (const wing_evidence_status of ['supports', 'unknown', 'unavailable', 'conflicting']) {
    const result = assessWingmanMenu([], { ...raw, wing_evidence_status, wings_probability: .1 });
    assert.equal(result.wings_probability, .5); assert.equal(result.wing_evidence_status, 'unknown');
    assert.equal(JSON.parse(result.wing_evidence).model_status, wing_evidence_status);
  }
});
test('official menu failure falls back to attributed ordering menu', async () => {
  const calls = [];
  const evidence = await menu.loadWingmanMenuEvidence('https://fixture.example', { ...options, fetchPage: async url => {
    calls.push(url);
    if (url === 'https://fixture.example/') return html('<a href="/menu">Menu</a><a href="https://www.grubhub.com/restaurant/fixture">Order</a>');
    if (url === 'https://fixture.example/menu') return new Response(null, { status: 403 });
    return html('Fixture Restaurant Buffalo Boneless wings $12');
  } });
  assert.equal(calls.length, 3);
  const result = assessWingmanMenu(evidence, raw);
  assert.equal(result.wings_probability, .8); assert.equal(result.wing_evidence_status, 'supports');
});
test('additional official links survive first inaccessible menu and malformed links', async () => {
  const evidence = await menu.loadWingmanMenuEvidence('https://fixture.example', { ...options, fetchPage: async url => {
    if (url.endsWith('/')) return html('<a href="http://[menu">Menu</a><a href="/menu">Menu</a><a href="/dinner-menu">Dinner menu</a>');
    if (url.endsWith('/menu')) return new Response(null, { status: 403 });
    return html('Chicken wings $12');
  } });
  assert.equal(assessWingmanMenu(evidence, raw).wings_probability, .95);
});
for (const failure of ['blocked', 'timeout', 'dns', 'missing', 'empty']) {
  test('neutral on website failure: ' + failure, async () => {
    const evidence = await menu.loadWingmanMenuEvidence('https://fixture.example', { ...options, timeoutMs: 20,
      resolveAddresses: failure === 'dns' ? () => new Promise(() => {}) : options.resolveAddresses,
      fetchPage: async () => {
        if (failure === 'timeout') return new Promise(() => {});
        if (failure === 'blocked') return new Response(null, { status: 403 });
        if (failure === 'missing') return new Response(null, { status: 404 });
        return html('');
      },
    });
    assert.equal(assessWingmanMenu(evidence, raw).wings_probability, .5);
  });
}
test('all discovered fallbacks fail without blocking eligibility', async () => {
  const evidence = await menu.loadWingmanMenuEvidence('https://fixture.example', { ...options, fetchPage: async url => url.endsWith('/')
    ? html('<a href="/menu">Menu</a><a href="https://www.yelp.com/menu/fixture">Yelp menu</a>')
    : new Response(null, { status: 403 }) });
  assert.equal(assessWingmanMenu(evidence, raw).wings_probability, .5);
});
test('third-party content for a different restaurant cannot supply positive evidence', async () => {
  const evidence = await menu.loadWingmanMenuEvidence('https://www.yelp.com/menu/fixture', { ...options,
    fetchPage: async () => html('Different Restaurant Albany Chicken wings $12') });
  assert.equal(assessWingmanMenu(evidence, raw).wings_probability, .5);
});
test('negative retrieval requires fresh full-page location evidence', async () => {
  const evidence = await menu.loadWingmanMenuEvidence('https://fixture.example', { ...options,
    fetchPage: async () => html('Fixture Restaurant Buffalo. We do not serve chicken wings.', { 'last-modified': new Date().toUTCString() }) });
  assert.equal(assessWingmanMenu(evidence, raw).wings_probability, .1);
});
