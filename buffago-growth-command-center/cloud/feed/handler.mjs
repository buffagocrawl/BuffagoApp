// Dedicated feed function. Only fixed private Storage GETs; no app, Meta or mutation path.
const prefix = '/storage/v1/object/authenticated/jalapeno-assets/guess-wing-spot-analytics-v1/dashboard/';
const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' };
const response = (status, code) => new Response(JSON.stringify({error:code}), {status,headers});
export async function handle(req, env, fetcher=fetch) {
  if (req.method !== 'GET') return response(405,'method_not_allowed');
  if (!new URL(req.url).pathname.endsWith('/buffago-pi-feed')) return response(404,'not_found');
  const token = /^Bearer ([A-Za-z0-9_-]{43,128})$/.exec(req.headers.get('Authorization') || '')?.[1];
  if (!token) return response(401,'unauthorized');
  try {
    const origin = env.SUPABASE_URL;
    if (!/^https:\/\/[a-z0-9.-]+$/.test(origin || '')) return response(503,'feed_unavailable');
    const opts = {method:'GET',redirect:'error',signal:AbortSignal.timeout(12000),
      headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY}};
    const auth = await fetcher(origin+prefix+'reader.json', opts);
    if (!auth.ok) return response(503,'feed_unavailable');
    const expected = (await auth.json()).sha256;
    const actual = [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))].map(x=>x.toString(16).padStart(2,'0')).join('');
    if (typeof expected !== 'string' || expected.length!==64) return response(503,'feed_unavailable');
    let diff=0;for(let i=0;i<64;i++)diff|=actual.charCodeAt(i)^expected.charCodeAt(i);
    if(diff) return response(401,'unauthorized');
    const source = await fetcher(origin+prefix+'feed.json', opts);
    if(!source.ok) return response(503,'feed_unavailable');
    const text = await source.text();
    if(text.length>2000000) return response(503,'feed_unavailable');
    const data=JSON.parse(text);
    const allowed=new Set(['schema_version','exported_at','social','publications','states','state_order','weekly_instagram']);
    if(data.schema_version!==1 || Object.keys(data).some(k=>!allowed.has(k)) || !Array.isArray(data.states) || !Array.isArray(data.social?.reels)) return response(503,'feed_unavailable');
    return new Response(text,{status:200,headers});
  } catch { return response(503,'feed_unavailable'); }
}
