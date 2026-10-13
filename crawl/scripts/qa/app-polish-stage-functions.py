"""Prepare unchanged handler bundles with isolated loopback API configuration."""
from pathlib import Path
import shutil
import subprocess
import sys
import time
ROOT=Path(__file__).resolve().parents[3]
stage=ROOT/'crawl/supabase/local/app-polish-acceptance/supabase/functions'
candidate='--candidate' in sys.argv
only=sys.argv[sys.argv.index('--only')+1] if '--only' in sys.argv else None
for name,extension in [('wing-public-gallery','ts'),('wing-jury-vote','js'),('wing-jury-reveal','js'),('wingman-intake','ts')]:
 if only and name!=only:continue
 folder=stage/name;folder.mkdir(parents=True,exist_ok=True)
 source=ROOT/f'crawl/supabase/functions/{name}/index.ts' if candidate else ROOT/(f'artifacts/app-polish/release-qa/deployed/{name}/index.{extension}' if name!='wingman-intake' else 'artifacts/app-polish/release-qa/wingman-intake-v17.ts')
 shutil.copyfile(source,folder/'handler.ts')
 (folder/'index.ts').write_text("// Local loader; handler bytes remain unchanged.\nawait import('./handler.ts');\n",encoding='utf-8')
if candidate:
 shared=stage/'_shared';shared.mkdir(exist_ok=True)
 for name in ['wingJury.ts','wingmanConfidence.ts','wingmanMenuEvidence.ts','wingmanDeadline.ts']:
  shutil.copyfile(ROOT/'crawl/supabase/functions/_shared'/name,shared/name)
# Supabase serve reloads its own container when files change. Wait for the
# watcher to settle instead of racing it with a second container restart.
previous=None;stable=0
for _ in range(100):
 result=subprocess.run(['docker','inspect','--format','{{.Id}} {{.State.Running}}','supabase_edge_runtime_buffago-polish-acceptance'],capture_output=True,text=True)
 identity=result.stdout.strip()
 stable=stable+1 if result.returncode==0 and identity==previous and identity.endswith('true') else 0
 previous=identity
 if stable>=12:break
 time.sleep(.25)
else:raise RuntimeError('Isolated function watcher did not settle')
subprocess.run([sys.executable,str(ROOT/'crawl/scripts/qa/app-polish-runtime-routing.py')],check=True)
print(('Candidate' if candidate else 'Captured baseline')+' handlers prepared with real local loopback transport; original source bytes and JWT flags preserved.')
