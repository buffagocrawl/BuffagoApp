// Probe the actual Android manifest AND JS bundle before opening a development
// client. /status alone responds while Metro's Windows watcher is still busy.
// No app flags, credentials, state or timeouts are changed by this probe.
const base = new URL(process.argv[2] || 'http://127.0.0.1:8081');
if (base.protocol !== 'http:' || !['127.0.0.1','localhost'].includes(base.hostname)) throw Error('Local Metro endpoint required');
const started = Date.now();
const status = await fetch(new URL('/status', base), {signal: AbortSignal.timeout(5000), redirect:'error'});
if (!status.ok || !(await status.text()).includes('packager-status:running')) throw Error('Metro status failed');
const response = await fetch(base, {headers:{'expo-platform':'android',accept:'application/expo+json'},signal:AbortSignal.timeout(10000),redirect:'error'});
if (!response.ok) throw Error(`Android manifest HTTP ${response.status}`);
const manifest = await response.json();
const bundle = new URL(manifest.launchAsset.url);
if (!['127.0.0.1','localhost'].includes(bundle.hostname) || bundle.port !== base.port || bundle.protocol !== 'http:') throw Error('Unexpected bundle host; use adb reverse and localhost');
const js = await fetch(bundle, {signal:AbortSignal.timeout(120000),redirect:'error'});
if (!js.ok) throw Error(`Android bundle HTTP ${js.status}`);
const bytes = (await js.arrayBuffer()).byteLength;
if (bytes < 1000) throw Error('Bundle response was unexpectedly small');
console.log(JSON.stringify({time:new Date().toISOString(),ready:true,manifestStatus:response.status,bundleStatus:js.status,bundleBytes:bytes,elapsedMs:Date.now()-started}));
