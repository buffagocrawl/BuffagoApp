import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {handle} from '../cloud/feed/handler.mjs';
globalThis.crypto ??= webcrypto;
const token='a'.repeat(43);
const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(x=>x.toString(16).padStart(2,'0')).join('');
const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'secret-not-for-browser'};
test('authentication rejects public, invalid and mutating requests',async()=>{
 assert.equal((await handle(new Request('https://x/buffago-pi-feed'),env)).status,401);
 assert.equal((await handle(new Request('https://x/buffago-pi-feed',{method:'POST'}),env)).status,405);
 const res=await handle(new Request('https://x/buffago-pi-feed',{headers:{Authorization:'Bearer '+'b'.repeat(43)}}),env,async()=>Response.json({sha256:hash}));
 assert.equal(res.status,401);
});
test('valid reader gets only fixed sanitized object; no credential/header forwarding',async()=>{
 const calls=[];
 const data={schema_version:1,exported_at:'2026-10-30T00:00:00Z',states:[],social:{reels:[]}};
 const fetcher=async(url,options)=>{calls.push({url,options});return Response.json(url.endsWith('reader.json')?{sha256:hash}:data);};
 const res=await handle(new Request('https://x/buffago-pi-feed',{headers:{Authorization:'Bearer '+token}}),env,fetcher);
 assert.equal(res.status,200);assert.deepEqual(await res.json(),data);
 assert.equal(calls.length,2);assert.ok(calls.every(c=>c.options.method==='GET'));
 assert.ok(calls.every(c=>c.url.includes('/object/authenticated/jalapeno-assets/guess-wing-spot-analytics-v1/dashboard/')));
 assert.equal(res.headers.get('Access-Control-Allow-Origin'),null);
});
test('bad or failed upstream never returns raw private data or exception',async()=>{
 let i=0;
 const res=await handle(new Request('https://x/buffago-pi-feed',{headers:{Authorization:'Bearer '+token}}),env,async()=>++i===1?Response.json({sha256:hash}):Response.json({schema_version:1,answer:'PRIVATE'}));
 assert.equal(res.status,503);assert.ok(!(await res.text()).includes('PRIVATE'));
});
