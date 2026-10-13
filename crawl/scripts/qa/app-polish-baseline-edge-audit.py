"""Compare fresh read-only deployed bundles with retained baseline/candidate bytes."""
from pathlib import Path
import json,hashlib
ROOT=Path(__file__).resolve().parents[3]
base=ROOT/'crawl/supabase/local/app-polish-acceptance/baseline/edge'
capture=json.loads((base/'fresh-deployed-source-capture.json').read_text(encoding='utf8'))
digest=lambda b:hashlib.sha256(b).hexdigest()
results=[]
for entry in capture['entries']:
 name=entry['name'];files=[]
 for file in entry['files']:
  path=file['name'].removeprefix('functions/')
  if name=='wing-public-gallery' and path=='index.ts':path=f'{name}/index.ts'
  fresh=file['content'].encode('utf8')
  if name=='wingman-intake':
   local=ROOT/'crawl/supabase'/('functions/'+path)
  elif name.startswith('wing-media-'):
   local=base/path
  else:
   local=ROOT/'artifacts/app-polish/release-qa/deployed'/path
  retained=local.read_bytes()
  exact=fresh==retained
  normalize=lambda v:v.replace(b'\r\n',b'\n').rstrip(b'\n')
  only_line_endings=normalize(fresh)==normalize(retained)
  files.append({'deployedPath':file['name'],'comparedPath':str(local.relative_to(ROOT)).replace('\\','/'),'deployedSHA256':digest(fresh),'retainedSHA256':digest(retained),'byteIdentical':exact,'sourceMatches':only_line_endings,'difference':None if exact else 'CRLF/LF or added final LF only; no source-token changes' if only_line_endings else 'UNREVIEWED SOURCE DIFFERENCE'})
 results.append({'name':name,'deployedVersion':entry['version'],'verifyJwt':entry['verify_jwt'],'files':files,'assessment':'candidate already deployed externally; retained v17 is historical rollback, not current baseline' if name=='wingman-intake' else 'retained baseline matches deployed'})
result={'readOnlyProductionInspection':True,'productionDeploymentPerformedByThisSession':False,'results':results,'allComparedBytesMatch':all(f['byteIdentical'] for e in results for f in e['files']),'allSourcesMatch':all(f['sourceMatches'] for e in results for f in e['files'])}
(ROOT/'artifacts/app-polish/release-qa/deployment/baseline-edge-source-verification.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
print(json.dumps({'allComparedBytesMatch':result['allComparedBytesMatch'],'allSourcesMatch':result['allSourcesMatch'],'versions':{e['name']:e['deployedVersion'] for e in results}}))
assert result['allSourcesMatch']
