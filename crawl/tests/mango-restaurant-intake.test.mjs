import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const edgeSource=readFileSync(new URL('../supabase/functions/wingman-intake/index.ts',import.meta.url),'utf8');
for(const token of [null,'invalid-fixture-token']) test(`Wingman creation rejects ${token ? 'invalid' : 'missing'} authentication before lookups or writes`,async()=>{
 let handler,lookups=0,external=0;
 const code=ts.transpileModule(edgeSource.replace(/^import .*;$/gm,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
 vm.runInNewContext(code,{
  withWingmanDeadline:async p=>p,
  Deno:{env:{get:()=> 'isolated-test-value'},serve:fn=>{handler=fn;}},Request,Response,URL,console,
  createClient:()=>({auth:{getUser:async()=>({data:{user:null},error:{message:'invalid'}})},from:()=>{lookups++;throw new Error('Unexpected lookup');},rpc:()=>{lookups++;throw new Error('Unexpected write');}}),
  fetch:()=>{external++;throw new Error('Unexpected external request');}
 });
 const response=await handler(new Request('https://example.test',{method:'POST',headers:{'Content-Type':'application/json',...(token ? {Authorization:`Bearer ${token}`} : {})},body:JSON.stringify({action:'insertDestination',restaurant:'Fixture Wings',stateId:7,stateCode:'CT'})}));
 assert.equal(response.status,401);assert.equal(lookups,0);assert.equal(external,0);
});
test('mobile manual review saves the assessment, place and submitted evidence on the suggestion',async()=>{
 const source=readFileSync(new URL('../components/WingmanAddDialog.jsx',import.meta.url),'utf8');
 const callback=source.match(/const sendManualReview = useCallback\((async \(result, row\) => \{[\s\S]*?\n  \}), \[/)[1];
 let saved;
 const fn=vm.runInNewContext(`(${callback})`,{operation:()=>({current:()=>true,wait:p=>p,setCandidate:()=>{},setMessage:()=>{},setStep:()=>{}}),stateId:7,userId:'fixture-user',restaurantName:'Fixture Wings',city:'Hartford',extraInfo:'Menu photo says wings',manualReviewQueuedMessage:'Queued',setCandidate:()=>{},setMessage:()=>{},setStep:()=>{},onManualReviewQueued:()=>{},supabase:{from:table=>{assert.equal(table,'destination_suggestions');return {insert:async row=>{saved=row;return {error:null};}};}}});
 await fn({decisionReason:'manual_review',ai:{wingsProbability:0.4,reasoning:'Needs menu confirmation'},place:{city:'Hartford',lat:41,lng:-72}},{name:'Fixture Wings',address:'1 Main',city:'Hartford',lat:41,lng:-72});
 assert.equal(saved.verification_evidence.ai.reasoning,'Needs menu confirmation');
 assert.equal(saved.verification_evidence.decisionReason,'manual_review');
 assert.equal(saved.verification_evidence.place.lat,41);
 assert.equal(saved.verification_evidence.submittedDetails.extraInfo,'Menu photo says wings');
 assert.equal(saved.restaurant_name,'Fixture Wings');
});
