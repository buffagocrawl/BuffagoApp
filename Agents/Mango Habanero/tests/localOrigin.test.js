import { afterAll, beforeAll, expect, it } from 'vitest';
import express from 'express';
import { createServer } from 'vite';
import config from '../vite.config.js';
import { localRequestsOnly } from '../server/approval.mjs';

// Exercise the launcher's real ports and proxy without .env, Supabase or workers.
let api;
let frontend;
const received = [];
const origin = 'http://127.0.0.1:4317';
const path = '/api/submissions/11111111-1111-4111-8111-111111111111/preview';
beforeAll(async () => {
  const app = express();
  app.use((req, _res, next) => {
    received.push({ host: req.headers.host, origin: req.headers.origin, path: req.url });
    next();
  });
  app.use(localRequestsOnly(4318));
  app.post(path, (_req, res) => res.json({ fixture: true }));
  api = await new Promise((resolve, reject) => {
    const server = app.listen(4318, '127.0.0.1', () => resolve(server));
    server.on('error', reject);
  });
  frontend = await createServer({ ...config, configFile: false, envFile: false,
    server: { ...config.server, strictPort: true }, logLevel: 'silent' });
  await frontend.listen();
});
afterAll(async () => {
  await frontend?.close();
  if (api) await new Promise((resolve, reject) => api.close(error => error ? reject(error) : resolve()));
});

it('preserves the launch origin through the actual preview POST proxy', async () => {
  const response = await fetch(origin + path, { method: 'POST', headers: {
    Origin: origin, 'Sec-Fetch-Site': 'same-origin'
  } });
  expect(received.at(-1)).toEqual({ host: '127.0.0.1:4317', origin, path });
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
