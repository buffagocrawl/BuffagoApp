import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = resolve(scriptDir, '..');
export const migrationRoot = join(repositoryRoot, 'supabase', 'migrations');
export const manifestPath = resolve(repositoryRoot, '..', 'docs', 'deployments', 'migration-status.md');
const migrationPattern = /^(\d{14})_([a-z0-9]+(?:[a-z0-9_-]*[a-z0-9])?)\.sql$/;

function walkSqlFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walkSqlFiles(path) : entry.isFile() && entry.name.endsWith('.sql') ? [path] : [];
  });
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function parseMigration(path) {
  const name = basename(path);
  const match = name.match(migrationPattern);
  return match ? { path, name, version: match[1], hash: sha256(path) } : null;
}

function parseManifest() {
  if (!existsSync(manifestPath)) return new Map();
  const entries = new Map();
  for (const line of readFileSync(manifestPath, 'utf8').split(/\r?\n/)) {
    const columns = line.split('|').map((column) => column.trim());
    if (columns.length >= 7 && migrationPattern.test(columns[1]) && /^[a-f0-9]{64}$/.test(columns[6])) {
      entries.set(columns[1], { hash: columns[6], environment: columns[2], status: columns[3] });
    }
  }
  return entries;
}

function parseLedger(path) {
  if (!path) return [];
  return readFileSync(resolve(path), 'utf8').split(/\r?\n/).map((line) => line.trim())
    .filter(Boolean).map((line) => line.split('|')[0].trim()).filter((version) => /^\d{14}$/.test(version));
}

export function inspect({ ledgerFile } = {}) {
  const allSql = walkSqlFiles(migrationRoot);
  const directSql = allSql.filter((path) => relative(migrationRoot, path).split(/[/\\]/).length === 1);
  const rootFiles = directSql.map(parseMigration).filter(Boolean);
  const archiveTimestamped = allSql.filter((path) => relative(migrationRoot, path).split(/[/\\]/).length > 1).map(parseMigration).filter(Boolean);
  const invalidRoot = directSql.filter((path) => !path.endsWith('deployed-archive.sql') && !migrationPattern.test(basename(path)));
  const byVersion = new Map();
  for (const item of [...rootFiles, ...archiveTimestamped]) byVersion.set(item.version, [...(byVersion.get(item.version) || []), item]);
  const duplicates = [...byVersion.entries()].filter(([, items]) => items.length > 1);
  const manifest = parseManifest();
  const checksumMismatches = rootFiles.filter((item) => manifest.has(item.name) && manifest.get(item.name).hash !== item.hash);
  const unmanifested = rootFiles.filter((item) => !manifest.has(item.name));
  const rootNames = new Set(rootFiles.map((item) => item.name));
  const manifestedMissingRoot = [...manifest.entries()]
    .filter(([name, entry]) => entry.environment === 'production' && !rootNames.has(name))
    .map(([name]) => name);
  const ledgerMissingRoot = parseLedger(ledgerFile).filter((version) => !new Set(rootFiles.map((item) => item.version)).has(version));
  const failures = [];
  if (archiveTimestamped.length) failures.push('timestamped migrations exist below an archive/deployed directory');
  if (duplicates.length) failures.push('duplicate migration timestamps exist');
  if (invalidRoot.length) failures.push('root SQL filenames do not follow migration conventions');
  if (checksumMismatches.length) failures.push('an existing migration checksum differs from the deployment manifest');
  if (unmanifested.length) failures.push('root migrations are missing from the deployment manifest');
  if (manifestedMissingRoot.length) failures.push('a production migration is recorded in the manifest but has no canonical root file');
  if (ledgerMissingRoot.length) failures.push('an applied ledger version has no corresponding root migration');
  return { rootFiles, archiveTimestamped, invalidRoot, duplicates, checksumMismatches, unmanifested, manifestedMissingRoot, ledgerMissingRoot, failures,
    legacyArchives: allSql.filter((path) => basename(path) === 'deployed-archive.sql') };
}

function printReport(report) {
  console.log(`Root migrations: ${report.rootFiles.length}`);
  console.log(`Legacy archives: ${report.legacyArchives.length}`);
  if (report.archiveTimestamped.length) console.error(`Archive-only timestamped migrations: ${report.archiveTimestamped.map((item) => relative(repositoryRoot, item.path)).join(', ')}`);
  if (report.duplicates.length) console.error(`Duplicate timestamps: ${report.duplicates.map(([version]) => version).join(', ')}`);
  if (report.invalidRoot.length) console.error(`Invalid filenames: ${report.invalidRoot.map((path) => basename(path)).join(', ')}`);
  if (report.checksumMismatches.length) console.error(`Checksum mismatches: ${report.checksumMismatches.map((item) => item.name).join(', ')}`);
  if (report.unmanifested.length) console.error(`Unmanifested migrations: ${report.unmanifested.map((item) => item.name).join(', ')}`);
  if (report.manifestedMissingRoot.length) console.error(`Manifested production migrations missing root files: ${report.manifestedMissingRoot.join(', ')}`);
  if (report.ledgerMissingRoot.length) console.error(`Ledger versions missing root files: ${report.ledgerMissingRoot.join(', ')}`);
  if (report.failures.length) { console.error(`Migration integrity FAILED: ${report.failures.join('; ')}`); return 1; }
  console.log('Migration integrity PASSED.');
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const ledgerIndex = process.argv.indexOf('--ledger-file');
  process.exitCode = printReport(inspect({ ledgerFile: ledgerIndex >= 0 ? process.argv[ledgerIndex + 1] : undefined }));
}
