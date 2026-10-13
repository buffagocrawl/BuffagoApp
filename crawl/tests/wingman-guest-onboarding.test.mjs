import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mobileModule, hookRuntime, findElement } from './helpers/mobile-runtime.mjs';

const asyncTools = mobileModule('lib/wingmanAsync.ts', {});
const policy = mobileModule('supabase/functions/_shared/wingmanConfidence.ts', {});
const never = () => new Promise(() => {});
const result = { success: true, decision: 'approved', place: { found: true, name: 'Fixture Wings', city: 'Buffalo', address: '1 Main St' },
  ai: { normalizedName: 'Fixture Wings', confidence: .95, wingsProbability: .9, verifiedPlace: true, isRealRestaurant: true, locationStatus: 'verified', wingEvidenceStatus: 'supports' } };
const nodes = (tree, type) => !tree ? [] : Array.isArray(tree) ? tree.flatMap(n => nodes(n, type)) : [...(tree.type === type ? [tree] : []), ...nodes(tree.props?.children, type)];
const flush = async () => { for (let i = 0; i < 100; i++) await Promise.resolve(); };
function setup({ status, stalled = false, parseStalled = false, run = async () => result, pick = async () => {}, review = async () => {}, userId = null, legacy = false, parse = null } = {}) {
  const runtime = hookRuntime(); let inserts = 0, searches = 0, selections = 0, reviews = 0, dismissed = 0;
  // Execute the production deadline helper with a shorter clock for fault tests.
  const helpers = { ...asyncTools, wingmanRequest: (start, ms, signal) => asyncTools.wingmanRequest(start, Math.min(ms, 25), signal), bounded: (p, ms, signal) => asyncTools.bounded(p, Math.min(ms, 25), signal),
    errorBody: e => asyncTools.bounded(e.context.clone().json(), 10).catch(() => null) };
  const query = { select() { return this; }, eq() { return this; }, ilike() { return this; }, order: async () => ({ data: [] }), limit: async () => ({ data: [] }), insert: async () => { reviews++; return { error: null }; } };
  const imports = {
    '../lib/wingmanAsync': helpers, '../supabase/functions/_shared/wingmanConfidence': policy,
    react: runtime.react, 'react/jsx-runtime': runtime.jsx,
    'react-native': { View: 'view', ScrollView: 'scroll', Pressable: 'pressable', Alert: { alert() {} }, Modal: 'modal', Keyboard: { dismiss() {} }, KeyboardAvoidingView: 'keyboard', Platform: { OS: 'ios' } },
    'react-native-paper': { Portal: 'portal', Dialog: { Title: 'title', ScrollArea: 'area', Actions: 'actions' }, Text: 'text', Button: 'button', TextInput: 'input', ActivityIndicator: 'spinner' },
    '../lib/wingmanFocus': { scheduleWingmanFocus: () => () => {} },
    '../lib/supabase.js': { supabase: { from: () => query, functions: { invoke: async () => {
      inserts++; if (stalled) return never();
      if (status) return { error: { message: 'HTTP error', context: { status, clone: () => ({ json: parse || (parseStalled ? never : async () => ({ error: 'Needs review' })) }) } } };
      return { data: { destination: { id: 'saved', name: 'Fixture Wings' } } };
    } } } },
    '../lib/Wingman/WingmanService.ts': { WingmanService: class { async run(...args) { searches++; return run(...args); } parseAssessment() { return {}; } } },
  };
  let Dialog;
  if (legacy) {
    const source = execFileSync('git', ['show', '7830a30d1a574812e68e5f5007b93d985e58da6b:crawl/components/WingmanAddDialog.jsx'], { encoding: 'utf8', windowsHide: true });
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    const exports = {}; vm.runInNewContext(code, { exports, console, require: name => { assert.ok(name in imports, name); return imports[name]; } }); Dialog = exports.default;
  } else Dialog = mobileModule('components/WingmanAddDialog.jsx', imports).default;
  const props = { visible: true, initialRestaurant: 'Fixture Wings', initialStateId: 1, initialStateCode: 'NY', userId,
    onDismiss: () => { dismissed++; }, onPickDestination: async (...args) => { selections++; return pick(...args); }, onManualReviewQueued: review };
  const render = () => runtime.render(Dialog, props);
  render(); render();
  const press = label => { const button = nodes(render(), 'button').find(n => n.props.children === label); assert.ok(button, label); return button.props.onPress(); };
  return { runtime, props, render, press, counts: () => ({ inserts, searches, selections, reviews, dismissed }), text: () => nodes(render(), 'text').map(n => n.props.children).join(' '), loading: () => nodes(render(), 'spinner').length > 0 };
}

test('whole-operation timeout, cancellation and stalled error body are bounded', async () => {
  await assert.rejects(asyncTools.bounded(never(), 10), /too long/);
  const controller = new AbortController(); const p = asyncTools.bounded(never(), 1000, controller.signal); controller.abort(); await assert.rejects(p, /cancelled/);
  let requestSignal; await assert.rejects(asyncTools.wingmanRequest(signal => { requestSignal = signal; return never(); }, 10), /too long/); assert.equal(requestSignal.aborted, true);
  const start = Date.now(); assert.equal(await asyncTools.errorBody({ context: { clone: () => ({ json: never }) } }), null); assert.ok(Date.now() - start < 3000);
});
for (const userId of [null, 'signed-in']) test(`search/add/select succeeds and repeated taps are suppressed: ${userId}`, async () => {
  const s = setup({ userId }); const search = s.press('Search'); s.press('Search'); await search; await flush();
  const tap = nodes(s.render(), 'button').find(n => n.props.children === 'Yes').props.onPress; const yes = tap(); tap(); await yes; await flush();
  assert.deepEqual(s.counts(), { inserts: 1, searches: 1, selections: 1, reviews: 0, dismissed: 1 }); assert.equal(s.loading(), false);
});
for (const userId of [null, 'signed-in']) for (const status of [401, 429, 422, 500]) test(`HTTP ${status} (${userId}) exits loading and preserves restaurant for retry`, async () => {
  const s = setup({ status, userId }); await s.press('Search'); await s.press('Yes'); await flush();
  assert.equal(s.loading(), false); assert.equal(s.counts().selections, 0);
  assert.match(s.text(), status === 401 ? /session/ : status === 429 ? /Too many/ : status === 422 ? userId ? /queued for review/ : /this device.*after sign-in/ : /temporarily unavailable/);
  await s.press('Retry search'); assert.equal(findElement(s.render(), 'wingman-restaurant-name').props.value, 'Fixture Wings');
});
test('422 with stalled parsing exits loading and defers guest review locally', async () => {
  let queued = 0; const s = setup({ status: 422, parseStalled: true, review: async () => { queued++; } });
  await s.press('Search'); await s.press('Yes'); assert.equal(s.loading(), false); assert.equal(queued, 1); assert.equal(s.counts().reviews, 0);
});
for (const fault of ['search', 'verification', 'insert', 'selection', 'review', 'network']) test(`${fault} failure/timeout leaves loading`, async () => {
  const s = setup({ stalled: fault === 'insert',
    run: fault === 'search' ? never : fault === 'network' ? async () => { throw new Error('Network disconnected'); } : fault === 'verification' ? async input => input.wingVerification ? never() : { ...result, ai: { ...result.ai, wingsProbability: .1 } } : async () => result,
    pick: fault === 'selection' ? never : async () => {}, status: fault === 'review' ? 422 : undefined, review: fault === 'review' ? never : async () => {} });
  await s.press('Search'); if (!['search', 'network'].includes(fault)) await s.press('Yes'); await flush();
  assert.equal(s.loading(), false); assert.match(s.text(), fault === 'network' ? /Network disconnected/ : /too long/);
  if (fault === 'selection') { await s.press('Yes'); assert.equal(s.counts().inserts, 1, 'selection retries reuse returned destination'); }
});
test('signed-in rejection writes a real suggestion and guest local save errors do not claim success', async () => {
  const signed = setup({ userId: 'signed-in', status: 422 }); await signed.press('Search'); await signed.press('Yes'); assert.equal(signed.counts().reviews, 1);
  const guest = setup({ status: 422, review: async () => { throw new Error('Device storage full'); } }); await guest.press('Search'); await guest.press('Yes'); assert.equal(guest.loading(), false); assert.match(guest.text(), /Device storage full/); assert.doesNotMatch(guest.text(), /Saved on this device/);
});
test('dismiss/reopen and unmount cancel pending search and ignore late completion', async () => {
  let complete; const s = setup({ run: () => new Promise(resolve => { complete = resolve; }) }); const p = s.press('Search');
  s.props.visible = false; s.render(); s.props.visible = true; s.render(); complete(result); await p; await flush();
  assert.equal(s.loading(), false); assert.ok(findElement(s.render(), 'wingman-restaurant-name')); assert.equal(s.counts().inserts, 0);
  const q = s.press('Search'); s.runtime.unmount(); complete(result); await q; assert.equal(s.counts().dismissed, 0);
});

test('installed iOS build source: ordinary 401 clears loading; stalled error-body parsing reproduces persistent spinner', async () => {
 const ordinary = setup({ legacy: true, status: 401 }); await ordinary.press('Search'); ordinary.press('Yes'); await flush();
 assert.equal(ordinary.loading(), false); assert.match(ordinary.text(), /Needs review/);
 let release; const stalled = setup({ legacy: true, status: 401, parse: () => new Promise(resolve => { release = resolve; }) });
 await stalled.press('Search'); stalled.press('Yes'); await flush(); assert.equal(stalled.loading(), true);
 release({ error: 'Invalid user' }); await flush(); assert.equal(stalled.loading(), false);
});

test('pre-cancelled operations observe rejections and never start a request', async () => {
 const controller = new AbortController(); controller.abort();
 await assert.rejects(asyncTools.bounded(Promise.reject(new Error('late rejection')), 10, controller.signal), /cancelled/);
 let calls=0; await assert.rejects(asyncTools.wingmanRequest(()=>{calls++;return never();},10,controller.signal),/cancelled/);assert.equal(calls,0);
});
test('fixed 401 does not wait for a stalled error body', async () => {
 const s=setup({status:401,parseStalled:true});await s.press('Search');await s.press('Yes');assert.equal(s.loading(),false);assert.match(s.text(),/session/);
});

function onboardingSelection({storage=async()=>{},analytics=never}={}) {
 const source=readFileSync(new URL('../components/OnboardingFlow.tsx',import.meta.url),'utf8');
 const save=source.match(/const saveDest = (async[\s\S]*?)\n  };/)[1]+'\n}';
 const pick=source.match(/const pickWingmanDestination = (async[\s\S]*?)\n  };/)[1]+'\n}';
 const context={exports:{},bounded:(p,ms,signal)=>asyncTools.bounded(p,Math.min(ms,25),signal),AsyncStorage:{setItem:storage},ONBOARDING_DEST_KEY:'fixture-dest',
 mountedRef:{current:true},userId:null,pickedState:{state_id:1},trackEvent:analytics,setPickedDest:()=>{},setRatingError:()=>{},setAddOpen:()=>{},setStep:value=>{context.step=value;},loadRestaurantsForState:()=>{}};
 const code=ts.transpileModule('const saveDest='+save+';exports.pick='+pick+';',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 vm.runInNewContext(code,context);return context;
}
test('actual onboarding selection advances despite stalled analytics and stops on storage failure/cancellation',async()=>{
 const success=onboardingSelection();await success.exports.pick({id:'saved',name:'Fixture Wings'});assert.equal(success.step,3);
 const failure=onboardingSelection({storage:async()=>{throw new Error('Storage unavailable');}});await assert.rejects(failure.exports.pick({id:'saved'}),/Storage unavailable/);assert.equal(failure.step,undefined);
 const stalled=onboardingSelection({storage:never});await assert.rejects(stalled.exports.pick({id:'saved'}),/too long/);assert.equal(stalled.step,undefined);
 const controller=new AbortController();const dismissed=onboardingSelection({storage:never});const pending=dismissed.exports.pick({id:'saved'},{signal:controller.signal});controller.abort();await assert.rejects(pending,/cancelled/);assert.equal(dismissed.step,undefined);
});
