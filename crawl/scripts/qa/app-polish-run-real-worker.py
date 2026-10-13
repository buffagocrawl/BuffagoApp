"""Run current worker against only the isolated real services; no fake repository."""
from pathlib import Path
import subprocess,json,os,sys
ROOT=Path(__file__).resolve().parents[3]
def load(path):
 b=(ROOT/path).read_bytes()
 return json.loads(b.decode('utf-16') if b.startswith(b'\xff\xfe') else b.decode('utf-8-sig'))
credentials=load('crawl/.expo/app-polish-acceptance-local-credentials.json')
assert credentials['API_URL']=='http://127.0.0.1:55321'
fixture=load('crawl/.expo/app-polish-staging-worker-submission.json')
env={k:v for k,v in os.environ.items() if not k.startswith(('SUPABASE_','WING_MODERATION_','WING_PROCESSING_','OPENAI_','GOOGLE_'))}
env.update(SUPABASE_URL=credentials['API_URL'],SUPABASE_SERVICE_ROLE_KEY=credentials['SERVICE_ROLE_KEY'],WING_PROCESSING_ENVIRONMENT='test',WING_MODERATION_PROVIDER_MODE='manual-review',WING_PROCESSING_WORKER_ID='polish-real-native-worker')
env['PYTHONDONTWRITEBYTECODE']='1'
options=sys.argv[1:] or ['--photo-once','--photo-submission-id',fixture['submissionId'],'--photo-review-only']
result=subprocess.run([sys.executable,'wing_processing_worker_main.py',*options],cwd=ROOT/'Agents/Jalapeno',env=env,capture_output=True,text=True,encoding='utf-8')
output=(result.stdout+result.stderr)
log_name='staging-real-cleanup-worker.log' if any('cleanup' in x for x in options) else 'staging-real-worker.log'
(ROOT/'artifacts/app-polish/release-qa/deployment'/log_name).write_text(output,encoding='utf-8')
print('Worker exit:',result.returncode)
print(output[-1800:])
raise SystemExit(result.returncode)
