import { afterAll, beforeAll, expect, it } from 'vitest';
import express from 'express';
import { createServer } from 'vite';
import config from '../vite.config.js';
import { localRequestsOnly } from '../server/approval.mjs';

// Exercise the real proxy/guard on isolated loopback ports, without .env,
// Supabase, workers, or interference with the running reviewer app.
let api;
let frontend;
const received = [];
let origin, frontendPort, guard;
const path = '/api/submissions/11111111-1111-4111-8111-111111111111/preview';
beforeAll(async () => {
  const app = express();
  app.use((req, _res, next) => {
    received.push({ host: req.headers.host, origin: req.headers.origin, path: req.url });
    next();
  });
  app.use((req,res,next)=>guard(req,res,next));
  app.post(path, (_req, res) => res.json({ fixture: true }));
  api = await new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
    server.on('error', reject);
  });
  frontend = await createServer({ ...config, configFile: false, envFile: false,
    server: { ...config.server, port: 0, strictPort: true,
      proxy: { '/api': { ...config.server.proxy['/api'], target: `http://127.0.0.1:${api.address().port}` } } }, logLevel: 'silent' });
  await frontend.listen();
  frontendPort=frontend.httpServer.address().port;
  origin=`http://127.0.0.1:${frontendPort}`;
  guard=localRequestsOnly(api.address().port,frontendPort);
});
afterAll(async () => {
  await frontend?.close();
  if (api?.listening) await new Promise((resolve, reject) => api.close(error => error ? reject(error) : resolve()));
});

it('preserves the launch origin through the actual preview POST proxy', async () => {
  const response = await fetch(origin + path, { method: 'POST', headers: {
    Origin: origin, 'Sec-Fetch-Site': 'same-origin'
  } });
  expect(received.at(-1)).toEqual({ host: `127.0.0.1:${frontendPort}`, origin, path });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ fixture: true });
});

it.each(['https://foreign.example', 'http://127.0.0.1:9999', 'http://localhost:4317'])('rejects mismatched origin %s through the proxy', async foreign => {
  const response = await fetch(origin + path, { method: 'POST', headers: {
    Origin: foreign, 'Sec-Fetch-Site': 'same-origin',
    'X-Forwarded-Host': '127.0.0.1:4317', 'X-Forwarded-Proto': 'http'
  } });
  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ error: 'Local same-origin requests only.' });
});

it('rejects a foreign Host even when its Origin matches', async () => {
  const response = await fetch(origin + path, { method: 'POST', headers: {
    Host: 'foreign.example:4317', Origin: 'http://foreign.example:4317'
  } });
  expect(response.status).toBe(403);
});
