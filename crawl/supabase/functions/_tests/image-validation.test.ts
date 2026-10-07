// @ts-nocheck
// Native Deno + real SDK/decoder execution; only HTTP is replaced.
import jpeg from 'npm:jpeg-js@0.4.4';
import { encode } from 'npm:fast-png@6.2.0';

Deno.test('native Edge validator decodes bytes and enforces receipt/size/dimension boundaries', async (t) => {
  const originalFetch = globalThis.fetch;
  const originalServe = Deno.serve;
  const user = '10000000-0000-4000-a000-000000000001';
  const correlation = '20000000-0000-4000-a000-000000000002';
  let handler, file, receipts = 0;
  const envNames = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
  const previous = envNames.map((key) => Deno.env.get(key));
  Deno.env.set('SUPABASE_URL', 'https://edge-fixture.example');
  Deno.env.set('SUPABASE_ANON_KEY', 'fixture');
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'fixture-service');
  Deno.serve = (fn) => { handler = fn; };
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === 'string' ? input : input.url ?? String(input));
    if (url.pathname === '/auth/v1/user') return Response.json({ id: user });
    if (url.pathname.includes('/storage/v1/object/')) return new Response(file, { headers: { 'content-type': file.type } });
    if (url.pathname === '/rest/v1/wing_media_validation_receipts') { receipts++; return new Response(null, { status: 201 }); }
    throw new Error(`Unexpected fixture endpoint ${url.pathname}`);
  };
  try {
    await import('../wing-media-validate/index.ts');
    const jpg = jpeg.encode({ width: 2, height: 2, data: new Uint8Array(16).fill(255) }, 90).data;
    const png = encode({ width: 2, height: 2, channels: 4, depth: 8, data: new Uint8Array(16).fill(255) });
    const wide = encode({ width: 2049, height: 1, channels: 4, depth: 8, data: new Uint8Array(8196).fill(255) });
    for (const [name, bytes, mime, status] of [
      ['valid JPEG ignores fake dimensions', jpg, 'image/jpeg', 200],
      ['valid PNG ignores fake dimensions', png, 'image/png', 200],
      ['truncated JPEG', jpg.subarray(0, 40), 'image/jpeg', 400],
      ['malformed PNG', new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), 'image/png', 400],
      ['arbitrary bytes', new TextEncoder().encode('not an image'), 'image/jpeg', 400],
      ['server dimension over 2048', wide, 'image/png', 400],
      ['size over 20 MiB', jpg, 'image/jpeg', 413],
    ]) await t.step(name, async () => {
      file = new Blob([bytes], { type: mime }); const before = receipts;
      const response = await handler(new Request('https://edge-fixture.example/function', {
        method: 'POST', headers: { authorization: 'Bearer fixture', 'content-type': 'application/json' },
        body: JSON.stringify({ correlationId: correlation, bucket: 'wing-shot-staging', objectPath: `${user}/${correlation}/photo.jpg`, mediaType: 'photo', declaredMimeType: mime,
          declaredFileSizeBytes: name.startsWith('size') ? 20971521 : bytes.length, localMetadata: { width: 99999, height: 99999 } }),
      }));
      if (response.status !== status) throw new Error(`${name}: expected ${status}, got ${response.status}`);
      const result = await response.json();
      if (status === 200 && (result.width !== 2 || result.height !== 2 || receipts !== before + 1)) throw new Error('Missing exact-byte receipt or incorrect server dimensions');
      if (status !== 200 && receipts !== before) throw new Error('Invalid bytes received a receipt');
    });
  } finally {
    globalThis.fetch = originalFetch; Deno.serve = originalServe;
    envNames.forEach((key, index) => previous[index] === undefined ? Deno.env.delete(key) : Deno.env.set(key, previous[index]));
  }
});
