// Explicit, allowlisted recovery requests. Dry run is the default; no worker is started.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';

export function parseRecoveryArgs(argv, env = process.env) {
  const args = { execute: false, retryFailed: false, manifest: null, expectedProject: null, inventory: false };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--execute') args.execute = true;
    else if (flag === '--inventory') args.inventory = true;
    else if (flag === '--retry-failed') args.retryFailed = true;
    else if (flag === '--manifest') args.manifest = argv[++i];
    else if (flag === '--expected-project-ref') args.expectedProject = argv[++i];
    else throw new Error('Unknown recovery argument');
  }
  if (!args.manifest && !args.inventory) throw new Error('An explicit --manifest file is required');
  if (args.inventory && (args.manifest || args.execute || args.retryFailed)) throw new Error('--inventory is a separate read-only operation');
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Server credentials are required');
  const url = new URL(env.SUPABASE_URL);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (!local && (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co'))) throw new Error('Unsupported recovery endpoint');
  const projectRef = local ? 'local' : url.hostname.split('.')[0];
  if (args.execute && args.expectedProject !== projectRef) throw new Error('Execution requires a matching --expected-project-ref');
  if (args.retryFailed && !args.execute) throw new Error('--retry-failed requires --execute');
  return { ...args, projectRef };
}

export async function requestRecovery(client, args, manifest) {
  const ids = Array.from(new Set(manifest?.submission_ids));
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!Array.isArray(manifest?.submission_ids) || ids.length < 1 || ids.length > 100
    || ids.some(id => typeof id !== 'string' || !uuid.test(id))) throw new Error('Manifest must contain 1–100 submission UUIDs');
  const { data, error } = await client.rpc('request_wing_photo_derivatives', {
    p_submission_ids: ids, p_dry_run: !args.execute, p_retry_failed: args.retryFailed,
  });
  if (error) throw new Error('Recovery request failed; inspect privileged server audit/logs');
  return { project_ref: args.projectRef, dry_run: !args.execute, results: data };
}

export async function inventoryRecovery(client, args) {
  const results = [];
  for (let offset = 0; offset <= 100000; offset += 100) {
    const { data, error } = await client.rpc('list_wing_photo_derivative_candidates', { p_limit: 100, p_offset: offset });
    if (error || !Array.isArray(data)) throw new Error('Recovery inventory failed');
    results.push(...data);
    if (data.length < 100) return { project_ref: args.projectRef, dry_run: true, results };
  }
  throw new Error('Inventory exceeds the supported limit; use scoped database inspection');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = parseRecoveryArgs(process.argv.slice(2));
    const manifest = args.inventory ? null : JSON.parse(readFileSync(args.manifest, 'utf8'));
    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } });
    console.log(JSON.stringify(args.inventory ? await inventoryRecovery(client, args) : await requestRecovery(client, args, manifest), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
