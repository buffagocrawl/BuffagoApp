import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../../crawl/package.json',import.meta.url));
const {PGlite}=require('@electric-sql/pglite');
const fixture=name=>readFileSync(new URL(`./fixtures/live_${name}.sql`,import.meta.url),'utf8');
const migration=readFileSync(new URL('../supabase/migrations/20261008165529_growth_wall_activity_weekly_catalog.sql',import.meta.url),'utf8');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;

test('deployed snapshot follow-up: exclusions, activity, catalog, weekly persistence and security',async()=>{
 const db=new PGlite();
 try {
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema auth;create schema storage;
 create table auth.users(id uuid,email text);
 create table storage.objects(bucket_id text,name text);
 create table public.user_events(anonymous_id text,user_id uuid,event_name text,platform text,occurred_at timestamptz);
 create table public.users(user_id uuid,display_name text,username text,created_at timestamptz);
 create table public.destinations(id uuid,name text,city text);
 create table public.destination_ratings(id uuid,destination_id uuid,user_id uuid,created_at timestamptz);
 create table public.wing_media_submissions(destination_id uuid,media_type text,status text,processed_storage_path text,thumbnail_storage_path text,withdrawn_at timestamptz);
 create table public."00_Open_Work"(status text,item_count int);
 create table public.user_feedback(status text,created_at timestamptz);
 create table public.buffago_store_metrics_daily(platform text,downloads_total int,downloads_daily int,store_rating numeric,store_rating_count int,metric_date date,fetched_at timestamptz);
 create table public.buffago_growth_experiments(id uuid,title text,hypothesis text,metric_name text,target_value numeric,current_value numeric,unit text,start_date date,end_date date,status text,notes text,updated_at timestamptz);
 create table public.buffago_growth_moves(id uuid,move_date date,title text,why_it_matters text,status text,completed_at timestamptz,updated_at timestamptz);
 create table public.buffago_founder_activity(category text,occurred_at timestamptz);
 create table public.buffago_growth_insights(id uuid,title text,body text,source text,created_at timestamptz,expires_at timestamptz,active boolean);
 create function public.buffago_product_pulse_operations() returns jsonb language sql stable as $$ select jsonb_build_object('pending_photos',jsonb_build_object('total',count(*))) from public.wing_media_submissions where media_type='photo' and status='in_review' $$;
 `);
 for(const name of ['wing_media_is_public_status','buffago_growth_command_center_redesign','get_buffago_growth_snapshot','get_buffago_growth_os_state']) await db.exec(fixture(name));
 await db.exec(`revoke all on function get_buffago_growth_snapshot(),get_buffago_growth_os_state(),buffago_growth_command_center_redesign() from public,anon,authenticated;
 grant execute on function get_buffago_growth_snapshot(),get_buffago_growth_os_state(),buffago_growth_command_center_redesign() to service_role;`);
 const contract=async()=> (await db.query(`select proname,pg_get_userbyid(proowner) owner,prosecdef,
 has_function_privilege('anon',oid,'execute') anon,has_function_privilege('authenticated',oid,'execute') authenticated,
 has_function_privilege('service_role',oid,'execute') service from pg_proc where proname in ('get_buffago_growth_snapshot','get_buffago_growth_os_state','buffago_growth_command_center_redesign') order by proname`)).rows;
 const before=await contract();
 await db.query('insert into auth.users values ($1,$2),($3,$4)',[id(1),'BLEMIRE9@gmail.com',id(2),'branden.lemire@outlook.com']);
 for(let n=1;n<=15;n++){
  await db.query('insert into users values($1,$2,$3,now())',[id(n),n===4?'':n===5?null:`Person ${n}`,`handle${n}`]);
  await db.query(`insert into user_events values($1,$2,'app_opened','ios',now()-($3||' minutes')::interval)`,[`device${n}`,id(n),String(n)]);
 }
 await db.exec(`insert into user_events values
 ('device1',null,'app_opened','android',now()),('device2',null,'app_opened','ios',now()-interval '25 hours'),
 ('historic',null,'app_opened','ios',now()),('historic','${id(1)}','rating_created','web',now()-interval '100 days'),
 (null,'${id(2)}','app_opened','ios',now()),
 ('web', '${id(20)}','app_opened','web',now());
 insert into user_events values('device3','${id(3)}','app_opened','ios',now()-interval '1 second');
 insert into user_events values
 ('device1','${id(1)}','app_opened','ios','2026-06-01T05:00:00Z'),
 ('device1',null,'app_opened','ios','2026-06-02T05:00:00Z'),
 ('september-external','${id(21)}','app_opened','android','2026-09-01T05:00:00Z');
 insert into destinations values('${id(101)}','Wing One','Town A'),('${id(102)}','Wing Two','Town B'),('${id(103)}','No coverage','Town C');
 insert into destination_ratings values('${id(201)}','${id(101)}','${id(1)}',now()),('${id(202)}','${id(101)}','${id(2)}',now());
 `);
 for(let n=3;n<=15;n++)await db.query(`insert into destination_ratings values($1,$2,$3,now()-($4||' minutes')::interval)`,[id(200+n),id(102),id(n),String(n)]);
 const unfiltered=(await db.query('select buffago_growth_command_center_redesign() data')).rows[0].data;
 await db.exec(migration);
 await db.exec(migration);
 assert.deepEqual(await contract(),before);
 const snap=async()=> (await db.query('select get_buffago_growth_snapshot() s')).rows[0].s;
 let s=await snap();
 assert.equal(s.product_pulse.device_opens.all_time.total,14);
 assert.equal(s.product_pulse.device_opens.last_24h.total,13);
 assert.equal(s.product_pulse.device_opens.previous_24h.total,0);
 assert.equal(s.product_pulse.calendar_mau.current_month.value,13);
 assert.equal(s.product_pulse.calendar_mau.previous_month.value,1);
 assert.equal(s.product_pulse.monthly_history.at(-1).mau,13);
 assert.equal(s.product_pulse.monthly_history.at(-1).unique_devices,13);
 assert.notDeepEqual(s.marketing.factors.mau,unfiltered.marketing.factors.mau);
 assert.equal((await db.query('select get_buffago_growth_os_state() s')).rows[0].s.north_star.current,13);
 assert.equal(s.recent_activity.logins.length,10);
 assert.equal(s.recent_activity.logins[0].user_id,id(20)); // login feed includes signed-in web users.
 assert.equal(s.recent_activity.logins[0].display_name,'User 00000000');
 assert.equal(s.recent_activity.logins[1].user_id,id(3));
 assert.equal(s.recent_activity.logins.filter(x=>x.user_id===id(3)).length,1);
 assert.equal(s.recent_activity.logins.find(x=>x.user_id===id(4)).display_name,'handle4');
 assert.equal(s.recent_activity.logins.find(x=>x.user_id===id(5)).display_name,'handle5');
 assert.equal(s.recent_activity.ratings.length,10);
 assert.equal(s.recent_activity.ratings[0].destination_name,'Wing Two');
 assert.equal(s.recent_activity.ratings[0].city,'Town B');
 assert.ok(s.recent_activity.logins.every((row,i,rows)=>i===0||rows[i-1].occurred_at>=row.occurred_at));
 assert.ok(s.recent_activity.ratings.every((row,i,rows)=>i===0||rows[i-1].created_at>=row.created_at));
 assert.ok(s.recent_activity.logins.every(x=>![id(1),id(2)].includes(x.user_id)));
 assert.ok(s.recent_activity.ratings.every(x=>!('user_id' in x)));
 assert.ok(!JSON.stringify(s).includes('@'));
 assert.equal(s.product_pulse.totals.users_created,15);
 assert.equal(s.product_pulse.catalog_health.restaurants_without_ratings.count,1);
 assert.equal(s.product_pulse.catalog_health.restaurants_without_ratings.percentage,33.3);
 assert.equal(s.product_pulse.monthly_history.find(row=>row.month==='2026-06').app_open_tracking_available,true);
 assert.equal(s.product_pulse.monthly_history.find(row=>row.month==='2026-06').mau,0);
 for(const status of ['rejected','withdrawn','failed','pending','in_review']) {
  await db.query(`insert into wing_media_submissions values($1,'photo',$2,'asset',null,null)`,[id(101),status]);
 }
 await db.exec(`insert into storage.objects values('wing-submissions','asset');`);
 assert.equal((await snap()).product_pulse.catalog_health.restaurants_without_photos.count,3);
 await db.query(`insert into wing_media_submissions values($1,'photo','approved','asset',null,null)`,[id(101)]);
 await db.query(`insert into wing_media_submissions values($1,'photo','posted','missing',null,null)`,[id(102)]);
 assert.equal((await snap()).product_pulse.catalog_health.restaurants_without_photos.count,2);
 await db.exec(`insert into storage.objects values('wing-submissions','missing');`);
 assert.equal((await snap()).product_pulse.catalog_health.restaurants_without_photos.count,1);
 const saved=s.marketing_weekly_goal;
 assert.equal((await db.query('select count(*)::int n from buffago_growth_weekly_plans')).rows[0].n,1);
 await db.exec(`insert into user_events values('fresh',null,'app_opened','android',now());`);
 assert.deepEqual((await snap()).marketing_weekly_goal,saved);
 const select=async factors=>(await db.query(`select buffago_growth_select_weekly_plan('2026-10-05',$1,'{}','{}') p`,[JSON.stringify({factors})])).rows[0].p;
 assert.match((await select({acquisition:{score:0},mau:{score:50}})).goal,/Acquire/);
 assert.match((await select({engagement:{score:0},mau:{score:50}})).goal,/ratings/);
 assert.match((await select({})).goal,/baseline/);
 assert.equal((await db.query(`select buffago_growth_week_start('2026-10-05T03:59:00Z')::text w`)).rows[0].w,'2026-09-28');
 assert.equal((await db.query(`select buffago_growth_week_start('2026-10-05T04:00:00Z')::text w`)).rows[0].w,'2026-10-05');
 assert.equal((await db.query(`select buffago_growth_week_start('2026-10-12T04:00:00Z')::text w`)).rows[0].w,'2026-10-12');
 assert.equal((await db.query(`select buffago_growth_week_start('2026-11-02T04:59:00Z')::text w`)).rows[0].w,'2026-10-26');
 const following=(await db.query(`select buffago_growth_select_weekly_plan('2026-10-12','{}','{}','{}') p`)).rows[0].p;
 assert.equal(following.week_start,'2026-10-12');
 assert.equal((await db.query(`select relrowsecurity enabled from pg_class where oid='public.buffago_growth_weekly_plans'::regclass`)).rows[0].enabled,true);
 assert.ok(!/random\(|http|llm/i.test(migration));
 for(const role of ['anon','authenticated']) {
  assert.equal((await db.query(`select has_function_privilege('${role}','buffago_growth_recent_activity()','execute') ok`)).rows[0].ok,false);
  assert.equal((await db.query(`select has_table_privilege('${role}','buffago_growth_weekly_plans','select') ok`)).rows[0].ok,false);
 }
 await db.exec('truncate user_events,destination_ratings,destinations,users;');
 s=await snap();
 assert.deepEqual(s.recent_activity,{logins:[],ratings:[]});
 assert.equal(s.product_pulse.catalog_health.restaurants_without_photos.percentage,0);
 }finally{await db.close();}
});
