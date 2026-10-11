import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

// Transport-independent attempt state machine. runApproved is the ONLY
// production transport entry and supplies all of these fixed policies. Tests
// drive this same state machine with a separate loopback-only fixture factory.
export async function verifiedAttempt({decision:d,implementation,decisionHash,audit,connect,verifyIdentity,
  frozenBytes,snapshotSQL,recoverySQL,classifyRecovery,kernel,revalidate,project,version,migrationHash,preflightHash}) {
 let session,step='connect',writeStarted=false,commitAcknowledged=false,failure;
 const attempt=randomUUID();
 try {
  await audit.append({attempt,status:'started',action:d.action,project,version,...implementation,migrationHash,preflightHash,actor:d.actor,decisionHash});
  session=connect();
  // Bound inspection and confirmation as well as DDL; frozen per-statement
  // and lock limits are preserved. A lost transport never triggers replay.
  await session.execute("set statement_timeout='60s'; set lock_timeout='5s';");
  if(d.action!=='apply') await session.execute('set default_transaction_read_only=on;');
  const identity=verifyIdentity(await session.execute(d.identitySQL));
  await audit.append({attempt,status:'identity-verified',...identity,caHash:d.caHash,controlPlaneEvidence:d.controlPlaneEvidence});
  const {sql,preflight}=await frozenBytes();
  if(d.action==='recover') {
   step='recovery';const result=JSON.parse(await session.execute(recoverySQL(sql)));
   const state=classifyRecovery(JSON.stringify(result.rows),sql,result.snapshot,d);
   await audit.append({attempt,status:state});return state;
  }
  step='preflight';assert.equal(await session.execute(snapshotSQL),d.snapshot,'Unapproved baseline drift');
  await session.execute(preflight);
  const transaction=await kernel();
  assert.equal(verifyIdentity(await session.execute(d.identitySQL)).pid,identity.pid,'Session changed');
  if(d.action==='inspect'){await audit.append({attempt,status:'inspection-confirmed'});return 'inspection-confirmed';}
  revalidate();step='commit-attempt';
  await audit.append({attempt,status:'write-started',pid:identity.pid});
  writeStarted=true;await session.execute(transaction);commitAcknowledged=true;
  await session.close();session=null;step='independent-confirmation';
  session=connect();await session.execute("set statement_timeout='60s'; set lock_timeout='5s'; set default_transaction_read_only=on;");
  assert.notEqual(verifyIdentity(await session.execute(d.identitySQL)).pid,identity.pid,'Confirmation must be independent');
  const result=JSON.parse(await session.execute(recoverySQL(sql)));
  const state=classifyRecovery(JSON.stringify(result.rows),sql,result.snapshot,d);
  assert.equal(state,'committed','COMMIT acknowledgment is insufficient');
  await audit.append({attempt,status:'confirmed'});return 'confirmed';
 } catch(error) {
  let evidenceError;
  try{await audit.append({attempt,status:'failed-or-unknown',step,writeStarted,commitAcknowledged,sqlstate:error.sqlstate??null});}
  catch(e){evidenceError=e;}
  const stopped=new Error(`Adapter stopped at ${step}; ${writeStarted?'outcome requires separately approved read-only recovery':'no migration sent'}${evidenceError?'; evidence persistence also failed':''}`,{cause:error});
  Object.assign(stopped,{step,writeStarted,commitAcknowledged,sqlstate:error.sqlstate??null,evidenceError});
  failure=stopped;
  throw stopped;
 } finally {
  // Close transport BEFORE evidence; avoid leaving an open transaction when
  // an fsync failure prevents the failure record from being persisted.
  let cleanupError;
  try{if(session)await session.close();}catch(e){cleanupError=e;}
  try{await audit.close();}catch(e){cleanupError??=e;}
  if(cleanupError){
   if(failure)failure.cleanupError=cleanupError;
   else throw Object.assign(new Error('Adapter cleanup failed; inspect external evidence and use separately approved read-only recovery',{cause:cleanupError}),{step:'cleanup',writeStarted,commitAcknowledged});
  }
 }
}
