// Local packaging only: never invokes Supabase CLI, credentials, or deployment.
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const crawl = join(root, 'crawl');
const deno = process.env.FINAL_EDGE_DENO;
if (!deno || !resolve(deno).toLowerCase().endsWith('deno.exe')) throw new Error('FINAL_EDGE_DENO absolute reviewed executable required');
const candidate = join(crawl, '.expo/final-C-edge-candidate-v1');
const functions = ['wing-jury-feed', 'wing-jury-vote', 'wing-jury-reveal', 'delete-account'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const inventory = async path => ({ path: relative(root, path).replaceAll('\\', '/'), bytes: (await readFile(path)).length, sha256: hash(await readFile(path)) });
const environment = { ...process.env, DENO_DIR: join(crawl, '.expo/final-C-deno-cache') };
const run = args => {
  const result = spawnSync(deno, args, { cwd: crawl, env: environment, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${args[0]} failed: ${result.stderr || result.error}`);
  return { stdout: result.stdout, stderr: result.stderr };
};
await mkdir(join(candidate, 'supabase/functions'), { recursive: true });
const log = [run(['--version']).stdout];
const sourceFiles = [...functions.map(name => join(crawl, `supabase/functions/${name}/index.ts`)),
  join(crawl, 'supabase/functions/_shared/wingJury.ts'), join(crawl, 'supabase/config.toml'), join(crawl, 'deno.lock')];
const sourceInventory = await Promise.all(sourceFiles.map(inventory));
for (const name of functions) {
  const entry = join(candidate, `supabase/functions/${name}/index.js`);
  await mkdir(dirname(entry), { recursive: true });
  const args = ['bundle', '--no-config', '--lock=deno.lock', '--frozen-lockfile', '--platform=deno',
    `supabase/functions/${name}/index.ts`, '--output', entry];
  log.push(run(args).stderr);
  const replay = join(crawl, `.expo/final-C-${name}-repeat.js`);
  log.push(run([...args.slice(0, -1), replay]).stderr);
  if (hash(await readFile(entry)) !== hash(await readFile(replay))) throw new Error(`${name} bundle not byte reproducible`);
}
const config = `project_id = "buffago-final-candidate"\n\n${functions.map(name =>
  `[functions.${name}]\nverify_jwt = ${['wing-jury-vote', 'delete-account'].includes(name)}\nentrypoint = "./functions/${name}/index.js"\n`).join('\n')}`;
const configPath = join(candidate, 'supabase/config.toml');
await writeFile(configPath, config);
await copyFile(join(crawl, 'deno.lock'), join(candidate, 'deno.lock'));
const artifactPaths = [...functions.map(name => join(candidate, `supabase/functions/${name}/index.js`)), configPath, join(candidate, 'deno.lock')].sort();
// Portable USTAR: deterministic order, uid/gid/mtime=0, mode=0644, no path timestamps.
const tarParts = [];
for (const path of artifactPaths) {
  const bytes = await readFile(path); const header = Buffer.alloc(512);
  const put = (value, offset, size) => header.write(value, offset, size, 'ascii');
  const octal = (value, size) => value.toString(8).padStart(size - 1, '0') + '\0';
  const name = relative(candidate, path).replaceAll('\\', '/');
  if (Buffer.byteLength(name) > 100) throw new Error('tar path too long');
  put(name, 0, 100); put(octal(0o644, 8), 100, 8); put(octal(0, 8), 108, 8); put(octal(0, 8), 116, 8);
  put(octal(bytes.length, 12), 124, 12); put(octal(0, 12), 136, 12); header.fill(32, 148, 156);
  put('0', 156, 1); put('ustar\0', 257, 6); put('00', 263, 2);
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  put(checksum.toString(8).padStart(6, '0') + '\0 ', 148, 8);
  tarParts.push(header, bytes, Buffer.alloc((512 - bytes.length % 512) % 512));
}
tarParts.push(Buffer.alloc(1024));
const archivePath = join(crawl, '.expo/final-C-edge-candidate-v1.tar');
const archiveBytes = Buffer.concat(tarParts);
await writeFile(archivePath, archiveBytes);
const immutableArchivePath = join(crawl, `.expo/final-C-edge-candidate-${hash(archiveBytes)}.tar`);
await writeFile(immutableArchivePath, archiveBytes);
await writeFile(join(crawl, '.expo/final-C-edge-packaging.log'), log.join('\n'));
const manifest = {
  status: 'REVIEW_CANDIDATES_ONLY_NO_DEPLOYMENT_AUTHORIZATION', target: 'vhfxnizaxdanmvmouuaf',
  candidate_version: 'final-C-v1', runtime: log[0].trim(), packager: await inventory(fileURLToPath(import.meta.url)),
  reviewed_runtime_executable: await inventory(deno),
  source_inventory: sourceInventory, deployment_inventory: await Promise.all(artifactPaths.map(inventory)), archive: await inventory(archivePath),
  retained_immutable_archive: await inventory(immutableArchivePath),
  gateway: Object.fromEntries(functions.map(name => [name, { verify_jwt: ['wing-jury-vote', 'delete-account'].includes(name) }])),
  dependencies: { supabase_js: '2.58.0', integrity: 'Frozen existing crawl/deno.lock verified by Deno; dependencies bundled into each index.js',
    shared: 'Wing Jury source handlers import only _shared/wingJury.ts; SDK 2.58.0 pinned and fully bundled; delete-account separate reviewed repair candidate' },
  reproducibility: 'Each bundle built twice and SHA256 compared; deterministic USTAR with zero metadata timestamps; deployment JS needs no remote imports',
  prerequisites: ['Human approval of exact Edge artifacts/config including separate delete-account correction',
    'Read-only actual deployed predecessor bundle/config inventory and recovery disposition',
    'Approved account media-write fence through Auth deletion and staged/unfinalized original cleanup acceptance',
    'Approved distributed rate limiter and controlled live 429/retry checks', 'Verified actual production JWT gateway and Storage signing/expiry boundaries'],
  predecessor_inventory: Object.fromEntries(functions.map(name => [name, { status: 'UNAVAILABLE_EXTERNAL_READ_ONLY_EVIDENCE_REQUIRED', previous_version: null, bundle_sha256: null, verify_jwt: null }])),
};
await writeFile(join(root, 'docs/buffago-final-edge-candidates.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ archive: manifest.archive, functions: functions.length, reproducible: true }));
