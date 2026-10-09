// Loopback-only development image faults; never reads uploads or storage paths.
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function createImageFixtureServer() {
  const assets = ['../../assets/wing-user.png', '../../assets/logo/BuffaGo-master.png']
    .map(file => readFileSync(fileURLToPath(new URL(file, import.meta.url))));
  const scenarios = new Set(['success', 'gallery-delay', 'delayed-full', 'full-fail', 'expired-full', 'mixed', 'all-fail']);
  let state = { scenario: 'success', revision: Date.now() };
  const requests = [];
  const held = new Set();
  const send = (res, status, body, type = 'application/json') => {
    res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', Connection: 'close' }); res.end(body);
  };
  const hold = (res, complete, timedOut = () => {}) => {
    const entry = { complete, res };
    held.add(entry);
    const timer = setTimeout(() => { held.delete(entry); timedOut(); send(res, 504, '{}'); }, 90000);
    res.on('close', () => { clearTimeout(timer); held.delete(entry); });
  };
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/control' && req.method === 'POST') {
      let body = ''; for await (const chunk of req) body += chunk;
      let command; try { command = JSON.parse(body); } catch { return send(res, 400, '{}'); }
      if (command.release) { for (const entry of [...held]) entry.complete(); held.clear(); }
      else if (scenarios.has(command.scenario)) { state = { scenario: command.scenario, revision: state.revision + 1 }; }
      else return send(res, 400, '{}');
      return send(res, 200, JSON.stringify(state));
    }
    if (url.pathname === '/state' && req.method === 'GET') {
      const snapshot = { ...state };
      if (snapshot.scenario === 'gallery-delay' && url.searchParams.get('kind') === 'gallery')
        return hold(res, () => send(res, 200, JSON.stringify(snapshot)));
      return send(res, 200, JSON.stringify(snapshot));
    }
    if (url.pathname === '/evidence' && req.method === 'GET')
      return send(res, 200, JSON.stringify({ ...state, held: held.size, requests }));
    const image = url.pathname.match(/^\/image\/(thumb|full)\/(0|1)\/(\d+)\.png$/);
    if (!image || req.method !== 'GET') return send(res, 404, '{}');
    const [, kind, ordinal, revision] = image;
    const scenario = state.scenario;
    const status = kind === 'thumb' && (scenario === 'all-fail' || (scenario === 'mixed' && ordinal === '0')) ? 503
      : kind === 'full' && scenario === 'full-fail' ? 503
        : kind === 'full' && scenario === 'expired-full' ? 403 : 200;
    // Evidence includes no URLs, signatures, credentials or absolute paths.
    const record = { kind, ordinal: Number(ordinal), revision: Number(revision), scenario, status: null };
    requests.push(record);
    res.on('close', () => { if (!res.writableFinished) record.status = 'CANCELLED'; });
    const complete = () => { record.status = status; send(res, status, status === 200 ? assets[Number(ordinal)] : '{}', status === 200 ? 'image/png' : 'application/json'); };
    if (kind === 'full' && scenario === 'delayed-full') return hold(res, complete, () => { record.status = 504; });
    complete();
  });
  return server;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createImageFixtureServer().listen(8084, '127.0.0.1', () => console.log('Local image fixture listening on 8084'));
}
