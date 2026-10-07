import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { loadPhotoWorkflowFlags, resolveRatingPhotoStep } from '../lib/photoWorkflowFlags.js';
import { mobileModule, hookRuntime } from './helpers/mobile-runtime.mjs';
const rows = (enabled) => ['wing_shot_prompt', 'wing_shot_photo_upload', 'wing_shot_video_upload'].map((flag_key) => ({ flag_key, enabled_for_user: enabled }));
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
test('enabled authoritative flags resolve image-first while new video stays disabled', async () => {
  const flags = await loadPhotoWorkflowFlags({ rpc: async () => ({ data: rows(true) }) });
  assert.equal(flags.prompt, true); assert.equal(flags.photo, true); assert.equal(flags.video, false);
  assert.equal(await resolveRatingPhotoStep(async () => flags), true);
});
test('authoritative disabled flags resolve directly to rating', async () => {
  assert.equal(await resolveRatingPhotoStep(async () => loadPhotoWorkflowFlags({ rpc: async () => ({ data: rows(false) }) })), false);
});
test('incomplete flag response offers retry instead of silently skipping photos', async () => {
  for (const data of [[], [{ flag_key: 'wing_shot_prompt', enabled_for_user: true }],
    [{ flag_key: 'wing_shot_prompt', enabled_for_user: true }, { flag_key: 'wing_shot_photo_upload' }]]) {
    await assert.rejects(loadPhotoWorkflowFlags({ rpc: async () => ({ data }) }), /Photo options could not load/);
  }
});
test('flags loading waits for server instead of deciding from uninitialized false', async () => {
  let resolve; let decided = false;
  const pending = resolveRatingPhotoStep(async () => loadPhotoWorkflowFlags({ rpc: () => new Promise((r) => { resolve = r; }) })).then((value) => { decided = true; return value; });
  await flush(); assert.equal(decided, false); resolve({ data: rows(true) }); assert.equal(await pending, true);
});
test('unavailable flags produce a retryable entry state, never silently bypass image', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] }); const pending = loadPhotoWorkflowFlags({ rpc: () => new Promise(() => {}) }, 50);
  const checked = assert.rejects(pending, /Photo options could not load/); t.mock.timers.tick(50); await checked;
});
test('stale cached disabled response cannot overwrite fresh server enabled response', async () => {
  const runtime = hookRuntime(); let oldResolve; let calls = 0;
  const client = { rpc: () => ++calls === 1 ? new Promise((r) => { oldResolve = r; }) : Promise.resolve({ data: rows(true) }) };
  const { useWingShotsFeatureFlags } = mobileModule('hooks/useWingShotsFeatureFlags.js', { react: runtime.react, '../lib/supabase': { supabase: client }, '../lib/photoWorkflowFlags': { loadPhotoWorkflowFlags } });
  const render = () => runtime.render(() => useWingShotsFeatureFlags(true));
  const initial = render(); assert.equal(initial.loading, true); await initial.refresh(true);
  oldResolve({ data: rows(false) }); await flush(); const current = render();
  assert.equal(current.flags.photo, true); assert.equal(current.flags.prompt, true); runtime.unmount();
});
for (const [name, file] of [['Home', 'app/(tabs)/home/index.jsx'], ['Crawl', 'app/crawl/[id].jsx']]) {
  test(`${name} resolves current flags before image/rating navigation`, () => {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.match(source, /await resolveRatingPhotoStep\(refreshPhotoFlags\)/);
    assert.match(source, /Photo options unavailable/);
    assert.match(source, /set\w+DraftMode\(canCaptureBeforeRating\)/);
    assert.match(source, /set\w+Visible\(canCaptureBeforeRating\)/);
    assert.match(source, /set\w+(Open|Visible)\(!canCaptureBeforeRating\)/);
  });
}

for (const flow of ['Home', 'Crawl']) {
  for (const mode of ['enabled', 'disabled', 'loading', 'failure']) {
    test(`${flow} actual rating entrypoint handles ${mode} authoritative flags`, async () => {
      const home = flow === 'Home';
      const source = readFileSync(new URL(home ? '../app/(tabs)/home/index.jsx' : '../app/crawl/[id].jsx', import.meta.url), 'utf8');
      const prefix = home ? 'const openHomeRatingWizard = useCallback(' : 'const openRating = ';
      const offset = source.indexOf(prefix) + prefix.length;
      const tail = source.indexOf(home ? '}, [' : '\n  };', offset);
      assert.ok(tail > offset);
      const states = {}; const alerts = []; let resolve; let refreshes = 0;
      const context = {
        closest: { id: 'destination', name: 'QA spot', distanceM: 0 }, alreadyRatedThis: false,
        homeRatingStartInFlightRef: { current: false }, homeRatingOperationRef: {}, homeDraftImageRef: {},
        homeImageStepShownRef: {}, crawlDraftImageRef: {}, crawlImageStepShownRef: {}, homeTagOptions: ['tag'],
        session: { user: { id: 'owner' } }, crawl: { crawl_id: 'crawl' },
        Crypto: { randomUUID: () => 'operation' }, metersToMiles: () => 0,
        wingShotDrafts: { load: async () => null, clear: async () => {} },
        trackEvent: async () => {}, loadTagsForDestination: () => {}, loadHomeTagOptions: async () => {},
        resolveRatingPhotoStep, Alert: { alert: (...args) => alerts.push(args) },
        refreshPhotoFlags: async () => {
          refreshes++;
          if (mode === 'failure') throw Error('offline');
          if (mode === 'loading') return new Promise((r) => { resolve = r; });
          return { prompt: mode === 'enabled', photo: mode === 'enabled' };
        },
      };
      for (const name of ['HomeRatingStarting', 'HomeRateDest', 'HomeWingShotDraftMode', 'HomeWingShotRatingId',
        'HomeWingShotDestinationId', 'HomeWingShotVisible', 'HomeRateOpen', 'ActiveDest', 'WingShotDraftMode',
        'EligibleWingShotRatingId', 'WingShotVisible', 'RateVisible']) context[`set${name}`] = (value) => { states[name] = value; };
      const callback = vm.runInNewContext(`(${source.slice(offset, tail)}${home ? '}' : '\n}'})`, context);
      const pending = callback({ id: 'destination' });
      await flush();
      if (mode === 'loading') {
        assert.equal(states[home ? 'HomeWingShotVisible' : 'WingShotVisible'], undefined);
        if (home) { await callback(); assert.equal(refreshes, 1, 'double tap does not launch a second entry'); }
        resolve({ prompt: true, photo: true });
      }
      await pending;
      if (mode === 'failure') {
        assert.equal(alerts[0][0], 'Photo options unavailable');
        assert.equal(states[home ? 'HomeRateOpen' : 'RateVisible'], undefined);
      } else {
        const enabled = mode !== 'disabled';
        assert.equal(states[home ? 'HomeWingShotVisible' : 'WingShotVisible'], enabled);
        assert.equal(states[home ? 'HomeRateOpen' : 'RateVisible'], !enabled);
      }
      if (home) assert.equal(states.HomeRatingStarting, false);
    });
  }
}
