// Local QA only: public catalog GETs with anonymous RLS. No auth or mutations.
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
const vars={};
for(const line of readFileSync(new URL('../../.env.local',import.meta.url),'utf8').split(/\r?\n/)){
 const m=line.match(/^([A-Z_]+)=(.*)$/);if(m)vars[m[1]]=m[2].trim().replace(/^['"]|['"]$/g,'');
}
const origin=vars.EXPO_PUBLIC_SUPABASE_URL,key=vars.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if(!origin||!key||new URL(origin).protocol!=='https:')throw Error('Existing public HTTPS catalog config required');
const fields=new Set(['id','name','address','city','state_id','lat','lng','state_code','state_name','code','abbreviation']);
const tables=new Set(['/rest/v1/destinations','/rest/v1/states']);
const log=x=>console.log(JSON.stringify({time:new Date().toISOString(),...x}));
createServer(async(req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');res.setHeader('content-type','application/json');
 const select=url.searchParams.get('select')||'*';
 if(req.method!=='GET'||!tables.has(url.pathname)||!select.split(',').every(f=>fields.has(f.trim()))){
  res.writeHead(403);res.end(JSON.stringify({code:'readonly_qa',message:'Read-only Android QA: remote writes and sign-in are disabled.'}));
  log({method:req.method,path:url.pathname,forwarded:false,status:403});return;
 }
 try{
  const r=await fetch(new URL(url.pathname+url.search,origin),{method:'GET',headers:{apikey:key,Authorization:'Bearer '+key},signal:AbortSignal.timeout(10000)});
  res.writeHead(r.status);res.end(await r.text());log({method:'GET',path:url.pathname,forwarded:true,status:r.status});
 }catch{res.writeHead(503);res.end(JSON.stringify({message:'Catalog unavailable. Try again or explore.'}));log({method:'GET',path:url.pathname,forwarded:true,status:503});}
}).listen(55321,'127.0.0.1',()=>log({ready:true,readOnly:true,port:55321}));
