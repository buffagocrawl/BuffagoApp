import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const reviewer='10000000-0000-4000-8000-000000000001', user='10000000-0000-4000-8000-000000000002';
const sid=n=>`20000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const destination={name:'Wing Place',address:'1 Main St',city:'Hartford',state_id:1,lat:41.76,lng:-72.67};
test('restaurant queue, atomic moderation, duplicate reuse and service-only access', async t=>{
 const db=new PGlite();
 try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
   create schema auth; create table auth.users(id uuid primary key);
   create table public.app_user_roles(user_id uuid,role text,active boolean,revoked_at timestamptz);
   create table public.destinations(id uuid primary key default gen_random_uuid(),name text,address text,city text,state_id integer,lat numeric,lng numeric,created_by uuid,created_at timestamptz default now());
   create table public.destination_suggestions(id uuid primary key default gen_random_uuid(),user_id uuid,state_id integer,restaurant_name text,address text,created_at timestamptz default now());
   create function public.buffago_product_pulse_operations() returns jsonb language sql as $$select '{}'::jsonb$$;
   create function public.get_buffago_growth_snapshot() returns jsonb language sql security definer as $$ select jsonb_build_object('product_pulse', public.buffago_product_pulse_operations() || jsonb_build_object('feedback',jsonb_build_object('open_total',7))) $$;
   grant usage on schema public,auth to service_role;
   grant select,insert,update on destinations,destination_suggestions,app_user_roles to service_role;
   insert into auth.users values('${reviewer}'),('${user}');
   insert into app_user_roles values('${reviewer}','wing_reviewer',true,null);`);
  await db.exec(readFileSync(new URL('../supabase/migrations/20261013011230_mango_restaurant_review.sql',import.meta.url),'utf8'));
  for(let i=1;i<=7;i++) await db.query('insert into destination_suggestions(id,user_id,state_id,restaurant_name,address) values($1,$2,1,$3,$4)',[sid(i),user,destination.name,destination.address]);
  const review=(i,action='approve',note='Menu confirms wings.',d=destination,actor=reviewer)=>db.query('select mango_review_restaurant($1,$2,$3,$4,$5) result',[sid(i),actor,action,note,d]);
  await db.exec('set role service_role');
  await t.test('count is the exact pending queue and snapshot retains existing metrics',async()=>{
   assert.equal(Number((await db.query('select mango_restaurant_pending_count() n')).rows[0].n),7);
   const pulse=(await db.query('select get_buffago_growth_snapshot() snapshot')).rows[0].snapshot.product_pulse;
   assert.equal(pulse.pending_restaurants.total,7);assert.equal(pulse.feedback.open_total,7);
  });
  let first;
  await t.test('approval creates one destination and leaves original submission',async()=>{
   first=(await review(1)).rows[0].result;
   assert.equal(first.action,'approve');assert.ok(first.destination_id);
   assert.equal((await db.query('select * from destinations')).rows.length,1);
   assert.equal((await db.query('select * from destination_suggestions')).rows.length,7);
  });
  await t.test('identical retry returns same receipt; conflicting decision fails',async()=>{
   assert.equal((await review(1)).rows[0].result.destination_id,first.destination_id);
   await assert.rejects(review(1,'reject','Changed my review.',null),/already_reviewed/);
  });
  await t.test('second suggestion and automated flow reuse destination',async()=>{
   assert.equal((await review(2)).rows[0].result.destination_id,first.destination_id);
   const d=(await db.query('select wingman_create_destination($1,$2) d',[destination,user])).rows[0].d;
   assert.equal(d.id,first.destination_id);assert.equal((await db.query('select * from destinations')).rows.length,1);
  });
  await t.test('rejection persists reason and removes only selected pending entry',async()=>{
   const r=(await review(3,'reject','Menu has no chicken wings.',null)).rows[0].result;
   assert.equal(r.reviewer_note,'Menu has no chicken wings.');assert.equal(r.destination_id,null);
   assert.equal(Number((await db.query('select mango_restaurant_pending_count() n')).rows[0].n),4);
  });
  await t.test('invalid location, wrong state and ambiguous address roll back',async()=>{
   await assert.rejects(review(4,'approve','Verified the menu.',{...destination,lat:null}),/location_required/);
   await assert.rejects(review(4,'approve','Verified the menu.',{...destination,state_id:2}),/state_mismatch/);
   await assert.rejects(review(4,'approve','Verified the menu.',{...destination,address:'2 Main St'}),/match_ambiguous/);
   assert.equal((await db.query('select * from restaurant_suggestion_reviews')).rows.length,3);
   assert.equal((await db.query('select * from destinations')).rows.length,1);
  });
  await t.test('unknown, inactive and unauthorized reviewer rejected',async()=>{
   await assert.rejects(review(5,'approve','Verified the menu.',destination,user),/reviewer_required/);
   await db.exec(`update app_user_roles set active=false where user_id='${reviewer}'`);
   await assert.rejects(review(5),/reviewer_required/);
   await db.exec(`update app_user_roles set active=true where user_id='${reviewer}'`);
   await assert.rejects(review(99),/not_found/);
   await assert.rejects(review(5,'reject','short',null),/review_invalid/);
  });
  await t.test('anon and authenticated cannot read queue or execute review/create/count',async()=>{
   for(const role of ['anon','authenticated']){
    await db.exec(`reset role; set role ${role}`);
    await assert.rejects(db.query('select * from mango_pending_restaurants'),/permission denied/);
    await assert.rejects(db.query('select * from restaurant_suggestion_reviews'),/permission denied/);
    await assert.rejects(review(5),/permission denied/);
    await assert.rejects(db.query('select wingman_create_destination($1,$2)',[destination,user]),/permission denied/);
    await assert.rejects(db.query('select mango_restaurant_pending_count()'),/permission denied/);
   }
  });
 } finally {await db.close();}
});
