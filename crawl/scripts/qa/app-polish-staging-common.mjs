import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';
const root=new URL('../../',import.meta.url);
export const localPath=p=>new URL(p,root);
export function readJSON(p){const b=readFileSync(localPath(p));return JSON.parse(b.subarray(0,2).equals(Buffer.from([255,254]))?b.toString('utf16le').replace(/^\uFEFF/,''):b.toString('utf8').replace(/^\uFEFF/,''));}
export const credentials=readJSON('.expo/app-polish-acceptance-local-credentials.json');
if(credentials.API_URL!=='http://127.0.0.1:55321')throw Error('Refusing non-acceptance backend');
export const client=token=>createClient(credentials.API_URL,credentials.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Connection:'close',...(token?{Authorization:`Bearer ${token}`}:{})}}});
export const admin=createClient(credentials.API_URL,credentials.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Connection:'close'}}});
export function sql(query){return execFileSync('docker',['exec','-i','supabase_db_buffago-polish-acceptance','psql','-X','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'],{input:query,encoding:'utf8',maxBuffer:8*1024*1024}).trim();}
export function saveEvidence(name,data){writeFileSync(localPath(`../artifacts/app-polish/release-qa/deployment/${name}`),JSON.stringify(data,null,2)+'\n');}
export function check(result){if(result.error)throw Error(result.error.message);return result.data;}
