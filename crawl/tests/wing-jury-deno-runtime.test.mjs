import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const userId = '11111111-1111-4111-8111-111111111111';
const photoId = '33333333-3333-4333-8333-333333333333';
const destinationId = '44444444-4444-4444-8444-444444444444';
const photo = { id: photoId, destination_id: destinationId, user_id: destinationId, media_type: 'photo', status: 'approved',
  owner_deleted_at: null, withdrawn_at: null, processed_storage_path: `processed/${photoId}/primary`,
  consent_version: 'v1', consented_at: '2020-01-01', attribution_preference: 'anonymous', created_at: '2020-01-01', distance: null };

async function fixture(name) {
  const calls = []; const state = { voted: false, public: true, manifest: null, deleted: false, failCompletion: false };
  const backend = createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString(); const body = raw ? JSON.parse(raw) : null;
    const url = new URL(req.url, 'http://127.0.0.1');
    calls.push({ path: url.pathname, method: req.method, body, headers: req.headers, search: url.searchParams });
    res.setHeader('content-type', 'application/json');
    let data;
    if (url.pathname === '/auth/v1/user') data = { id: userId, is_anonymous: false };
    else if (url.pathname.startsWith('/auth/v1/admin/users/')) { state.deleted = true; data = { id: userId }; }
    else if (url.pathname === '/rest/v1/rpc/is_public_wing_jury_photo') data = state.public;
    else if (url.pathname === '/rest/v1/rpc/wing_jury_feed_candidates') data = body.p_after_submission_id ? [] : [photo];
    else if (url.pathname === '/storage/v1/object/sign/wing-submissions') {
      assert.equal(body.expiresIn, 300);
      data = body.paths.map(path => ({ path, error: null, signedURL: `/object/sign/wing-submissions/${path}?token=local-fixture` }));
    } else if (url.pathname === '/storage/v1/object/wing-submissions') data = body.prefixes.map(name => ({ name }));
    else if (url.pathname === '/rest/v1/wing_media_submissions') data = name === 'delete-account' ? [] : [photo];
    else if (url.pathname === '/rest/v1/wing_jury_votes') {
      if (req.method === 'POST') { state.voted = true; data = { ...body, created_at: '2026-10-10' }; }
      else data = state.voted ? [{ submission_id: photoId, user_id: userId, vote: 0 }] : [];
    } else if (url.pathname === '/rest/v1/wing_jury_photo_vote_counts') data = [{ like_count: 0 }];
    else if (url.pathname === '/rest/v1/destinations') data = [{ id: destinationId, name: 'Synthetic Wings', address: 'Fixture' }];
    else if (url.pathname === '/rest/v1/rpc/wing_jury_restaurant_rating_summary') data = { rating_count: 2, average_weight_score: 75 };
    else if (['/rest/v1/destination_ratings', '/rest/v1/user_destination_favorites', '/rest/v1/user_want_to_try'].includes(url.pathname)) data = [];
    else if (url.pathname === '/rest/v1/wing_account_deletion_manifests') data = state.manifest ? [state.manifest] : [];
    else if (url.pathname === '/rest/v1/wing_submission_upload_intents') {
      assert.equal(url.searchParams.get('user_id'), `eq.${userId}`);
      data = [];
    }
    else if (url.pathname === '/rest/v1/rpc/prepare_wing_account_media_cleanup') {
      state.manifest ||= { id: photoId, user_id: userId, correlation_id: body.p_correlation_id, status: 'pending', object_paths: ['originals/private'] };
      data = { manifest_id: state.manifest.id, status: state.manifest.status, object_paths: state.manifest.object_paths };
    } else if (url.pathname === '/rest/v1/rpc/complete_wing_account_media_cleanup') {
      data = !state.failCompletion;
      if (data) state.manifest.status = 'objects_deleted';
    } else { res.statusCode = 500; data = { error: 'unexpected fixture path' }; }
    res.end(JSON.stringify(data));
  });
  await new Promise(resolve => backend.listen(0, '127.0.0.1', resolve));
  const reserve = createServer(); await new Promise(resolve => reserve.listen(0, '127.0.0.1', resolve));
  const port = reserve.address().port; await new Promise(resolve => reserve.close(resolve));
  const wrapper = new URL(`../.expo/final-C-${name}-serve.mjs`, import.meta.url);
  const entry = new URL(`../.expo/final-C-edge-candidate-v1/supabase/functions/${name}/index.js`, import.meta.url);
  await readFile(entry); // Missing reviewed candidate is a failure, never a synthetic substitute.
  await writeFile(wrapper, `const serve = Deno.serve; Deno.serve = handler => serve({hostname:'127.0.0.1',port:${port}}, handler); await import(${JSON.stringify(entry.href)});`);
  const child = spawn(process.env.FINAL_EDGE_DENO, ['run', '--no-config', '--no-lock', '--allow-net=127.0.0.1',
    '--allow-env=SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,SUPABASE_ANON_KEY', fileURLToPath(wrapper)], { env: {
    ...process.env, SUPABASE_URL: `http://127.0.0.1:${backend.address().port}`, SUPABASE_SERVICE_ROLE_KEY: 'fixture-service', SUPABASE_ANON_KEY: 'fixture-anon',
  } });
  let output = ''; child.stdout.on('data', bytes => { output += bytes; }); child.stderr.on('data', bytes => { output += bytes; });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`runtime start timeout ${output}`)), 15000);
    child.stderr.on('data', () => { if (output.includes('Listening on')) { clearTimeout(timer); resolve(); } });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', () => { clearTimeout(timer); reject(new Error(output)); });
  });
  return { calls, state,
    call: (body, authenticated = true) => fetch(`http://127.0.0.1:${port}`, { method: 'POST', headers: {
      'content-type': 'application/json', ...(authenticated ? { Authorization: 'Bearer fixture-user-jwt' } : {}),
    }, body: JSON.stringify(body) }),
    async close() { child.kill(); await new Promise(resolve => child.once('exit', resolve)); await new Promise(resolve => backend.close(resolve));
      await writeFile(new URL(`../.expo/final-C-${name}-deno-output.log`, import.meta.url), output); },
  };
}

for (const name of ['wing-jury-feed', 'wing-jury-vote', 'wing-jury-reveal', 'delete-account']) {
  test(`actual bundled ${name} with Deno and pinned SDK validates real HTTP boundary`, { skip: !process.env.FINAL_EDGE_DENO, timeout: 45000 }, async () => {
    const f = await fixture(name);
    try {
      if (name === 'wing-jury-feed') {
        const response = await f.call({}, false); assert.equal(response.status, 200);
        const body = await response.json(); assert.equal(body.photos.length, 1);
        assert.deepEqual(Object.keys(body.photos[0]).sort(), ['expires_at', 'media_type', 'signed_url', 'submission_id']);
        assert.match(body.photos[0].signed_url, /\/storage\/v1\/object\/sign\/wing-submissions\/processed\//);
        assert.equal(JSON.stringify(body).includes(destinationId), false);
        f.state.public = false; assert.equal((await (await f.call({}, false)).json()).photos.length, 0);
      } else if (name === 'wing-jury-vote') {
        assert.equal((await f.call({ submission_id: photoId, vote: 0 }, false)).status, 401);
        assert.equal((await f.call({ submission_id: photoId, vote: 0 })).status, 200);
        const insert = f.calls.find(call => call.path === '/rest/v1/wing_jury_votes' && call.method === 'POST');
        assert.equal(insert.headers.authorization, 'Bearer fixture-user-jwt'); assert.equal(insert.headers.apikey, 'fixture-anon');
        assert.deepEqual(insert.body, { submission_id: photoId, user_id: userId, vote: 0 });
      } else if (name === 'wing-jury-reveal') {
        assert.equal((await f.call({ submission_id: photoId, guest_verdict_registered: true })).status, 403);
        f.state.voted = true; const response = await f.call({ submission_id: photoId }); assert.equal(response.status, 200);
        assert.equal(response.headers.get('cache-control'), 'no-store'); assert.equal((await response.json()).restaurant.name, 'Synthetic Wings');
        for (const table of ['destination_ratings', 'user_destination_favorites', 'user_want_to_try']) {
          assert.equal(f.calls.find(call => call.path === `/rest/v1/${table}`).search.get('user_id'), `eq.${userId}`);
        }
      } else {
        f.state.failCompletion = true; assert.equal((await f.call({})).status, 500); assert.equal(f.state.deleted, false);
        f.state.failCompletion = false; assert.equal((await f.call({})).status, 200); assert.equal(f.state.deleted, true);
        const prepares = f.calls.filter(call => call.path.endsWith('/prepare_wing_account_media_cleanup'));
        assert.equal(prepares[0].body.p_correlation_id, prepares[1].body.p_correlation_id);
      }
    } finally { await f.close(); }
  });
}
