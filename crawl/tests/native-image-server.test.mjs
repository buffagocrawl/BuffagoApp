import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createImageFixtureServer } from '../scripts/qa/native-image-server.mjs';

test('loopback image fixture isolates faults, holds delayed responses and recovers with fresh URLs', async () => {
  const server = createImageFixtureServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const control = async scenario => (await fetch(base + '/control', { method: 'POST', body: JSON.stringify({ scenario }) })).json();
  try {
    let state = await control('mixed');
    assert.equal((await fetch(`${base}/image/thumb/0/${state.revision}.png`)).status, 503);
    assert.equal((await fetch(`${base}/image/thumb/1/${state.revision}.png`)).headers.get('content-type'), 'image/png');
    state = await control('all-fail');
    for (const i of [0, 1]) assert.equal((await fetch(`${base}/image/thumb/${i}/${state.revision}.png`)).status, 503);
    await control('full-fail'); assert.equal((await fetch(base + '/image/full/0/3.png')).status, 503);
    await control('expired-full'); assert.equal((await fetch(base + '/image/full/0/4.png')).status, 403);
    state = await control('delayed-full');
    const delayed = fetch(`${base}/image/full/0/${state.revision}.png`);
    let evidence;
    for (let i = 0; i < 50; i++) { evidence = await (await fetch(base + '/evidence')).json(); if (evidence.held) break; }
    assert.equal(evidence.held, 1);
    await fetch(base + '/control', { method: 'POST', body: '{"release":true}' });
    assert.equal((await delayed).status, 200);
    const fresh = await control('success'); assert.ok(fresh.revision > state.revision);
    assert.equal((await fetch(`${base}/image/full/0/${fresh.revision}.png`)).status, 200);
    assert.equal((await fetch(base + '/image/full/../../private-original')).status, 404);
    assert.equal((await fetch(base + '/control', { method: 'POST', body: '{"scenario":"unknown"}' })).status, 400);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
