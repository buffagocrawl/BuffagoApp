import {readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const hash=s=>createHash('md5').update(s).digest('hex');
const evidence=await readFile(new URL('../../docs/buffago-production-readonly-evidence-2026-10-10.md',import.meta.url),'utf8');
export const candidates=[];
for(const file of await readdir(new URL('../supabase/migrations/',import.meta.url))){
 if(!file.endsWith('.sql'))continue;
 const sql=await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8');
 const re=/create\s+(?:or\s+replace\s+)?function\s+(?:(\w+)\.)?("[^"]+"|\w+)\s*\(([\s\S]*?)\)([\s\S]*?)\bas\s+(\$(?:\w+)?\$)([\s\S]*?)\5\s*;/gi;
 for(const m of sql.matchAll(re)){
  const args=m[3].split(',').map(x=>x.trim().replace(/\s+default[\s\S]*/i,'').split(/\s+/).slice(1).join(' ').replace(/integer/i,'integer')).filter(Boolean).join(',');
  const path=m[4].match(/set\s+search_path\s*=\s*([^\r\n]+?)(?=\s+as\b|$)/im)?.[1]?.trim();
  const normalizedPath=path?.split(',').map(x=>x.trim()).join(', ');
  const setting=normalizedPath?'search_path='+normalizedPath:null;
  const config=setting?'{'+(/[\s,"\\]/.test(setting)?'"'+setting.replaceAll('\\','\\\\').replaceAll('"','\\"')+'"':setting)+'}':'';
  candidates.push({schema:m[1]||'public',name:m[2].replaceAll('"',''),signature:args,file,raw:hash(m[6]),lf:hash(m[6].replaceAll('\r\n','\n')),config:hash(config),searchPath:normalizedPath??'unspecified',definer:/security\s+definer/i.test(m[4]),body:m[6],sql:m[0]});
 }
}
const rows=[];
for(const line of evidence.split('\n')){
 const cells=line.split('|').slice(1,-1).map(x=>x.trim().replaceAll('`',''));
 if(cells.length===7&&/^[a-f0-9]{32}$/.test(cells[3]))rows.push({schema:cells[0],name:cells[1],signature:cells[2],source:cells[3],definer:cells[4]==='yes',searchPath:cells[5],config:cells[6]});
 if(cells.length===7&&/^[a-f0-9]{32}$/.test(cells[4]))rows.push({schema:null,name:cells[3].replace(/\(\)$/,''),signature:cells[3],source:cells[4],definer:false,searchPath:'""',config:cells[5],event:cells[0]});
 if(cells.length===5&&/^[a-f0-9]{32}$/.test(cells[1]))rows.push({schema:'public',name:cells[0].split('(')[0].split('.').pop(),signature:cells[0],source:cells[1],config:cells[2],definer:cells[4]==='yes',owner:cells[3]});
}
export const results=rows.map(r=>{
 const cs=candidates.filter(c=>c.name===r.name&&(!r.schema||c.schema===r.schema));
 const matched=cs.find(c=>c.raw===r.source)||cs.find(c=>c.lf===r.source);
 const selected=matched||cs.at(-1);
 return {...r,status:matched?(matched.raw===r.source?'EXACT MATCH':'NORMALIZED MATCH'):cs.length?'MISMATCH':'SOURCE NOT AVAILABLE',selected:selected?{file:selected.file,signature:selected.signature,raw:selected.raw,lf:selected.lf,config:selected.config,definer:selected.definer,searchPath:selected.searchPath}:null,signatureMatch:selected?r.signature.replace(/^(public|storage)\./,'').replaceAll('"','')===r.name+'('+selected.signature+')':null,configMatch:selected?selected.config===r.config:null,definerMatch:selected?selected.definer===r.definer:null,candidates:cs.map(({file,raw,lf,signature,config})=>({file,raw,lf,signature,config}))};
});
await writeFile(new URL('../../docs/buffago-final-readonly-correspondence.json',import.meta.url),JSON.stringify({evidence:'buffago-production-readonly-evidence-2026-10-10.md',normalization:'CRLF to LF only; no whitespace or semantic rewriting',results},null,2)+'\n');
console.log(results.map(r=>`${r.name}: ${r.status}; signature=${r.signatureMatch}; config=${r.configMatch}; ${r.selected?.file??''}`).join('\n'));
