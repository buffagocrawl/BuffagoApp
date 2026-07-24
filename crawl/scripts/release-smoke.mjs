import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const root = process.cwd();
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';

async function testFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await testFiles(path));
    else if (entry.name.endsWith('.test.js')) files.push(path);
  }
  return files;
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: 'inherit',
      shell: process.platform === 'win32' && command !== process.execPath,
    });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited with ${code ?? signal}`));
    });
  });
}

const files = await testFiles(join(root, 'tests'));
const checks = [
  [process.execPath, ['--test', '--experimental-default-type=module', ...files]],
  [npmCommand, ['run', 'typecheck']],
  [npmCommand, ['run', 'lint']],
  [npmCommand, ['run', 'migration:integrity']],
  [npxCommand, ['expo-doctor']],
  [npxCommand, ['expo', 'export', '--platform', 'web']],
];

for (const [command, args] of checks) await run(command, args);
