-- Jalapeño selection contract: one active reviewer priority first, then a
-- deterministic candidate across the full eligible approved pool. The claim and
-- transition remain in the same transaction protected by the nightly lock.

begin;

create or replace function public.run_wing_nightly_selection(
  p_business_date date, p_correlation_id uuid
)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public
as $$
declare c public.wing_moderation_config%rowtype; r public.wing_nightly_run_receipts%rowtype;
  s public.wing_media_submissions%rowtype; receipt uuid; generation uuid;
  n integer; mode text := 'oldest_approved'; components jsonb; score numeric := 0;
  had boolean := false; ig uuid:=gen_random_uuid(); fb uuid:=gen_random_uuid();
begin
  if p_business_date is null or p_correlation_id is null then raise exception 'nightly_identity_required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('wing-nightly:'||p_business_date::text,0));
  select * into c from public.wing_moderation_config where singleton;
  if not c.nightly_enabled then raise exception 'wing_nightly_disabled'; end if;
  select * into r from public.wing_nightly_run_receipts where business_date=p_business_date for update;
  had := found;
  if found and r.status <> 'running' then return jsonb_build_object('receipt_id',r.id,'status',upper(r.status)); end if;
  if found and r.started_at > now()-interval '30 minutes' then return jsonb_build_object('receipt_id',r.id,'status','ALREADY_RUNNING'); end if;
  if found then update public.wing_nightly_run_receipts set status='failed',completed_at=now(),failure_code='STALE_RUN_RECOVERED' where id=r.id; end if;
  select count(*) into n from public.wing_media_submissions x
    where x.status='approved' and x.featured_at is null and x.processed_storage_path is not null
      and x.moderation_status in ('likely_acceptable','overridden')
      and x.wing_verification_status in ('likely_wings','overridden') and x.duplicate_group is null
      and not exists(select 1 from public.wing_submission_abuse_signals a where a.submission_id=x.id and a.severity in ('high','critical'));
  if n=0 then
    if had then update public.wing_nightly_run_receipts set status='skipped_no_approved_content',candidate_count=0,completed_at=now(),failure_code='SKIPPED_NO_APPROVED_CONTENT',correlation_id=p_correlation_id where id=r.id returning id into receipt;
    else insert into public.wing_nightly_run_receipts(business_date,status,candidate_count,dry_run,completed_at,failure_code,correlation_id) values(p_business_date,'skipped_no_approved_content',0,c.publishing_dry_run,now(),'SKIPPED_NO_APPROVED_CONTENT',p_correlation_id) returning id into receipt; end if;
    return jsonb_build_object('receipt_id',receipt,'status','SKIPPED_NO_APPROVED_CONTENT');
  end if;
  -- First preference is the database-enforced active priority. A stale row is
  -- ignored by the eligibility predicate and cannot block the oldest branch.
  select * into s from public.wing_media_submissions x where x.is_publish_priority and x.status='approved' and x.featured_at is null and x.processed_storage_path is not null
    and x.moderation_status in ('likely_acceptable','overridden') and x.wing_verification_status in ('likely_wings','overridden') and x.duplicate_group is null
    and not exists(select 1 from public.wing_submission_abuse_signals a where a.submission_id=x.id and a.severity in ('high','critical')) for update skip locked;
  if found then mode := 'priority'; else
    select * into s from public.wing_media_submissions x where x.status='approved' and x.featured_at is null and x.processed_storage_path is not null
      and x.moderation_status in ('likely_acceptable','overridden') and x.wing_verification_status in ('likely_wings','overridden') and x.duplicate_group is null
      and not exists(select 1 from public.wing_submission_abuse_signals a where a.submission_id=x.id and a.severity in ('high','critical'))
      order by x.priority desc, x.approved_at asc nulls last, x.created_at asc, x.id limit 1 for update skip locked;
  end if;
  if not found then return jsonb_build_object('status','SKIPPED_NO_APPROVED_CONTENT','reason','claim_race'); end if;
  components := jsonb_build_object('selection_mode',mode,'manual_priority',s.is_publish_priority,'ordering','priority,approved_at,created_at,id');
  if had then update public.wing_nightly_run_receipts set status='selected',selected_submission_id=s.id,candidate_count=n,score_components=components,dry_run=c.publishing_dry_run,completed_at=now(),correlation_id=p_correlation_id where id=r.id returning id into receipt;
  else insert into public.wing_nightly_run_receipts(business_date,status,selected_submission_id,candidate_count,score_components,dry_run,completed_at,correlation_id) values(p_business_date,'selected',s.id,n,components,c.publishing_dry_run,now(),p_correlation_id) returning id into receipt; end if;
  perform public.wing_transition_submission(s.id,'generation_pending','approved','scheduler',null,'nightly_selection','nightly:'||p_business_date::text,p_correlation_id,components);
  insert into public.wing_generation_jobs(submission_id,nightly_receipt_id,instagram_job_id,facebook_job_id,instagram_media_path,facebook_media_path,correlation_id)
    values(s.id,receipt,ig,fb,'publication/'||s.id||'/instagram/'||ig,'publication/'||s.id||'/facebook/'||fb,p_correlation_id) returning id into generation;
  return jsonb_build_object('receipt_id',receipt,'status','SELECTED','submission_id',s.id,'generation_job_id',generation,'score_components',components);
end;
$$;

revoke all on function public.run_wing_nightly_selection(date,uuid) from public,anon,authenticated;
grant execute on function public.run_wing_nightly_selection(date,uuid) to service_role;

commit;
