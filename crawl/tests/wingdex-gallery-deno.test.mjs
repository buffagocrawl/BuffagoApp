import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

test('actual Deno handler and pinned Supabase SDK enforce asset fallback, fields and expiry',
  {skip:!process.env.WINGDEX_DENO,timeout:30000},async()=>{
    const destination='30000000-0000-4000-a000-000000000001';
    const id=n=>`40000000-0000-4000-a000-${String(n).padStart(12,'0')}`;
    const processed=n=>`processed/${id(n)}/primary`;
    const thumbnail=n=>`thumbnails/${id(n)}/preview`;
    const photo=n=>({id:id(n),destination_id:destination,
      media_type:'photo',status:'approved',processed_storage_path:processed(n),thumbnail_storage_path:thumbnail(n),
      like_count:100-n,dislike_count:0,created_at:'2026-01-01T00:00:00Z',
      consent_version:'v1',consented_at:'2026-01-01T00:00:00Z',attribution_preference:'anonymous'});
    const rows=[photo(1),photo(2),photo(3)];let missing=new Set([processed(1),thumbnail(1),thumbnail(2)]);
    let now=Date.now();let metadataQueries=0;const issued=new Map();
    const backend=createServer(async(req,res)=>{
      const chunks=[];for await(const c of req)chunks.push(c);const body=Buffer.concat(chunks).toString();
      const url=new URL(req.url,'http://localhost');res.setHeader('content-type','application/json');
      if(url.pathname==='/rest/v1/wing_media_submissions') {
        metadataQueries++;assert.equal(url.searchParams.get('status'),'eq.approved');
        assert.equal(url.searchParams.get('owner_deleted_at'),'is.null');assert.equal(url.searchParams.get('withdrawn_at'),'is.null');
        assert.equal(url.searchParams.get('user_id'),'not.is.null');
        const selected=url.searchParams.get('id');res.end(JSON.stringify(selected?rows.filter(row=>'eq.'+row.id===selected):rows));return;
      }
      if(url.pathname==='/storage/v1/object/sign/wing-submissions' && req.method==='POST') {
        const data=JSON.parse(body);assert.equal(data.expiresIn,300);
        res.end(JSON.stringify(data.paths.map(path=>{
          if(missing.has(path))return {path,error:'Object not found',signedURL:null};
          const token=String(issued.size);issued.set(token,now+300000);
          return {path,error:null,signedURL:`/object/sign/wing-submissions/${path}?token=${token}`};
        })));return;
      }
      const expires=issued.get(url.searchParams.get('token'));
      res.statusCode=expires && expires>now?200:403;res.end('{}');
    });
    await new Promise(resolve=>backend.listen(0,'127.0.0.1',resolve));
    const reserve=createServer();await new Promise(resolve=>reserve.listen(0,'127.0.0.1',resolve));
    const port=reserve.address().port;await new Promise(resolve=>reserve.close(resolve));
    const dir=await mkdtemp(join(tmpdir(),'wingdex-deno-fixture-'));
    const wrapper=join(dir,'serve.mjs');
    await writeFile(wrapper,`const serve=Deno.serve; Deno.serve=(handler)=>serve({hostname:'127.0.0.1',port:${port}},handler); await import(${JSON.stringify(new URL('../supabase/functions/wing-public-gallery/index.ts',import.meta.url).href)});`);
    const child=spawn(process.env.WINGDEX_DENO,['run','--no-config','--no-lock','--cached-only','--allow-net=127.0.0.1',
      '--allow-env=SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY',wrapper],{env:{...process.env,
      SUPABASE_URL:`http://127.0.0.1:${backend.address().port}`,SUPABASE_SERVICE_ROLE_KEY:'local-fixture-only'}});
    let output='';child.stdout.on('data',x=>output+=x);child.stderr.on('data',x=>output+=x);
    try {
      await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(new Error('Deno start timed out: '+output)),10000);
        child.stderr.on('data',()=>{if(output.includes('Listening on')){clearTimeout(timer);resolve();}});
        child.once('error',e=>{clearTimeout(timer);reject(e);});child.once('exit',()=>{clearTimeout(timer);reject(new Error(output));});
      });
      const call=async body=>{const response=await fetch(`http://127.0.0.1:${port}`,{method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({destination_ids:[destination],...body})});assert.equal(response.status,200);return (await response.json()).restaurants[0];};
      const r=await call({include_covers:true});assert.equal(r.picture_count,2);assert.equal(r.approved_submission_count,3);
      assert.equal(r.images[0].submission_id,photo(2).id);assert.ok(r.images[0].signed_url.includes(processed(2)));
      assert.ok(Date.parse(r.images[0].expires_at)<=Date.now()+300000);
      assert.equal((await fetch(r.images[0].signed_url)).status,200);now+=300001;
      assert.equal((await fetch(r.images[0].signed_url)).status,403);
      const full=await call({submission_id:photo(3).id});assert.ok(full.images[0].signed_url.includes(processed(3)));
      assert.equal(full.images[0].media_type,'photo');assert.equal(full.images[0].status,'approved');
      missing=new Set(rows.flatMap(row=>[row.thumbnail_storage_path,row.processed_storage_path]));
      const empty=await call({include_images:true});assert.equal(empty.picture_count,0);assert.deepEqual(empty.images,[]);
      assert.ok(metadataQueries>=3);
    } finally {
      if(child.exitCode===null){const closed=once(child,'exit');child.kill();await closed;}
      await new Promise(resolve=>backend.close(resolve));await rm(dir,{recursive:true,force:true});
    }
  });
