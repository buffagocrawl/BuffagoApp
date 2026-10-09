import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRecoveryArgs,requestRecovery,inventoryRecovery } from '../scripts/wing-photo-recovery.mjs';
const id='40000000-0000-4000-a000-000000000001';
const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture-only'};
test('recovery defaults to dry run and requires an allowlist and explicit matching target for execution',()=>{
  assert.equal(parseRecoveryArgs(['--manifest','test.json'],env).execute,false);
  assert.throws(()=>parseRecoveryArgs([],env),/manifest/);
  assert.throws(()=>parseRecoveryArgs(['--manifest','test.json','--execute'],env),/matching/);
  assert.throws(()=>parseRecoveryArgs(['--manifest','test.json','--execute','--expected-project-ref','other'],env),/matching/);
  assert.equal(parseRecoveryArgs(['--manifest','test.json','--execute','--expected-project-ref','example'],env).execute,true);
  assert.throws(()=>parseRecoveryArgs(['--manifest','test.json','--retry-failed'],env),/execute/);
});
test('dry run never enqueues mutations and duplicate manifest IDs are deduplicated',async()=>{
  let payload;
  const client={rpc:async(name,body)=>{assert.equal(name,'request_wing_photo_derivatives');payload=body;return {data:[],error:null};}};
  await requestRecovery(client,parseRecoveryArgs(['--manifest','fixture.json'],env),{submission_ids:[id,id]});
  assert.equal(payload.p_dry_run,true);assert.equal(payload.p_retry_failed,false);assert.deepEqual(payload.p_submission_ids,[id]);
  await assert.rejects(requestRecovery(client,{}, {submission_ids:[]}),/1–100/);
  await assert.rejects(requestRecovery(client,{}, {submission_ids:['invalid']}),/1–100/);
});
test('command errors do not expose credentials or raw RPC failures',async()=>{
  const client={rpc:async()=>({error:{message:'privileged diagnostic fixture'}})};
  await assert.rejects(requestRecovery(client,{execute:false},{submission_ids:[id]}),/inspect privileged server/);
});
test('inventory is read-only, paged and cannot be combined with execution',async()=>{
  assert.throws(()=>parseRecoveryArgs(['--inventory','--execute'],env),/read-only/);
  const offsets=[];
  const client={rpc:async(name,body)=>{
    assert.equal(name,'list_wing_photo_derivative_candidates');offsets.push(body.p_offset);
    return {data:body.p_offset===0?Array.from({length:100},()=>({submission_id:id,blocker:null})):[],error:null};
  }};
  assert.equal((await inventoryRecovery(client,parseRecoveryArgs(['--inventory'],env))).results.length,100);
  assert.deepEqual(offsets,[0,100]);
});
