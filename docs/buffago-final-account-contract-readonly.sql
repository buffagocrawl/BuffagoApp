-- UNEXECUTED PRODUCTION READ-ONLY REQUEST. Target vhfxnizaxdanmvmouuaf only.
-- Separate authorization required before connecting. No user/media/path rows.
-- Needed for the additional conservative delete-account candidate's exact
-- service-role manifest/intent inventory access and upload-fence acceptance.
begin read only;
set local lock_timeout='5s';
set local statement_timeout='60s';
set local search_path=pg_catalog;
select n.nspname,c.relname,a.attname,format_type(a.atttypid,a.atttypmod) as type,a.attnotnull,
 c.relrowsecurity,c.relowner::regrole::text as owner,
 has_table_privilege('service_role',c.oid,'SELECT') as service_role_select
from pg_class c join pg_namespace n on n.oid=c.relnamespace
join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
where n.nspname='public' and
 ((c.relname='wing_account_deletion_manifests' and a.attname in ('id','user_id','correlation_id','status','prepared_at'))
 or (c.relname='wing_submission_upload_intents' and a.attname in ('id','user_id','expected_storage_path','status')))
order by c.relname,a.attnum;
select p.oid::regprocedure::text as signature,p.proowner::regrole::text as owner,
 p.prosecdef,md5(p.proconfig::text) as config_md5,md5(p.prosrc) as body_md5
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname in ('public','private') and p.proname in
 ('reserve_wing_submission_upload','finalize_wing_submission_upload','reserve_wing_photo_upload',
 'finalize_wing_photo_upload','prepare_wing_account_media_cleanup','complete_wing_account_media_cleanup')
order by signature;
rollback;
-- Compare against screened checkout bodies; request only any mismatching exact
-- upload RPC signatures discovered above, screened before sharing. Definitions
-- must demonstrate the same per-account fence through reserve/finalize/Storage
-- writes and Auth deletion; a catalog row alone cannot prove that behavior.
