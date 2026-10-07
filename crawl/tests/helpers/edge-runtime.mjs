import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import jpeg from 'jpeg-js';
import { decode as decodePng } from 'fast-png';
import { webcrypto } from 'node:crypto';

// Execute the real Edge handler with injected SDK boundaries, without Deno/network.
export function edgeRuntime(slug, client, imports = {}) {
  let handler;
  const source = readFileSync(new URL(`../../supabase/functions/${slug}/index.ts`, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const shared = {
    bearerToken: (req) => req.headers.get('authorization')?.replace(/^Bearer /, ''),
    correlationId: (req, body = {}) => req.headers.get('x-wing-correlation-id') || body.correlationId || 'unknown',
    safePathFingerprint: () => 'redacted',
    response: (status, body) => Response.json(body, { status }),
    failure: (req, code, message, stage, status, body = {}, options = {}) => Response.json({ ok: false, code, message, stage, ...options }, { status }),
  };
  vm.runInNewContext(code, {
    exports: {}, Response, Request, Headers, Blob, Uint8Array, TextDecoder, TextEncoder, crypto: webcrypto, URL,
    fetch: imports.fetch ?? fetch,
    console: { log() {}, error() {}, warn() {} },
    Deno: { env: { get: () => 'test' }, serve: (fn) => { handler = fn; } },
    require: (name) => {
      if (imports[name]) return imports[name];
      if (name.includes('supabase-js')) return { createClient: () => client };
      if (name.includes('wingShotResponse')) return shared;
      if (name.includes('jpeg-js')) return { default: jpeg };
      if (name.includes('fast-png')) return { decode: decodePng };
      throw new Error(`Unmocked Edge import: ${name}`);
    },
  });
  return async (body, options = {}) => {
    const result = await handler(new Request('https://test.local', {
      method: 'POST', headers: { authorization: 'Bearer test', 'content-type': 'application/json' },
      body: JSON.stringify(body), ...options,
    }));
    return { status: result.status, body: await result.json() };
  };
}
