import test from 'node:test';
import assert from 'node:assert/strict';
import { createBuffacoinOperationStore, reconcileBuffacoinOperation } from '../lib/buffacoinOperationStore.js';
import { classifyBuffacoinTransactionError } from '../lib/buffacoinRatingTransaction.js';

function disk() {
  const values = new Map();
  return { getItem: async key => values.get(key) ?? null, setItem: async (key,value) => values.set(key,value), removeItem: async key => values.delete(key) };
}
const request = { userId: 'owner', operationId: 'same-operation', destinationId: 'restaurant', stateCode: 'NY', coinCost: 1, rating: { sauce:8, crispiness:8, meat:8, overall:9 } };
const receipt = { operation_id: request.operationId, rating_id:'rating', crawl_id:'crawl', new_balance:9 };

test('lost response persists immutable operation across restart and explicit concurrent reconciliation returns one receipt', async () => {
  const storage = disk();
  const store = createBuffacoinOperationStore(storage);
  await store.prepare(request);
  let calls = 0, debits = 0;
  const receipts = new Map();
  const client = { rpc: async (_name,args) => {
    calls++;
    if (!receipts.has(args.p_operation_id)) {
      debits++;
      receipts.set(args.p_operation_id,receipt);
      throw new Error('response lost after commit');
    }
    assert.deepEqual(args.p_rating,request.rating);
    return { data:receipts.get(args.p_operation_id),error:null };
  } };
  assert.equal((await reconcileBuffacoinOperation({store,supabase:client,userId:'owner'})).status,'ambiguous');
  assert.equal(calls,1,'no automatic retry after unknown commit');
  await assert.rejects(store.clear({userId:'owner',operationId:request.operationId}),/unresolved/);
  const reopened = createBuffacoinOperationStore(storage);
  assert.equal((await reopened.load('owner')).operationId,request.operationId);
  await assert.rejects(reopened.prepare({...request,operationId:'new-operation'}),/unresolved/);
  await assert.rejects(reopened.prepare({...request,rating:{...request.rating,overall:1}}),/payload_changed/);
  const first = reconcileBuffacoinOperation({store:reopened,supabase:client,userId:'owner'});
  const second = reconcileBuffacoinOperation({store:reopened,supabase:client,userId:'owner'});
  assert.equal(first,second);
  const confirmed = await first;
  assert.equal(confirmed.status,'committed');
  assert.deepEqual(confirmed.receipt,receipt);
  assert.equal(calls,2);
  assert.equal(debits,1);
  await reconcileBuffacoinOperation({store:reopened,supabase:client,userId:'owner'});
  assert.equal(calls,2,'confirmed receipt never submits again');
  assert.equal(await reopened.clear({userId:'owner',operationId:request.operationId}),true);
});

test('server undefined-column rejection is definitive and account B cannot read account A pending operation',async () => {
  const store = createBuffacoinOperationStore(disk());
  await store.prepare(request);
  let calls=0;
  const result = await reconcileBuffacoinOperation({store,userId:'owner',supabase:{rpc:async()=>{calls++;return {error:{code:'42703',message:'column c.created_at does not exist'}};}}});
  assert.equal(result.status,'definitive_failure');
  assert.equal(await store.load('other-account'),null);
  await reconcileBuffacoinOperation({store,userId:'owner',supabase:{rpc:()=>{throw new Error('should not retry final rejection');}}});
  assert.equal(calls,1);
  assert.equal(await store.clear({userId:'owner',operationId:request.operationId}),true);
});

test('timeout before commit stays unresolved until the same operation safely commits on explicit check', async () => {
  const store = createBuffacoinOperationStore(disk()); await store.prepare(request);
  let calls=0, balance=10, ratings=0;
  const client={rpc:async (_name,args)=>{
    assert.equal(args.p_operation_id,request.operationId);
    if(++calls===1) throw new Error('request timeout before server execution');
    balance--;ratings++;return {data:{...receipt,new_balance:balance}};
  }};
  assert.equal((await reconcileBuffacoinOperation({store,supabase:client,userId:'owner'})).status,'ambiguous');
  assert.equal(balance,10); assert.equal(ratings,0);
  await assert.rejects(store.prepare({...request,operationId:'replacement'}), /unresolved/);
  assert.equal((await reconcileBuffacoinOperation({store,supabase:client,userId:'owner'})).status,'committed');
  assert.equal(balance,9);assert.equal(ratings,1);assert.equal(calls,2);
});

test('storage failure before request sends no RPC and storage failure after commit retains submitting record',async () => {
  const broken = createBuffacoinOperationStore({getItem:async()=>null,setItem:async()=>{throw new Error('disk full');},removeItem:async()=>{}});
  await assert.rejects(broken.prepare(request),/disk full/);
  const storage = disk();
  const store=createBuffacoinOperationStore(storage);
  await store.prepare(request);
  const write=storage.setItem;
  storage.setItem=async(key,value)=>{ if(JSON.parse(value).status==='committed')throw new Error('disk full');return write(key,value); };
  let calls=0;
  await assert.rejects(reconcileBuffacoinOperation({store,userId:'owner',supabase:{rpc:async()=>{calls++;return {data:receipt};}}}),/disk full/);
  assert.equal(calls,1);
  assert.equal((await store.load('owner')).status,'submitting');
  await assert.rejects(store.prepare({...request,operationId:'new'}),/unresolved/);
});

test('account changes before dispatch stop submit; malformed receipts remain ambiguous',async () => {
  const store=createBuffacoinOperationStore(disk());
  await store.prepare(request);
  await assert.rejects(reconcileBuffacoinOperation({store,userId:'owner',isCurrent:()=>false,supabase:{rpc:()=>{throw new Error('must not submit');}}}),/account_changed/);
  assert.equal((await store.load('owner')).status,'prepared');
  const result=await reconcileBuffacoinOperation({store,userId:'owner',supabase:{rpc:async()=>({data:{operation_id:request.operationId}})}});
  assert.equal(result.status,'ambiguous');
  assert.equal(classifyBuffacoinTransactionError({code:'08006'}),'ambiguous');
  assert.equal(classifyBuffacoinTransactionError({code:'P0001',message:'insufficient_balance'}),'definitive_failure');
});

test('early auth and RPC/schema failures on a lost-commit replay cannot prove no earlier charge',async () => {
  for (const error of [{code:'P0001',message:'unauthorized'},{code:'PGRST202',message:'missing RPC'},{code:'42501',message:'permission denied'},{code:'P0001',message:'invalid_input'}]) {
    const store=createBuffacoinOperationStore(disk());
    await store.prepare(request);
    await store.update({userId:'owner',operationId:request.operationId,status:'ambiguous'});
    const result=await reconcileBuffacoinOperation({store,userId:'owner',supabase:{rpc:async()=>({error})}});
    assert.equal(result.status,'ambiguous',error.message);
    await assert.rejects(store.clear({userId:'owner',operationId:request.operationId}),/unresolved/);
  }
});

test('invalid persisted committed receipt is never used as confirmation',async () => {
  const store=createBuffacoinOperationStore(disk());
  await store.prepare(request);
  await store.update({userId:'owner',operationId:request.operationId,status:'committed',receipt:{...receipt,operation_id:'wrong-operation'}});
  assert.equal((await store.load('owner')).status,'ambiguous');
  assert.equal((await store.load('owner')).receipt,null);
  await assert.rejects(store.clear({userId:'owner',operationId:request.operationId}),/unresolved/);
  let calls=0;
  const result=await reconcileBuffacoinOperation({store,userId:'owner',supabase:{rpc:async()=>{calls++;return {data:receipt};}}});
  assert.equal(calls,1);
  assert.equal(result.status,'committed');
  assert.deepEqual(result.receipt,receipt);
});
