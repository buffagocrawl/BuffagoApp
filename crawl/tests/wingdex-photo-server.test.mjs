import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { normalizeWingdexGalleryResponse, loadWingdexFullPhoto, loadWingdexGallery, loadWingdexRestaurantGallery } from '../lib/wingdexGallery.js';
const restaurant='11111111-1111-4111-8111-111111111111';
const id=(n) => `22222222-2222-4222-8222-${String(n).padStart(12,'0')}`;
const processed=(n)=>`processed/${id(n)}/primary`;
const thumbnail=(n)=>`thumbnails/${id(n)}/preview`;
const make=(n, likes=0, dislikes=0, extra={}) => ({ id:id(n), destination_id:restaurant, media_type:'photo', status:'approved',
  user_id:id(999),owner_deleted_at:null,withdrawn_at:null,consent_version:'v1',consented_at:'2026-01-01T00:00:00Z',attribution_preference:'anonymous',
  created_at:'2026-01-01T00:00:00Z', like_count:likes, dislike_count:dislikes,
  thumbnail_storage_path:thumbnail(n), processed_storage_path:processed(n), ...extra });
function server(rows, { missing=[], fail=false, signFail=false, throwSign=false }={}) {
  let handler; const reads=[]; const signs=[];
  const admin={ from(table) {
    assert.equal(table,'wing_media_submissions'); let selected=rows; const orders=[];
    return { select(fields) { assert.ok(!fields.includes('original')); return this; },
      in(k,values) { selected=selected.filter((p)=>values.includes(p[k])); return this; },
      eq(k,v) { selected=selected.filter((p)=>p[k]===v); return this; },
      is(k,v) { selected=selected.filter((p)=>p[k]===v); return this; },
      not(k,_operator,v) { selected=selected.filter((p)=>p[k]!==v); return this; },
      order(k,{ascending}) { orders.push([k,ascending]); return this; },
      async range(start,end) { reads.push([start,end]); selected.sort((a,b)=>{for(const [k,asc] of orders){if(a[k]===b[k])continue;return (a[k]<b[k]?-1:1)*(asc?1:-1);}return 0;});
        return fail ? { error:{message:'offline'} } : { data:selected.slice(start,end+1),error:null }; } };
  }, storage:{ from(bucket) { assert.equal(bucket,'wing-submissions'); return { async createSignedUrls(paths,seconds) {
    signs.push(Array.from(paths)); assert.equal(seconds,300);
    if (throwSign) throw new Error('storage offline');
    if (signFail) return { data:null,error:{message:'storage offline'} };
    return { data:paths.map((path)=>missing.includes(path)?{path,error:'not found'}:{path,signedUrl:`https://signed.test/${path}`}),error:null };
  } }; } } };
  const source=fs.readFileSync(new URL('../supabase/functions/wing-public-gallery/index.ts',import.meta.url),'utf8')
    .replace(/import \{ createClient \} from .*?;/,'');
  const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  vm.runInNewContext(code,{exports:{},Request,Response,Date,createClient:()=>admin,
    Deno:{env:{get:()=> 'server-only-value'},serve:(fn)=>{handler=fn;}}});
  return {reads,signs,call:async(body)=>{const response=await handler(new Request('https://test/gallery',{method:'POST',body:JSON.stringify({destination_ids:[restaurant],...body})}));return {status:response.status,data:await response.json()};}};
}
test('server selects community winner and rejects all non-approved photos/videos',async()=>{
  const s=server([make(1,3,0),make(2,8,4),make(3,8,1),
    ...['pending','processing','in_review','rejected','withdrawn','posted'].map((status,n)=>make(10+n,100,0,{status})),make(20,100,0,{media_type:'video'})]);
  const response=await s.call({include_covers:true}); const r=response.data.restaurants[0];
  assert.equal(r.picture_count,3); assert.equal(r.images.length,1); assert.equal(r.images[0].submission_id,id(3));
  assert.equal(r.images[0].signed_url,`https://signed.test/${thumbnail(3)}`); assert.equal(r.images[0].like_count,8);
  assert.deepEqual(s.reads,[[0,999]]); assert.equal(s.signs.length,2);
  assert.ok(!JSON.stringify(response).includes('storage_path'));
});
test('server date then ID tie ordering, missing thumbnails use processed asset',async()=>{
  const s=server([make(2),make(1),make(3,0,0,{created_at:'2026-02-01'})],{missing:[thumbnail(1)]});
  const response=await s.call({include_images:true}); const images=response.data.restaurants[0].images;
  assert.deepEqual(images.map((p)=>p.submission_id),[id(1),id(2),id(3)]);
  assert.equal(images[0].signed_url,`https://signed.test/${processed(1)}`);
});
test('full viewer signs only selected processed asset and revalidates approval/destination',async()=>{
  const s=server([make(1),make(2)]); let response=await s.call({submission_id:id(2)});
  assert.equal(response.data.restaurants[0].images[0].submission_id,id(2)); assert.deepEqual(s.signs,[[processed(2)]]);
  response=await server([make(2,0,0,{status:'withdrawn'})]).call({submission_id:id(2)});
  assert.equal(response.data.restaurants[0].images.length,0);
  response=await server([make(2,0,0,{destination_id:id(50)})]).call({submission_id:id(2)});
  assert.equal(response.data.restaurants[0].images.length,0);
});
test('large batches validate every asset before counting and return only the cover',async()=>{
  const s=server(Array.from({length:1001},(_,n)=>make(n+1)));
  const response=await s.call({include_covers:true});
  assert.equal(response.data.restaurants[0].picture_count,1001);
  assert.deepEqual(s.reads,[[0,999],[1000,1999]]);
  assert.equal(s.signs.length,12); assert.ok(s.signs.every((paths)=>paths.length<=100));
  assert.equal(s.signs.flat().length,1002); assert.equal(response.data.restaurants[0].images.length,1);
});

for (const size of [10, 50, 100, 500]) test(`${size} photos keep page signing bounded`, async () => {
  const s=server(Array.from({length:size},(_,n)=>make(n+1)));
  const first=(await s.call({include_images:true})).data.restaurants[0];
  assert.equal(first.picture_count,size);
  assert.equal(first.images.length,Math.min(size,60));
  assert.equal(s.signs.flat().filter((path)=>path.startsWith('thumbnails/')).length,Math.min(size,60));
  assert.equal(s.signs.flat().filter((path)=>path.startsWith('processed/')).length,size);
  if (size>60) {
    const next=(await s.call({include_images:true,offset:60})).data.restaurants[0];
    assert.equal(next.images.length,Math.min(size-60,60));
  }
});

test('250 restaurants share metadata queries and batch signing rather than N+1 calls',async()=>{
  const destinations=Array.from({length:250},(_,n)=>id(n+3000));
  const rows=destinations.flatMap((destination_id,n)=>[make(n*2+1,1,0,{destination_id}),make(n*2+2,2,0,{destination_id})]);
  const s=server(rows); const response=await s.call({destination_ids:destinations,include_covers:true});
  assert.equal(response.data.restaurants.length,250); assert.equal(s.reads.length,1);
  assert.equal(s.signs.length,8); assert.ok(s.signs.every((paths)=>paths.length<=100));
  for(const r of response.data.restaurants) {
    assert.equal(r.images.length,1); assert.equal(r.images[0].like_count,2); assert.equal(r.picture_count,2);
  }
});
test('network failure and missing processed asset remain controlled',async()=>{
  assert.equal((await server([make(1)],{fail:true}).call({include_covers:true})).status,503);
  assert.equal((await server([make(1,0,0,{processed_storage_path:null})]).call({include_images:true})).data.restaurants[0].picture_count,0);
  assert.equal((await server([make(1)],{missing:[processed(1)]}).call({submission_id:id(1)})).data.restaurants[0].images.length,0);
});

test('unavailable highest-liked photo falls back to the best usable runner-up',async()=>{
  const s=server([make(1,100),make(2,20,3),make(3,20,1)],{missing:[thumbnail(1),processed(1),thumbnail(3)]});
  const r=(await s.call({include_covers:true})).data.restaurants[0];
  assert.equal(r.approved_submission_count,3); assert.equal(r.picture_count,2);
  assert.equal(r.images[0].submission_id,id(3));
  assert.equal(r.images[0].signed_url,`https://signed.test/${processed(3)}`);
});

test('null derivative paths and missing objects count as approvals but not displayable photos',async()=>{
  const s=server([make(1,100,0,{processed_storage_path:null,thumbnail_storage_path:null}),make(2,50),make(3)],
    {missing:[thumbnail(2),processed(2)]});
  for (const body of [{},{include_covers:true},{include_images:true}]) {
    const r=(await s.call(body)).data.restaurants[0];
    assert.equal(r.approved_submission_count,3); assert.equal(r.picture_count,1);
    assert.equal(r.images.length,body.include_covers||body.include_images?1:0);
  }
  assert.ok(s.signs.flat().every((path)=>path && !path.includes('original')));
});

test('thumbnail alone cannot make a photo displayable when full viewer needs the processed object',async()=>{
  const s=server([make(1)],{missing:[processed(1)]});
  const r=(await s.call({include_covers:true})).data.restaurants[0];
  assert.equal(r.picture_count,0); assert.deepEqual(r.images,[]);
  assert.equal((await s.call({submission_id:id(1)})).data.restaurants[0].picture_count,0);
});

test('empty and assetless galleries normalize to the branded empty state input',async()=>{
  for (const rows of [[],[make(1)],[make(1,0,0,{processed_storage_path:null})]]) {
    const s=server(rows,{missing:[thumbnail(1),processed(1)]});
    const result=await s.call({include_covers:true});
    assert.equal(result.status,200);
    const normalized=normalizeWingdexGalleryResponse(result.data)[restaurant];
    assert.equal(normalized.count,0); assert.deepEqual(normalized.images,[]);
    assert.equal(normalized.approvedSubmissionCount,rows.length);
  }
  const gallery=fs.readFileSync(new URL('../components/WingdexPhotoGallery.jsx',import.meta.url),'utf8');
  assert.match(gallery,/!state.images.length/); assert.match(gallery,/BUFFAGO/);
});

test('pagination applies to displayable photos and fills pages past missing winners',async()=>{
  const s=server(Array.from({length:65},(_,n)=>make(n+1)),{missing:[thumbnail(1),processed(1),thumbnail(3),processed(3)]});
  const first=(await s.call({include_images:true})).data.restaurants[0];
  const second=(await s.call({include_images:true,offset:60})).data.restaurants[0];
  assert.equal(first.picture_count,63); assert.equal(first.approved_submission_count,65);
  assert.equal(first.images.length,60); assert.equal(first.images[0].submission_id,id(2));
  assert.deepEqual(second.images.map((p)=>p.submission_id),[id(63),id(64),id(65)]);
});

test('storage service errors remain retryable failures rather than false empty galleries',async()=>{
  for (const options of [{signFail:true},{throwSign:true}]) {
    const response=await server([make(1)],options).call({include_covers:true});
    assert.equal(response.status,503); assert.equal(response.data.error,'gallery_unavailable');
  }
});

test('actual Edge responses satisfy cover, gallery and full-photo client contracts',async()=>{
  const s=server([make(1,4,2),make(2)]);
  const client={functions:{invoke:async(_name,{body})=>({data:(await s.call(body)).data,error:null})}};
  const cover=(await loadWingdexGallery([restaurant],client))[restaurant];
  const gallery=await loadWingdexRestaurantGallery(restaurant,client);
  const full=await loadWingdexFullPhoto(cover.images[0],client);
  assert.equal(cover.count,2); assert.equal(cover.approvedSubmissionCount,2);
  assert.equal(gallery.images.length,2); assert.equal(full.signed_url,`https://signed.test/${processed(1)}`);
  for (const photo of [cover.images[0],gallery.images[0],full]) {
    assert.deepEqual(Object.keys(photo).sort(),['submission_id','destination_id','media_type','status','signed_url','expires_at','like_count','dislike_count','created_at'].sort());
    assert.equal(photo.destination_id,restaurant); assert.equal(photo.media_type,'photo'); assert.equal(photo.status,'approved');
    assert.equal(photo.like_count,4); assert.equal(photo.dislike_count,2);
    assert.ok(Date.parse(photo.expires_at)-Date.now()>295000 && Date.parse(photo.expires_at)-Date.now()<=300000);
  }
});

test('deleted owners, withdrawn photos and invalid consent never receive fresh gallery URLs',async()=>{
  const rows=[make(1),make(2,100,0,{owner_deleted_at:'2026-01-01',user_id:null}),
    make(3,100,0,{withdrawn_at:'2026-01-01'}),make(4,100,0,{consent_version:' '}),
    make(5,100,0,{consented_at:'2999-01-01'}),make(6,100,0,{attribution_preference:null}),
    ...Array.from('\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff',
      (consent_version,n)=>make(10+n,100,0,{consent_version}))];
  const s=server(rows);const r=(await s.call({include_images:true})).data.restaurants[0];
  assert.equal(r.picture_count,1);assert.deepEqual(r.images.map(p=>p.submission_id),[id(1)]);
  assert.equal(r.approved_submission_count,1);
  assert.deepEqual(s.signs,[[processed(1)],[thumbnail(1)]]);
});

test('approved rows cannot cause the public service key to sign originals or another photo',async()=>{
  const original=`originals/${id(999)}/${id(1)}/source`;
  const s=server([
    make(1,100,0,{processed_storage_path:original}),
    make(2,90,0,{processed_storage_path:processed(3)}),
    make(3,10,0,{thumbnail_storage_path:original}),
  ]);
  const gallery=(await s.call({include_images:true})).data.restaurants[0];
  assert.equal(gallery.approved_submission_count,3);
  assert.equal(gallery.picture_count,1);
  assert.deepEqual(gallery.images.map((photo)=>photo.submission_id),[id(3)]);
  assert.equal(gallery.images[0].signed_url,`https://signed.test/${processed(3)}`);
  assert.deepEqual(s.signs,[[processed(3)]]);
  for(const n of [1,2]) {
    const viewer=(await s.call({submission_id:id(n)})).data.restaurants[0];
    assert.equal(viewer.picture_count,0);
    assert.deepEqual(viewer.images,[]);
  }
  assert.deepEqual(s.signs,[[processed(3)]]);
});
