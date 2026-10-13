import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import ts from 'typescript';

const cwd = fileURLToPath(new URL('../../', import.meta.url));
const output = fileURLToPath(new URL('../../../artifacts/guest-onboarding/', import.meta.url));
mkdirSync(output, { recursive: true });
const run = (name, files, env = {}) => {
  const r = spawnSync(process.execPath, ['--test', ...files], { cwd, env: { ...process.env, ...env }, windowsHide: true, encoding: 'utf8', timeout: 60000 });
  const log = (r.stdout || '') + (r.stderr || '');
  writeFileSync(`${output}${name}.log`, log);
  console.log(`${name}: ${r.status === 0 ? 'PASS' : 'FAIL'}; ${log.match(/# tests \d+/)?.[0] || r.error?.message || 'see log'}`);
  if (r.status !== 0) process.exitCode = 1;
};
run('focused-tests', ['tests/wingman-guest-onboarding.test.mjs', 'tests/wingman-confidence.test.mjs', 'tests/app-polish-focus-framing.test.mjs', 'tests/wingman-search-prefill.test.mjs', 'tests/mango-restaurant-intake.test.mjs', 'tests/mango-restaurant-postgres.test.mjs']);
if (process.env.BUFFAGO_PHASE7B3D_NATIVE17 === '1') {
  run('postgres-tests', ['tests/wingman-guest-postgres.test.mjs', 'tests/wingman-atomic-rate-limit.test.mjs']);
} else console.log('Native PostgreSQL not requested; set BUFFAGO_PHASE7B3D_NATIVE17=1 to exercise the disposable local fixture.');

const config = ts.readConfigFile(`${cwd}tsconfig.json`, ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, cwd);
// The repository's broad include picks up prior generated bundled Deno fixtures
// (thousands of errors). Typecheck all active source, preserving compiler flags.
const roots = parsed.fileNames.filter(file => !file.replaceAll('\\', '/').includes('/supabase/local/'));
const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram(roots, { ...parsed.options, noEmit: true }));
const summary = `Active-source typecheck: ${roots.length} roots; ${diagnostics.length} diagnostics. Generated supabase/local bundles excluded.\n`;
writeFileSync(`${output}typecheck.log`, summary + ts.formatDiagnostics(diagnostics, { getCanonicalFileName: p => p, getCurrentDirectory: () => cwd, getNewLine: () => '\n' }));
console.log(summary.trim());
if (diagnostics.length) process.exitCode = 1;

const backendFiles = ['supabase/config.toml', 'supabase/functions/wingman-intake/index.ts', 'supabase/functions/_shared/wingmanDeadline.ts', 'supabase/functions/_shared/wingmanConfidence.ts', 'supabase/functions/_shared/wingmanMenuEvidence.ts'];
writeFileSync(`${output}backend-manifest.json`, JSON.stringify({ deployed: false, verify_jwt: true, schemaChangesRequired: false, files: backendFiles.map(path => ({ path: `crawl/${path}`, sha256: createHash('sha256').update(readFileSync(`${cwd}${path}`)).digest('hex') })) }, null, 2) + '\n');
