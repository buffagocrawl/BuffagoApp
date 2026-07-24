import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const teamId = process.env.APPLE_TEAM_ID || process.env.EXPO_PUBLIC_APPLE_TEAM_ID || '';
const fingerprintHex = (process.env.ANDROID_RELEASE_SHA256 || process.env.EXPO_PUBLIC_ANDROID_RELEASE_SHA256 || '').replace(/:/g, '').toUpperCase();
const fingerprint = fingerprintHex.match(/.{2}/g)?.join(':') || '';
const packageName = 'com.buffago.app';

function json(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=300' });
  res.end(JSON.stringify(value));
}

function association(res, kind) {
  if (kind === 'apple') {
    if (!/^[A-Z0-9]{6,12}$/.test(teamId)) return json(res, 503, { error: 'Apple association configuration is unavailable.' });
    return json(res, 200, { applinks: { apps: [], details: [{ appID: `${teamId}.${packageName}`, paths: ['/r/*'] }] } });
  }
  if (!/^[A-F0-9]{64}$/.test(fingerprintHex)) return json(res, 503, { error: 'Android association configuration is unavailable.' });
  return json(res, 200, [{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: packageName, sha256_cert_fingerprints: [fingerprint] } }]);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/.well-known/apple-app-site-association' || url.pathname === '/apple-app-site-association') return association(res, 'apple');
  if (url.pathname === '/.well-known/assetlinks.json') return association(res, 'android');
  if (url.pathname.startsWith('/r/')) {
    const code = url.pathname.slice(3);
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(code)) return json(res, 400, { error: 'Invalid referral link.' });
    res.setHeader('cache-control', 'no-store');
  }
  const fileName = url.pathname === '/styles.css' ? 'styles.css' : 'index.html';
  const body = await readFile(path.join(root, fileName), 'utf8');
  res.writeHead(200, { 'content-type': fileName.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/html; charset=utf-8' });
  res.end(body);
});

server.listen(process.env.PORT || 3000);
