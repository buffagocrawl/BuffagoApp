"""Configure only local runtime routing, retaining native gateway JWT code."""
from pathlib import Path
import subprocess
import time
ROOT=Path(__file__).resolve().parents[3]
edge='supabase_edge_runtime_buffago-polish-acceptance'
kong='supabase_kong_buffago-polish-acceptance'
previous=None;stable=0
for _ in range(120):
 r=subprocess.run(['docker','inspect','--format','{{.Id}} {{.State.Running}}',edge],capture_output=True,text=True)
 value=r.stdout.strip();stable=stable+1 if r.returncode==0 and value==previous and value.endswith('true') else 0;previous=value
 if stable>=12:break
 time.sleep(.25)
else:raise RuntimeError('Local runtime did not settle')
main=subprocess.check_output(['docker','exec',edge,'cat','/root/index.ts']).decode('utf-8')
assert main.count('const envVarsObj = Deno.env.toObject();')==1
main=main.replace('const envVarsObj = Deno.env.toObject();',"const envVarsObj = Deno.env.toObject();\n    envVarsObj['SUPABASE_URL'] = 'http://127.0.0.1:55321'; // isolated loopback transport only")
file=ROOT/'crawl/.expo/app-polish-native-main.ts';file.write_text(main,encoding='utf-8')
subprocess.run(['docker','exec',edge,'mkdir','-p','/tmp/polish-main','/tmp/polish-api-proxy'],check=True)
subprocess.run(['docker','cp',str(file),edge+':/tmp/polish-main/index.ts'],check=True)
subprocess.run(['docker','cp',str(ROOT/'crawl/scripts/qa/app-polish-local-api-proxy.ts'),edge+':/tmp/polish-api-proxy/index.ts'],check=True)
for port,folder in [('55321','/tmp/polish-api-proxy'),('8082','/tmp/polish-main')]:
 subprocess.run(['docker','exec','-d',edge,'edge-runtime','start','--port',port,'--main-service',folder],check=True)
config=subprocess.check_output(['docker','exec',kong,'cat','/home/kong/kong.yml']).decode('utf-8')
old='http://supabase_edge_runtime_buffago-polish-acceptance:8081';new=old.replace('8081','8082')
assert old in config or new in config
config=config.replace(old,new)
file=ROOT/'crawl/.expo/app-polish-native-kong.yml';file.write_text(config,encoding='utf-8')
subprocess.run(['docker','cp',str(file),kong+':/home/kong/kong.yml'],check=True)
subprocess.run(['docker','exec',kong,'kong','reload'],capture_output=True,check=True)
print('Local-only loopback API environment and upstream port configured; native JWT logic unchanged.')
