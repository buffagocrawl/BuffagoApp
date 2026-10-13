"""Finalize release metadata from preserved real-service receipts; no deployment."""
from pathlib import Path
import json,hashlib,os
ROOT=Path(__file__).resolve().parents[3]
docs=ROOT/'docs';evidence=ROOT/'artifacts/app-polish/release-qa/deployment'
manifest_path=docs/'buffago-app-polish-deployment-manifest.json'
m=json.loads(manifest_path.read_text(encoding='utf8'))
m['productionReleaseStatus']='partial backend acceptance passed; Wingman provider success/calibration, release rehearsal, distributions and physical devices remain blocked'
m['productionDeploymentPerformed']=False
for edge in m['edgeFunctions']:
 edge['sourceSha256']=hashlib.sha256((ROOT/edge['source']).read_bytes()).hexdigest()
 edge['status']='required; real local HTTP phase passed'
 edge['deploymentRequired']=True
 if edge['name']=='wingman-intake':
  edge['deployedVersion']=18;edge['historicalProtectedBaseline']=17
  edge['sharedSources'].append('crawl/supabase/functions/_shared/wingmanDeadline.ts') if not any(p.endswith('wingmanDeadline.ts') for p in edge['sharedSources']) else None
  edge['status']='already deployed externally; fresh source matches local candidate exactly; skip redundant deployment'
  edge['deploymentRequired']=False
  edge['reason']='v18 already includes confidence/menu/deadline changes and protected v17 atomic limiter/auth/duplicate-safe creation; provider-backed acceptance remains blocked, not deployment evidence'
 edge['sharedSourceSha256']={p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in edge['sharedSources']}
m['worker']={'status':'required local header fix; real worker/storage cleanup regression passed','source':'Agents/Jalapeno/wing_processing_worker/repository.py','test':'Agents/Jalapeno/tests/test_wing_processing_repository.py','change':'Remove inherited Content-Type only on bodyless exact-object Storage DELETE; retain service auth/path/timeout/retry/settlement','sha256':hashlib.sha256((ROOT/'Agents/Jalapeno/wing_processing_worker/repository.py').read_bytes()).hexdigest(),'deployOrder':'after SQL/voting Edges, before final cleanup acceptance/mobile; independently compatible','rollback':'restore prior worker package only; retain all DB jobs/receipts/votes; prior package can fail cleanup with Storage 400, so pause affected cleanup rather than erase/reseed jobs'}
m['staging'].update(status='isolated native local Supabase running; real partial acceptance passed',baselineGate='56 application tables/92 deployed function prerequisites; original 56-table/88-function schema validated pre-bridge, 89 unchanged function definitions/76 policies/56 table ACLs validated after bridge',baseline='crawl/supabase/local/app-polish-acceptance/baseline/schema-baseline.sql',localOnlySchemaAdaptation='baseline/platform-storage-prerequisites.sql adds two already-deployed Storage columns absent in local platform version; NOT production SQL',deviceBackend='Host API running at http://127.0.0.1:55321. Loopback signed URLs are host-only; physical devices require the isolated public-origin setup in release plan. No phone target/build configured.')
m['staging']['minimumServices'][-1]='current Jalapeno worker, actual manual-review mode, local service key; no test provider/fake repository'
m['staging']['localOnlyRouting']={'files':['crawl/scripts/qa/app-polish-local-api-proxy.ts','crawl/scripts/qa/app-polish-runtime-routing.py','crawl/scripts/qa/app-polish-local-main.sh'],'change':'transparent loopback55321 -> actual Kong8000; single SUPABASE_URL env override in native main, own Kong functions upstream8082; native JWT logic unmodified','productionDeployment':False}
m['excludedDeployments']=[x for x in m['excludedDeployments'] if not x.startswith('photo worker code')]
m['excludedDeployments']+=['isolated baseline/schema/platform adaptations','local routing proxy/native-main override/runtime loader copies','redundant wingman-intake v18 deployment']
m['acceptanceEvidence']={k:'artifacts/app-polish/release-qa/deployment/'+k for k in ['staging-voting-acceptance.json','staging-edge-phase-acceptance.json','staging-upload-acceptance.json','staging-storage-cascade-acceptance.json','staging-cleanup-acceptance.json','staging-cleanup-endpoint-acceptance.json','staging-derivative-agreement.json','staging-catalog-completeness.json','baseline-edge-source-verification.json','wingman-v18-rpc-preservation.json']}
for phase in m['rollout']:
 if phase['phase']=='Edge':phase['gate']='SQL -> required vote/reveal/gallery, each real forward phase passed. Wingman v18 is already deployed externally; source/RPC preservation verified, provider success/calibration still blocked; no redundant deploy.'
if not any(p['phase']=='Worker' for p in m['rollout']):m['rollout'].insert(2,{'phase':'Worker','gate':'Bodyless Storage DELETE header fix; actual local worker cleanup/retry and focused test passed; release preserved worker package before final cleanup/mobile gate','rollback':m['worker']['rollback']})
m['remainingGates']=[{'gate':'Wingman provider success/insertion and representative confidence calibration','status':'blocked: no suitable dedicated test provider keys','owner':'Backend engineer + Branden'}, {'gate':'fresh production preflight, representative lock/load timing and explicit code rollback rehearsal','status':'incomplete','owner':'Release/backend engineer'}, {'gate':'real isolated Mango HTTP review/history and growth snapshot after phases','status':'incomplete; earlier broad suites preserved','owner':'Mango/backend engineer'}, {'gate':'signed-in anonymous-auth path if distributed cohort depends on it','status':'not exercised; local anonymous sign-in disabled','owner':'Backend engineer'}, {'gate':'actual store/testing/OTA cohort contracts','status':'unknown assignments','owner':'Branden/mobile release engineer'}, {'gate':'physical Android/native iPhone identified QA builds and isolated connection','status':'outstanding','owner':'Branden/mobile engineer'}]
m['mobileSortFilters']={'status':'implemented; 19 focused tests/lint/typecheck/Android emulator fixture interactions passed','source':['crawl/app/(tabs)/ratings/index.jsx','crawl/lib/wingdexCollection.js','crawl/lib/savedDestinations.js'],'backendDeploymentRequired':False,'screenshots':'artifacts/app-polish/release-qa/sort-filters/','physicalAndroidNativeIOS':'outstanding'}
m['readinessByComponent']={'sharedVotingPhotos':'real local acceptance passed; deploy candidate after fresh production preflight, load/rollback gate and owner release decision','workerFix':'real local cleanup regression passed; include worker package release, independent of voting','Wingman':'v18 already deployed externally; provider-backed verification/insertion and representative score calibration NOT PASSED'}
manifest_path.write_text(json.dumps(m,indent=2)+'\n',encoding='utf8')

audit={'status':'BLOCKED','required':['OPENAI_API_KEY','GOOGLE_PLACES_API_KEY (or GOOGLE_API_KEY)'],'usableDedicatedTestCredentialsAvailable':False,'processEnvironmentNamesPresent':[k for k in ('OPENAI_API_KEY','GOOGLE_PLACES_API_KEY','GOOGLE_API_KEY') if os.environ.get(k)],'dedicatedIgnoredFilePresent':(ROOT/'crawl/.expo/app-polish-provider-test.env').exists(),'existingUnclassifiedOrProductionSecretsUsed':False,'setup':'dedicated non-production OpenAI project key permitted for configured OPENAI_MODEL (default gpt-4.1-mini), and separate Google Places project key permitting server-side Text Search/Place Details; quotas/billing/external read access required; local generated Supabase keys only','scope':'No key values inspected/logged; no provider-success claim'}
(evidence/'staging-wingman-provider-credential-gate.json').write_text(json.dumps(audit,indent=2)+'\n',encoding='utf8')

# CLI start prints only local keys, but shared evidence must still redact them.
credential_path=ROOT/'crawl/.expo/app-polish-acceptance-local-credentials.json'
b=credential_path.read_bytes();c=json.loads(b.decode('utf16') if b.startswith(b'\xff\xfe') else b.decode('utf8-sig'))
for log in evidence.glob('local-stack-start*'):
 raw=log.read_bytes();encoding='utf16' if raw.startswith(b'\xff\xfe') else 'utf8'
 text=raw.decode(encoding)
 for key,value in c.items():
  if ('KEY' in key or 'SECRET' in key or 'PASSWORD' in key) and isinstance(value,str) and value:text=text.replace(value,'[REDACTED LOCAL TEST CREDENTIAL]')
 log.write_text(text,encoding='utf8')
print('Updated manifest, credential gate and redacted local-start evidence; no production action.')
