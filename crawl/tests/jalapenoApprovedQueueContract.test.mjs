import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const migration = read('supabase/migrations/20260729172000_jalapeno_approved_queue_authority.sql');
const rootRead = (name) => readFileSync(new URL(`../../${name}`, import.meta.url), 'utf8');
const workflow = rootRead('.github/workflows/jalapeno-schedule.yml');

test('Approved Queue selection is deterministic and transactionally claimed', () => {
  assert.match(migration, /run_wing_approved_queue_selection/);
  assert.match(migration, /for update skip locked/);
  assert.match(migration, /is_publish_priority desc/);
  assert.match(migration, /priority desc/);
  assert.match(migration, /approved_at asc nulls last, s\.created_at asc, s\.id/);
  assert.match(migration, /media_type = 'video'/);
  assert.match(migration, /consented_at is not null/);
  assert.match(migration, /storage\.objects/);
  assert.doesNotMatch(migration, /order by random\(/i);
});

test('Jalapeño workflow has one safe manual/scheduled pipeline', () => {
  assert.match(workflow, /name: Jalapeño — Publish Approved Wing Shot/);
  for (const input of ['mode:', 'platform:', 'submission_id:', 'skip_location_lookup:', 'keep_processed_artifact:']) {
    assert.match(workflow, new RegExp(input));
  }
  assert.match(workflow, /group: jalapeno-social-publisher/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /JALAPENO_AUTOMATION_ENABLED == 'true'/);
  assert.match(workflow, /python wing_shots_main\.py/);
  assert.doesNotMatch(workflow, /python main\.py|jalapeno_video_assets|random video/i);
});

test('video rendering is muted and social-safe', () => {
  const generation = rootRead('Agents/Jalapeno/wing_shots/generation.py');
  assert.match(generation, /-an/);
  assert.match(generation, /libx264/);
  assert.match(generation, /yuv420p/);
  assert.match(generation, /faststart/);
  assert.match(generation, /boxblur/);
  assert.match(generation, /WING SHOT/);
  assert.match(generation, /More game\. Less Yelp\./);
});
