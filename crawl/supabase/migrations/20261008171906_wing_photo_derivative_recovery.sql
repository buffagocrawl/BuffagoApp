-- Photo derivative jobs never change human approval or enqueue publication.
begin;

create table public.wing_photo_derivative_jobs (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.wing_media_submissions(id) on delete restrict,
  purpose text not null check (purpose in ('upload','recovery')),
  status text not null default 'pending' check (status in ('pending','claimed','retry','succeeded','dead','cancelled')),
  attempt_count integer not null default 0,
  max_attempts integer not null default 4 check (max_attempts between 1 and 32),
  available_at timestamptz not null default now(),
  claim_token uuid, claimed_by text, lease_expires_at timestamptz,
  last_error_code text, correlation_id uuid not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (attempt_count between 0 and 32),
  check (status <> 'claimed' or (claim_token is not null and claimed_by is not null and lease_expires_at is not null))
);
create index wing_photo_derivative_claim_idx on public.wing_photo_derivative_jobs(available_at,created_at,id)
  where status in ('pending','retry');
create table public.wing_photo_derivative_receipts (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null, job_id uuid,
  attempt_number integer not null default 0,
  event text not null, error_code text,
  correlation_id uuid not null, occurred_at timestamptz not null default now()
);
create index wing_photo_derivative_receipts_submission_idx on public.wing_photo_derivative_receipts(submission_id,occurred_at);
alter table public.wing_photo_derivative_jobs enable row level security;
alter table public.wing_photo_derivative_receipts enable row level security;
revoke all on public.wing_photo_derivative_jobs,public.wing_photo_derivative_receipts from public,anon,authenticated;
grant select,insert,update on public.wing_photo_derivative_jobs to service_role;
grant select,insert on public.wing_photo_derivative_receipts to service_role;
create function public.wing_photo_receipt_append_only() returns trigger language plpgsql as $$
begin raise exception 'photo_receipts_are_append_only'; end;
$$;
create trigger wing_photo_receipt_append_only before update or delete on public.wing_photo_derivative_receipts
  for each row execute function public.wing_photo_receipt_append_only();

-- This helper is internal/service-only; consent is the recorded affirmative upload
-- consent, not a new product consent version. Never extend an existing deadline.
create function public.wing_photo_processing_blocker(p_submission_id uuid) returns text
language sql stable security definer set search_path=pg_catalog,public,storage as $$
  select case
    when s.media_type <> 'photo' or s.status not in ('in_review','approved') then 'not_processable'
    when s.withdrawn_at is not null then 'withdrawn'
    when s.user_id is null or s.owner_deleted_at is not null
      or not exists(select 1 from auth.users u where u.id=s.user_id) then 'owner_deleted'
    when s.status='approved' and (s.approved_at is null or s.approved_by is null) then 'approval_missing'
    when s.featured_at is not null
      or exists(select 1 from public.wing_generation_jobs g where g.submission_id=s.id)
      or exists(select 1 from public.social_content_jobs c where c.submission_id=s.id) then 'publication_started'
    when nullif(trim(s.consent_version),'') is null or s.consented_at is null or s.consented_at>now()
      or s.attribution_preference is null or s.attribution_preference not in ('username','display_name','anonymous') then 'consent_required'
    when s.original_deleted_at is not null then 'original_deleted'
    when coalesce(s.original_retain_until,s.created_at+make_interval(days=>coalesce(
      (select original_retention_days from public.wing_moderation_config where singleton limit 1),30)))<=now() then 'retention_expired'
    when s.original_storage_path is distinct from 'originals/'||s.user_id::text||'/'||s.id::text||'/source' then 'original_path_invalid'
    when not exists(select 1 from storage.objects o where o.bucket_id='wing-submissions' and o.name=s.original_storage_path) then 'original_missing'
    when s.moderation_status in ('clear_rejection','failed') or s.wing_verification_status in ('not_wings','failed') then 'moderation_blocked'
    when exists(select 1 from public.wing_processing_jobs j where j.submission_id=s.id
      and j.job_kind='photo_process' and j.status in ('pending','claimed','retry')) then 'legacy_processing_active'
    else null end
  from public.wing_media_submissions s where s.id=p_submission_id;
$$;

create function public.list_wing_photo_derivative_candidates(p_limit integer default 100,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,storage as $$
declare result jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
  if p_limit not between 1 and 100 or p_offset not between 0 and 100000 then raise exception 'invalid_inventory_page'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('submission_id',c.id,'blocker',c.blocker,'job_status',c.job_status)
    order by c.created_at,c.id),'[]'::jsonb) into result from (
    select s.id,s.created_at,public.wing_photo_processing_blocker(s.id) as blocker,j.status as job_status
    from public.wing_media_submissions s left join public.wing_photo_derivative_jobs j on j.submission_id=s.id
    where s.media_type='photo' and s.status='approved'
      and (s.processed_storage_path is null or s.thumbnail_storage_path is null
        or not exists(select 1 from storage.objects o where o.bucket_id='wing-submissions' and o.name=s.processed_storage_path)
        or not exists(select 1 from storage.objects o where o.bucket_id='wing-submissions' and o.name=s.thumbnail_storage_path))
    order by s.created_at,s.id limit p_limit offset p_offset
  ) c;
  return result;
end;
$$;

-- A bounded explicit allowlist is required even in dry run. An approved photo
-- is never picked up as an incidental side effect of the ordinary backlog.
create function public.request_wing_photo_derivatives(
  p_submission_ids uuid[], p_dry_run boolean default true,
  p_retry_failed boolean default false, p_correlation_id uuid default gen_random_uuid()
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,storage as $$
declare target uuid; s public.wing_media_submissions%rowtype; j public.wing_photo_derivative_jobs%rowtype;
  reason text; result jsonb:='[]'::jsonb; state text;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
  if p_submission_ids is null or cardinality(p_submission_ids) not between 1 and 100
    or array_position(p_submission_ids,null) is not null
    or p_correlation_id is null or p_dry_run is null or p_retry_failed is null then raise exception 'invalid_derivative_request'; end if;
  for target in select distinct unnest(p_submission_ids) order by 1 loop
    select * into s from public.wing_media_submissions where id=target for update;
    reason:=case when not found then 'submission_missing' else public.wing_photo_processing_blocker(target) end;
    if reason is null and s.processed_storage_path='processed/'||s.id::text||'/primary'
      and s.thumbnail_storage_path='thumbnails/'||s.id::text||'/preview'
      and exists(select 1 from storage.objects o where o.bucket_id='wing-submissions' and o.name=s.processed_storage_path)
      and exists(select 1 from storage.objects o where o.bucket_id='wing-submissions' and o.name=s.thumbnail_storage_path) then reason:='already_ready'; end if;
    select * into j from public.wing_photo_derivative_jobs where submission_id=target for update;
    state:=coalesce(reason,'eligible');
    if reason is null and not p_dry_run then
      if j.id is null then
        insert into public.wing_photo_derivative_jobs(submission_id,purpose,correlation_id)
          values(target,case when s.status='approved' then 'recovery' else 'upload' end,p_correlation_id) returning * into j;
        state:='queued';
      elsif j.status in ('dead','cancelled','succeeded') and p_retry_failed and j.attempt_count<32 then
        update public.wing_photo_derivative_jobs set status='pending',available_at=now(),
          max_attempts=least(32,greatest(max_attempts,attempt_count+4)),claim_token=null,claimed_by=null,lease_expires_at=null,
          last_error_code=null,correlation_id=p_correlation_id,updated_at=now() where id=j.id returning * into j;
        state:='requeued';
      else state:=j.status; end if;
    elsif reason is null and j.id is not null then state:=j.status; end if;
    if not p_dry_run then
      insert into public.wing_photo_derivative_receipts(submission_id,job_id,attempt_number,event,error_code,correlation_id)
        values(target,j.id,coalesce(j.attempt_count,0),'request_'||state,reason,p_correlation_id);
    end if;
    result:=result||jsonb_build_array(jsonb_build_object('submission_id',target,'outcome',state,'blocker',reason,'job_id',j.id));
  end loop;
  return result;
end;
$$;

create function public.enqueue_wing_photo_upload_derivatives() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if new.media_type='photo' and new.status='in_review' then
    insert into public.wing_photo_derivative_jobs(submission_id,purpose,correlation_id)
      values(new.id,'upload',new.correlation_id) on conflict(submission_id) do nothing;
    insert into public.wing_photo_derivative_receipts(submission_id,event,correlation_id)
      values(new.id,'upload_queued',new.correlation_id);
  end if;
  return new;
end;
$$;
create trigger wing_photo_upload_derivatives after insert on public.wing_media_submissions
  for each row execute function public.enqueue_wing_photo_upload_derivatives();
drop trigger if exists enqueue_wing_processing_after_submission on public.wing_media_submissions;

create function public.guard_legacy_wing_photo_job() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if new.job_kind='photo_process' and (tg_op='INSERT' or (new.status in ('pending','claimed','retry')
    and exists(select 1 from public.wing_photo_derivative_jobs j where j.submission_id=new.submission_id))) then
    raise exception 'photo_uses_derivative_queue';
  end if;
  return new;
end;
$$;
create trigger wing_legacy_photo_job_guard before insert or update on public.wing_processing_jobs
  for each row execute function public.guard_legacy_wing_photo_job();

-- Moderators keep the canonical review RPC. New approvals must be backed by
-- successfully settled real derivatives; existing approvals are never reset.
create function public.guard_wing_photo_approval() returns trigger
language plpgsql security definer set search_path=pg_catalog,public,storage as $$
begin
  if new.media_type='photo' and new.status='approved' and old.status is distinct from 'approved' then
    if public.wing_photo_processing_blocker(new.id) is not null
      or not (exists(select 1 from public.wing_photo_derivative_jobs j where j.submission_id=new.id and j.status='succeeded')
        or exists(select 1 from public.wing_processing_jobs j where j.submission_id=new.id and j.job_kind='photo_process' and j.status='succeeded'))
      or new.processed_storage_path is distinct from 'processed/'||new.id::text||'/primary'
      or new.thumbnail_storage_path is distinct from 'thumbnails/'||new.id::text||'/preview'
      or not exists(select 1 from storage.objects o where o.bucket_id='wing-submissions' and o.name=new.processed_storage_path)
      or not exists(select 1 from storage.objects o where o.bucket_id='wing-submissions' and o.name=new.thumbnail_storage_path)
    then raise exception 'processed_photo_required_for_approval'; end if;
  end if;
  return new;
end;
$$;
create trigger wing_photo_approval_guard before update of status on public.wing_media_submissions
  for each row execute function public.guard_wing_photo_approval();

create function public.claim_wing_photo_derivative_job(p_worker text,p_lease_seconds integer default 300,
  p_submission_id uuid default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare j public.wing_photo_derivative_jobs%rowtype; token uuid:=gen_random_uuid();
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
  if char_length(coalesce(p_worker,'')) not between 3 and 120 or p_lease_seconds not between 30 and 900 then raise exception 'invalid_worker_lease'; end if;
  -- Expired lease receipts survive crashes. SKIP LOCKED keeps concurrent workers independent.
  for j in select * from public.wing_photo_derivative_jobs where status='claimed' and lease_expires_at<=now()
    and (p_submission_id is null or submission_id=p_submission_id) for update skip locked loop
    insert into public.wing_photo_derivative_receipts(submission_id,job_id,attempt_number,event,error_code,correlation_id)
      values(j.submission_id,j.id,j.attempt_count,'lease_expired','STALE_LEASE',j.correlation_id);
    update public.wing_photo_derivative_jobs set status=case when attempt_count>=max_attempts then 'dead' else 'retry' end,
      claim_token=null,claimed_by=null,lease_expires_at=null,available_at=now(),last_error_code='STALE_LEASE',updated_at=now() where id=j.id;
  end loop;
  select * into j from public.wing_photo_derivative_jobs where status in ('pending','retry') and available_at<=now()
    and (p_submission_id is null or submission_id=p_submission_id)
    and attempt_count<max_attempts order by available_at,created_at,id for update skip locked limit 1;
  if not found then return null; end if;
  update public.wing_photo_derivative_jobs set status='claimed',attempt_count=attempt_count+1,
    claim_token=token,claimed_by=p_worker,lease_expires_at=now()+make_interval(secs=>p_lease_seconds),updated_at=now() where id=j.id;
  insert into public.wing_photo_derivative_receipts(submission_id,job_id,attempt_number,event,correlation_id)
    values(j.submission_id,j.id,j.attempt_count+1,'claimed',j.correlation_id);
  return jsonb_build_object('job_id',j.id,'submission_id',j.submission_id,'job_kind','photo_process','claim_token',token);
end;
$$;

-- Also called before each download/upload by the dedicated repository. Late
-- object writes may leave private orphan objects, but cannot attach/publicize them.
create function public.begin_wing_photo_derivative_job(p_job_id uuid,p_claim_token uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare j public.wing_photo_derivative_jobs%rowtype; s public.wing_media_submissions%rowtype; reason text;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
  select * into j from public.wing_photo_derivative_jobs where id=p_job_id;
  select * into s from public.wing_media_submissions where id=j.submission_id for update;
  select * into j from public.wing_photo_derivative_jobs where id=p_job_id for update;
  if j.id is null or j.status<>'claimed' or j.claim_token is distinct from p_claim_token or j.lease_expires_at<=now() then raise exception 'invalid_or_expired_job_claim'; end if;
  reason:=public.wing_photo_processing_blocker(j.submission_id);
  if s.id is null or reason is not null then raise exception 'photo_processing_blocked:%',coalesce(reason,'submission_missing'); end if;
  return jsonb_build_object('submission_id',s.id,'media_type','photo','bucket','wing-submissions',
    'original_path',s.original_storage_path,'processed_path','processed/'||s.id::text||'/primary',
    'thumbnail_path','thumbnails/'||s.id::text||'/preview','correlation_id',j.correlation_id,
    'preserve_approval',s.status='approved');
end;
$$;

create function public.settle_wing_photo_derivative_job(p_job_id uuid,p_claim_token uuid,p_succeeded boolean,p_retryable boolean,
  p_processed_path text default null,p_thumbnail_path text default null,p_perceptual_hash text default null,
  p_error_code text default null,p_error_reason text default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,storage as $$
declare j public.wing_photo_derivative_jobs%rowtype; s public.wing_media_submissions%rowtype;
  reason text; state text; processed text; thumbnail text;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
  if p_succeeded is null or p_retryable is null then raise exception 'invalid_settlement'; end if;
  select * into j from public.wing_photo_derivative_jobs where id=p_job_id;
  select * into s from public.wing_media_submissions where id=j.submission_id for update;
  select * into j from public.wing_photo_derivative_jobs where id=p_job_id for update;
  if j.id is null then raise exception 'job_missing'; end if;
  -- Network retry of a settled result is idempotent, but only for its exact lease.
  if j.status in ('succeeded','dead','retry','cancelled') and j.claim_token=p_claim_token then
    return jsonb_build_object('job_status',j.status,'submission_status',s.status); end if;
  if j.status<>'claimed' or j.claim_token is distinct from p_claim_token or j.lease_expires_at<=now() then raise exception 'invalid_or_expired_job_claim'; end if;
  reason:=coalesce(public.wing_photo_processing_blocker(j.submission_id),case when s.id is null then 'submission_missing' end);
  processed:='processed/'||j.submission_id::text||'/primary'; thumbnail:='thumbnails/'||j.submission_id::text||'/preview';
  if reason is not null then state:='cancelled';
  elsif p_succeeded then
    if p_processed_path is distinct from processed or p_thumbnail_path is distinct from thumbnail then raise exception 'processed_media_path_mismatch'; end if;
    if not exists(select 1 from storage.objects o where o.bucket_id='wing-submissions' and o.name=processed and
        lower(coalesce(o.metadata->>'mimetype',o.metadata->>'contentType',''))='image/jpeg' and (o.metadata->>'size')::bigint>0)
      or not exists(select 1 from storage.objects o where o.bucket_id='wing-submissions' and o.name=thumbnail and
        lower(coalesce(o.metadata->>'mimetype',o.metadata->>'contentType',''))='image/jpeg' and (o.metadata->>'size')::bigint>0)
    then raise exception 'processed_media_not_found'; end if;
    if p_perceptual_hash is not null and char_length(p_perceptual_hash) not between 16 and 256 then raise exception 'invalid_perceptual_hash'; end if;
    update public.wing_media_submissions set processed_storage_path=processed,thumbnail_storage_path=thumbnail,
      perceptual_hash=p_perceptual_hash,updated_at=now() where id=s.id;
    state:='succeeded';
  else state:=case when p_retryable and j.attempt_count<j.max_attempts then 'retry' else 'dead' end; end if;
  update public.wing_photo_derivative_jobs set status=state,lease_expires_at=null,claimed_by=null,
    available_at=case when state='retry' then now()+least(interval '30 minutes',interval '30 seconds'*(2^greatest(j.attempt_count-1,0))) else available_at end,
    last_error_code=case when state='succeeded' then null else coalesce(reason,left(p_error_code,100),'PROCESSING_FAILED') end,updated_at=now() where id=j.id;
  insert into public.wing_photo_derivative_receipts(submission_id,job_id,attempt_number,event,error_code,correlation_id)
    values(j.submission_id,j.id,j.attempt_count,state,case when state='succeeded' then null else coalesce(reason,left(p_error_code,100),'PROCESSING_FAILED') end,j.correlation_id);
  return jsonb_build_object('job_id',j.id,'submission_id',s.id,'job_status',state,'submission_status',s.status);
end;
$$;

-- Legacy workers must not start competing photo jobs or silently recover approvals.
-- Keep the existing video backlog behavior intact.
create or replace function public.enqueue_wing_processing_backlog(p_limit integer default 100)
returns integer language plpgsql security definer set search_path=pg_catalog,public as $$
declare n integer;
begin
  if p_limit not between 1 and 500 then raise exception 'invalid_backfill_limit'; end if;
  with candidates as (
    select s.id,s.media_type,s.correlation_id from public.wing_media_submissions s
    where s.media_type='video' and s.status in ('uploaded','processing','in_review','approved') and s.processed_storage_path is null
      and not exists(select 1 from public.wing_processing_jobs j where j.submission_id=s.id
        and j.job_kind='video_process' and j.status in ('pending','claimed','retry','succeeded'))
    order by s.created_at,s.id for update skip locked limit p_limit
  ) insert into public.wing_processing_jobs(submission_id,job_kind,generation,status,idempotency_key,correlation_id)
    select c.id,'video_process',coalesce((select max(j.generation)+1 from public.wing_processing_jobs j
      where j.submission_id=c.id and j.job_kind='video_process'),1),'pending','process-review:'||c.id::text||':'||md5(now()::text),c.correlation_id from candidates c;
  get diagnostics n=row_count; return n;
end;
$$;

-- Deny public execution by default for every new helper and privileged RPC.
revoke all on function public.wing_photo_receipt_append_only(),public.wing_photo_processing_blocker(uuid),
  public.list_wing_photo_derivative_candidates(integer,integer),
  public.request_wing_photo_derivatives(uuid[],boolean,boolean,uuid),public.enqueue_wing_photo_upload_derivatives(),
  public.guard_wing_photo_approval(),public.guard_legacy_wing_photo_job(),public.claim_wing_photo_derivative_job(text,integer,uuid),
  public.begin_wing_photo_derivative_job(uuid,uuid),
  public.settle_wing_photo_derivative_job(uuid,uuid,boolean,boolean,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.wing_photo_processing_blocker(uuid),public.request_wing_photo_derivatives(uuid[],boolean,boolean,uuid),
  public.list_wing_photo_derivative_candidates(integer,integer),
  public.claim_wing_photo_derivative_job(text,integer,uuid),public.begin_wing_photo_derivative_job(uuid,uuid),
  public.settle_wing_photo_derivative_job(uuid,uuid,boolean,boolean,text,text,text,text,text) to service_role;
commit;
