import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { workerInvocation } from './approval.mjs';
import { existsSync } from 'node:fs';

try {
  const { executable, options, args } = workerInvocation('00000000-0000-0000-0000-000000000000');
  if (!existsSync(executable) || !existsSync(args[0])) throw new Error('Python executable or photo worker script is missing.');
  const result = spawnSync(executable, ['-c', 'from wing_processing_worker.cli import build_provider; build_provider()'], { ...options, timeout: 15000, maxBuffer: 65536 });
  if (result.error || result.status !== 0) throw new Error('Python worker dependencies are missing. Install Agents/Jalapeno/requirements.txt with the configured Python.');
  console.log('Mango photo-worker prerequisites verified (no jobs claimed).');
} catch (error) { console.error(error.message); process.exitCode = 1; }
