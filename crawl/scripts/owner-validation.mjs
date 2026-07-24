import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd(), '..');
const dir = path.join(root, 'docs', 'reviews', 'owner-assisted-release-validation-20260724');
const statePath = path.join(dir, 'validation-state.json');
const allowed = new Set(['NOT_RUN', 'PASS', 'FAIL', 'BLOCKED']);

const read = () => JSON.parse(fs.readFileSync(statePath, 'utf8'));
const write = (state) => fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');

const [, , command = 'list', id, status, ...noteParts] = process.argv;
const state = read();
if (command === 'list') {
  for (const test of state.tests) console.log(`${test.id}\t${test.status}\t${test.title}`);
} else if (command === 'show') {
  const test = state.tests.find((item) => item.id === id);
  if (!test) throw new Error(`Unknown test id: ${id}`);
  console.log(JSON.stringify(test, null, 2));
} else if (command === 'record') {
  if (!id || !allowed.has(status)) throw new Error('Usage: npm run owner-validation -- record <TEST-ID> <NOT_RUN|PASS|FAIL|BLOCKED> [notes]');
  const test = state.tests.find((item) => item.id === id);
  if (!test) throw new Error(`Unknown test id: ${id}`);
  test.status = status;
  test.notes = noteParts.join(' ');
  test.updatedAt = new Date().toISOString();
  write(state);
  console.log(`Recorded ${id}=${status}`);
} else {
  throw new Error('Commands: list, show, record');
}
