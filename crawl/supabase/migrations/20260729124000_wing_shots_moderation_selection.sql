-- Wing Shots moderation, worker leasing, admin review, and nightly selection.
-- AI is advisory. Human approval remains authoritative.

begin;

create table public.wing_moderation_config (
  singleton boolean primary key default true check (singleton),
  schema_version integer not null default 1 check (schema_version > 0),
  minimum_wing_confidence numeric(5,4) not null default 0.6500
    check (minimum_wing_confidence between 0 and 1),
  clear_reject_wing_confidence numeric(5,4) not null default 0.1500
    check (clear_reject_wing_confidence between 0 and 1),
  maximum_spam_probability numeric(5,4) not null default 0.7000
    check (maximum_spam_probability between 0 and 1),
  maximum_duplicate_probability numeric(5,4) not null default 0.8500
    check (maximum_duplicate_probability between 0 and 1),
  daily_upload_limit integer not null default 5 check (daily_upload_limit between 1 and 20),
  hourly_upload_limit integer not null default 3 check (hourly_upload_limit between 1 and 10),
  nightly_enabled boolean not null default false,
  publishing_dry_run boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint wing_moderation_threshold_order check (
    clear_reject_wing_confidence < minimum_wing_confidence
  )
);

insert into public.wing_moderation_config(singleton) values (true);

create table public.wing_user_moderation_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'active'
    check (status in ('active', 'limited', 'suspended')),
  limit_multiplier numeric(4,2) not null default 1
    check (limit_multiplier between 0 and 1),
  reason_category text,
  expires_at timestamptz,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint wing_user_moderation_state_reason check (
    status = 'active' or reason_category is not null
  )
);

create table public.wing_submission_abuse_signals (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.wing_media_submissions(id) on delete restrict,
  signal_type text not null check (signal_type in (
    'exact_duplicate', 'perceptual_duplicate', 'video_fingerprint_match',
    'upload_burst', 'repeat_restaurant', 'reviewer_marked_abuse'
  )),
  severity text not null check (severity in ('low', 'medium', 'high', 'critical')),
  related_submission_id uuid references public.wing_media_submissions(id) on delete set null,
  score numeric(5,4) check (score is null or score between 0 and 1),
  model_version text,
  notes text check (notes is null or char_length(notes) <= 1000),
  idempotency_key text not null unique check (char_length(idempotency_key) between 8 and 200),
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  check (related_submission_id is null or related_submission_id <> submission_id)
);

create index wing_submission_abuse_signals_submission_idx
  on public.wing_submission_abuse_signals(submission_id, severity, created_at desc);

create table public.wing_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.wing_media_submissions(id) on delete restrict,
  nightly_receipt_id uuid not null unique
    references public.wing_nightly_run_receipts(id) on delete restrict,
  status text not null default 'pending'
    check (status in ('pending', 'claimed', 'retry', 'succeeded', 'dead', 'cancelled')),
  instagram_job_id uuid not null unique default gen_random_uuid(),
  facebook_job_id uuid not null unique default gen_random_uuid(),
  instagram_media_path text not null,
  facebook_media_path text not null,
  available_at timestamptz not null default now(),
  claimed_at timestamptz,
  lease_expires_at timestamptz,
  claim_token uuid,
  claimed_by text,
  attempt_count integer not null default 0 check (attempt_count between 0 and 8),
  max_attempts integer not null default 4 check (max_attempts between 1 and 8),
  failure_code text,
  failure_reason text,
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wing_generation_instagram_path check (
    instagram_media_path =
      'publication/' || submission_id::text || '/instagram/' || instagram_job_id::text
  ),
  constraint wing_generation_facebook_path check (
    facebook_media_path =
      'publication/' || submission_id::text || '/facebook/' || facebook_job_id::text
  ),
  constraint wing_generation_claim_shape check (
    (status = 'claimed' and claimed_at is not null and lease_expires_at is not null
      and claim_token is not null and claimed_by is not null)
    or status <> 'claimed'
  )
);

create index wing_generation_jobs_claim_idx
  on public.wing_generation_jobs(available_at, created_at, id)
  where status in ('pending', 'retry');

create or replace function public.wing_enforce_upload_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_config public.wing_moderation_config%rowtype;
  v_state public.wing_user_moderation_state%rowtype;
  v_hour_count integer;
  v_day_count integer;
  v_hour_limit integer;
  v_day_limit integer;
begin
  select * into v_config from public.wing_moderation_config where singleton;
  select * into v_state from public.wing_user_moderation_state where user_id = new.user_id;
  if found and v_state.status = 'suspended'
     and (v_state.expires_at is null or v_state.expires_at > now()) then
    raise exception 'wing_uploads_suspended' using errcode = '42501';
  end if;
  v_hour_limit := greatest(1, floor(v_config.hourly_upload_limit
    * coalesce(v_state.limit_multiplier, 1)))::integer;
  v_day_limit := greatest(1, floor(v_config.daily_upload_limit
    * coalesce(v_state.limit_multiplier, 1)))::integer;
  select count(*) into v_hour_count
  from public.wing_submission_upload_intents
  where user_id = new.user_id and created_at >= now() - interval '1 hour';
  select count(*) into v_day_count
  from public.wing_submission_upload_intents
  where user_id = new.user_id and created_at >= date_trunc('day', now());
  if v_hour_count >= v_hour_limit or v_day_count >= v_day_limit then
    raise exception 'wing_upload_rate_limit_exceeded' using errcode = '42900';
  end if;
  return new;
end;
$$;

create trigger wing_upload_intent_rate_limit
before insert on public.wing_submission_upload_intents
for each row execute function public.wing_enforce_upload_rate_limit();

create or replace function public.record_wing_ai_moderation(
  p_submission_id uuid,
  p_result jsonb,
  p_idempotency_key text,
  p_correlation_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_config public.wing_moderation_config%rowtype;
  v_existing public.wing_moderation_decisions%rowtype;
  v_decision_id uuid;
  v_wing numeric;
  v_spam numeric;
  v_duplicate numeric;
  v_quality numeric;
  v_recommendation text;
  v_required text[] := array[
    'contains_food','contains_chicken_wings','wing_confidence',
    'nudity_or_sexual_content','graphic_content','weapons','hate_symbols',
    'illegal_activity','intoxication_concern','minors_visible',
    'personal_information_visible','faces_visible','alcohol_dominant',
    'offensive_text','spam_probability','duplicate_probability','quality_score',
    'explanation','model','version','evaluated_at'
  ];
begin
  if p_result is null or jsonb_typeof(p_result) <> 'object'
     or not (p_result ?& v_required) then
    raise exception 'invalid_moderation_contract';
  end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 200
     or p_correlation_id is null then
    raise exception 'moderation_identity_required';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('wing-moderation:' || p_idempotency_key, 0));
  select * into v_existing from public.wing_moderation_decisions
  where idempotency_key = p_idempotency_key;
  if found then return v_existing.id; end if;

  v_wing := (p_result->>'wing_confidence')::numeric;
  v_spam := (p_result->>'spam_probability')::numeric;
  v_duplicate := (p_result->>'duplicate_probability')::numeric;
  v_quality := (p_result->>'quality_score')::numeric;
  if v_wing not between 0 and 1 or v_spam not between 0 and 1
     or v_duplicate not between 0 and 1 or v_quality not between 0 and 100 then
    raise exception 'moderation_score_out_of_range';
  end if;
  if coalesce(p_result->>'model','') = '' or coalesce(p_result->>'version','') = '' then
    raise exception 'moderation_model_version_required';
  end if;
  select * into v_config from public.wing_moderation_config where singleton;
  v_recommendation := case
    when (p_result->>'nudity_or_sexual_content')::boolean
      or (p_result->>'graphic_content')::boolean
      or (p_result->>'hate_symbols')::boolean
      or (p_result->>'personal_information_visible')::boolean
      or v_wing <= v_config.clear_reject_wing_confidence then 'reject'
    when v_wing < v_config.minimum_wing_confidence
      or v_spam >= v_config.maximum_spam_probability
      or v_duplicate >= v_config.maximum_duplicate_probability
      or (p_result->>'minors_visible')::boolean then 'manual_review'
    else 'accept'
  end;

  insert into public.wing_moderation_decisions(
    submission_id, decision_source, recommendation, contains_food,
    contains_chicken_wings, wing_confidence, nudity_or_sexual_content,
    graphic_content, weapons, hate_symbols, illegal_activity,
    intoxication_concern, minors_visible, personal_information_visible,
    faces_visible, alcohol_dominant, offensive_text, spam_probability,
    duplicate_probability, quality_score, explanation, model_name,
    model_version, raw_result, idempotency_key, correlation_id, evaluated_at
  ) values (
    p_submission_id, 'ai', v_recommendation,
    (p_result->>'contains_food')::boolean,
    (p_result->>'contains_chicken_wings')::boolean, v_wing,
    (p_result->>'nudity_or_sexual_content')::boolean,
    (p_result->>'graphic_content')::boolean,
    (p_result->>'weapons')::boolean, (p_result->>'hate_symbols')::boolean,
    (p_result->>'illegal_activity')::boolean,
    (p_result->>'intoxication_concern')::boolean,
    (p_result->>'minors_visible')::boolean,
    (p_result->>'personal_information_visible')::boolean,
    (p_result->>'faces_visible')::boolean,
    (p_result->>'alcohol_dominant')::boolean,
    (p_result->>'offensive_text')::boolean, v_spam, v_duplicate, v_quality,
    left(p_result->>'explanation', 2000), p_result->>'model',
    p_result->>'version', p_result, p_idempotency_key, p_correlation_id,
    (p_result->>'evaluated_at')::timestamptz
  ) returning id into v_decision_id;

  update public.wing_media_submissions
  set moderation_status = case v_recommendation
        when 'accept' then 'likely_acceptable'
        when 'reject' then 'clear_rejection'
        else 'manual_review' end,
      wing_verification_status = case
        when v_wing >= v_config.minimum_wing_confidence then 'likely_wings'
        when v_wing <= v_config.clear_reject_wing_confidence then 'not_wings'
        else 'uncertain' end,
      wing_confidence = v_wing, quality_score = v_quality, updated_at = now()
  where id = p_submission_id;
  return v_decision_id;
end;
$$;

create or replace function public.record_wing_fingerprint(
  p_submission_id uuid, p_media_type text, p_algorithm text,
  p_algorithm_version text, p_fingerprint text,
  p_nearest_submission_id uuid, p_similarity numeric,
  p_idempotency_key text, p_correlation_id uuid
)
returns uuid
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_id uuid; v_group uuid; v_severity text;
begin
  if p_similarity is not null and p_similarity not between 0 and 1 then
    raise exception 'fingerprint_similarity_out_of_range';
  end if;
  select coalesce(f.duplicate_group, gen_random_uuid()) into v_group
  from public.wing_media_fingerprints f
  where f.submission_id = p_nearest_submission_id limit 1;
  v_group := coalesce(v_group, gen_random_uuid());
  insert into public.wing_media_fingerprints(
    submission_id,media_type,algorithm,algorithm_version,fingerprint,
    duplicate_group,nearest_submission_id,similarity
  ) values (
    p_submission_id,p_media_type,p_algorithm,p_algorithm_version,p_fingerprint,
    case when coalesce(p_similarity,0) >= .90 then v_group else null end,
    p_nearest_submission_id,p_similarity
  ) on conflict(submission_id,algorithm,algorithm_version) do update
    set fingerprint=excluded.fingerprint, duplicate_group=excluded.duplicate_group,
        nearest_submission_id=excluded.nearest_submission_id, similarity=excluded.similarity
  returning id into v_id;
  if coalesce(p_similarity,0) >= .90 then
    v_severity := case when p_similarity >= .98 then 'high' else 'medium' end;
    insert into public.wing_submission_abuse_signals(
      submission_id,signal_type,severity,related_submission_id,score,
      model_version,idempotency_key,correlation_id
    ) values (
      p_submission_id,
      case when p_media_type='photo' then 'perceptual_duplicate'
        else 'video_fingerprint_match' end,
      v_severity,p_nearest_submission_id,p_similarity,p_algorithm_version,
      p_idempotency_key,p_correlation_id
    ) on conflict(idempotency_key) do nothing;
    update public.wing_media_submissions set duplicate_group=v_group,
      moderation_status='manual_review',updated_at=now() where id=p_submission_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.claim_wing_processing_job(
  p_worker text, p_lease_seconds integer default 300
)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public
as $$
declare v_job public.wing_processing_jobs%rowtype; v_token uuid:=gen_random_uuid();
begin
  if char_length(coalesce(p_worker,'')) not between 3 and 120
     or p_lease_seconds not between 30 and 900 then raise exception 'invalid_worker_lease'; end if;
  update public.wing_processing_jobs set
    status=case when attempt_count>=max_attempts then 'dead' else 'retry' end,
    available_at=case when attempt_count>=max_attempts then available_at
      else now()+least(interval '30 minutes', interval '30 seconds'*(2^greatest(attempt_count-1,0))) end,
    claim_token=null,claimed_by=null,claimed_at=null,lease_expires_at=null,
    last_error_code='STALE_LEASE',updated_at=now()
  where status='claimed' and lease_expires_at<=now();
  select * into v_job from public.wing_processing_jobs
  where status in ('pending','retry') and available_at<=now() and attempt_count<max_attempts
  order by available_at,created_at,id for update skip locked limit 1;
  if not found then return null; end if;
  update public.wing_processing_jobs set status='claimed',claimed_at=now(),
    lease_expires_at=now()+make_interval(secs=>p_lease_seconds),claim_token=v_token,
    claimed_by=p_worker,attempt_count=attempt_count+1,updated_at=now()
  where id=v_job.id;
  return jsonb_build_object('job_id',v_job.id,'submission_id',v_job.submission_id,
    'job_kind',v_job.job_kind,'claim_token',v_token,
    'lease_expires_at',now()+make_interval(secs=>p_lease_seconds));
end;
$$;

create or replace function public.finish_wing_processing_job(
  p_job_id uuid,p_claim_token uuid,p_succeeded boolean,p_retryable boolean,
  p_error_code text default null,p_error_reason text default null
)
returns text language plpgsql security definer set search_path=pg_catalog,public
as $$
declare v_job public.wing_processing_jobs%rowtype; v_status text;
begin
  select * into v_job from public.wing_processing_jobs where id=p_job_id for update;
  if not found or v_job.status<>'claimed' or v_job.claim_token<>p_claim_token
     or v_job.lease_expires_at<=now() then raise exception 'invalid_or_expired_job_claim'; end if;
  v_status:=case when p_succeeded then 'succeeded'
    when p_retryable and v_job.attempt_count<v_job.max_attempts then 'retry' else 'dead' end;
  update public.wing_processing_jobs set status=v_status,
    available_at=case when v_status='retry' then now()+least(interval '30 minutes',
      interval '30 seconds'*(2^greatest(attempt_count-1,0))) else available_at end,
    completed_at=case when v_status in ('succeeded','dead') then now() else null end,
    last_error_code=p_error_code,last_error_reason=left(p_error_reason,1000),
    claim_token=null,claimed_by=null,claimed_at=null,lease_expires_at=null,updated_at=now()
  where id=p_job_id;
  return v_status;
end;
$$;

create or replace function public.get_wing_admin_queue(p_limit integer default 50)
returns setof jsonb language plpgsql stable security definer set search_path=pg_catalog,public
as $$
begin
  if not (public.wing_has_app_role('wing_reviewer') or public.wing_has_app_role('wing_admin'))
  then raise exception 'wing_reviewer_role_required' using errcode='42501'; end if;
  return query select jsonb_build_object(
    'submission_id',s.id,'user_id',s.user_id,'destination_id',s.destination_id,
    'rating_id',s.rating_id,'media_type',s.media_type,'status',s.status,
    'upload_age_seconds',extract(epoch from now()-s.created_at)::bigint,
    'moderation_status',s.moderation_status,
    'wing_verification_status',s.wing_verification_status,
    'wing_confidence',s.wing_confidence,'quality_score',s.quality_score,
    'duplicate_group',s.duplicate_group,'priority',s.priority,
    'prior_user_features',(select count(*) from public.wing_media_submissions x
      where x.user_id=s.user_id and x.featured_at is not null),
    'recent_restaurant_features',(select count(*) from public.wing_media_submissions x
      where x.destination_id=s.destination_id and x.featured_at>now()-interval '30 days'),
    'latest_flags',(select jsonb_build_object('recommendation',m.recommendation,
      'explanation',m.explanation,'minors_visible',m.minors_visible,
      'personal_information_visible',m.personal_information_visible,
      'faces_visible',m.faces_visible,'offensive_text',m.offensive_text)
      from public.wing_moderation_decisions m where m.submission_id=s.id
      order by m.evaluated_at desc limit 1)
  ) from public.wing_media_submissions s where s.status='in_review'
  order by s.priority desc,s.created_at limit greatest(1,least(coalesce(p_limit,50),100));
end;
$$;

create or replace function public.review_wing_submission(
  p_submission_id uuid,p_action text,p_reason_category text,p_notes text,
  p_idempotency_key text,p_correlation_id uuid
)
returns uuid language plpgsql security definer set search_path=pg_catalog,public
as $$
declare v_actor uuid:=auth.uid(); v_s public.wing_media_submissions%rowtype;
  v_action_id uuid; v_to text; v_sensitive boolean;
begin
  if v_actor is null or not (public.wing_has_app_role('wing_reviewer')
    or public.wing_has_app_role('wing_admin')) then
    raise exception 'wing_reviewer_role_required' using errcode='42501'; end if;
  if p_action not in ('approve','reject','retry_processing','prioritize',
    'remove_priority','withdraw_from_queue','mark_abuse') then raise exception 'invalid_admin_action'; end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 180
     or p_correlation_id is null then raise exception 'admin_action_identity_required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('wing-admin:'||p_idempotency_key,0));
  select id into v_action_id from public.wing_admin_actions
  where idempotency_key='admin:'||p_idempotency_key;
  if found then return v_action_id; end if;
  v_sensitive:=p_action in ('reject','mark_abuse');
  if (v_sensitive or p_action='approve') and
    (nullif(trim(p_reason_category),'') is null or nullif(trim(p_notes),'') is null)
  then raise exception 'review_reason_and_notes_required'; end if;
  select * into v_s from public.wing_media_submissions where id=p_submission_id for update;
  if not found then raise exception 'wing_submission_not_found'; end if;
  if v_s.status<>'in_review' then raise exception 'submission_not_in_review'; end if;
  if p_action='approve' then
    if v_s.status<>'in_review' then raise exception 'submission_not_in_review'; end if;
    if (v_s.moderation_status='clear_rejection' or
        v_s.wing_verification_status in ('not_wings','uncertain') or
        v_s.duplicate_group is not null) and p_reason_category<>'documented_override'
    then raise exception 'sensitive_override_requires_documented_override'; end if;
    v_to:='approved';
    perform public.wing_transition_submission(p_submission_id,v_to,'in_review',
      'reviewer',v_actor,'human_review',p_idempotency_key,p_correlation_id,
      jsonb_build_object('reason_category',p_reason_category,'notes',p_notes));
  elsif p_action='reject' then
    perform public.wing_transition_submission(p_submission_id,'rejected','in_review',
      'reviewer',v_actor,'human_review',p_idempotency_key,p_correlation_id,
      jsonb_build_object('rejection_reason',p_reason_category,'notes',p_notes));
  elsif p_action='retry_processing' then
    perform public.wing_transition_submission(p_submission_id,'processing',v_s.status,
      'reviewer',v_actor,'review_retry',p_idempotency_key,p_correlation_id,'{}');
  elsif p_action='prioritize' then
    update public.wing_media_submissions set priority=least(priority+10,100),updated_at=now()
    where id=p_submission_id;
  elsif p_action='remove_priority' then
    update public.wing_media_submissions set priority=0,updated_at=now() where id=p_submission_id;
  elsif p_action='withdraw_from_queue' then
    perform public.wing_transition_submission(p_submission_id,'withdrawn',v_s.status,
      'reviewer',v_actor,'admin_withdrawal',p_idempotency_key,p_correlation_id,'{}');
  else
    insert into public.wing_submission_abuse_signals(
      submission_id,signal_type,severity,notes,idempotency_key,correlation_id
    ) values(p_submission_id,'reviewer_marked_abuse','high',p_notes,
      'abuse:'||p_idempotency_key,p_correlation_id);
  end if;
  insert into public.wing_admin_actions(
    submission_id,actor_id,action,reason_category,notes,before_state,after_state,
    idempotency_key,request_fingerprint,correlation_id
  ) values(p_submission_id,v_actor,p_action,p_reason_category,p_notes,
    jsonb_build_object('status',v_s.status,'priority',v_s.priority),
    jsonb_build_object('target_status',v_to),
    'admin:'||p_idempotency_key,md5(concat_ws('|',p_submission_id,p_action,p_reason_category,p_notes)),
    p_correlation_id) returning id into v_action_id;
  return v_action_id;
end;
$$;

create or replace function public.run_wing_nightly_selection(
  p_business_date date,p_correlation_id uuid
)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public
as $$
declare v_config public.wing_moderation_config%rowtype; v_existing public.wing_nightly_run_receipts%rowtype;
  v_submission public.wing_media_submissions%rowtype; v_receipt uuid; v_generation uuid;
  v_candidate_count integer; v_score numeric; v_components jsonb;
  v_had_receipt boolean:=false; v_creator_penalty numeric:=0; v_restaurant_penalty numeric:=0;
  v_ig uuid:=gen_random_uuid(); v_fb uuid:=gen_random_uuid();
begin
  if p_business_date is null or p_correlation_id is null then raise exception 'nightly_identity_required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('wing-nightly:'||p_business_date::text,0));
  select * into v_config from public.wing_moderation_config where singleton;
  if not v_config.nightly_enabled then raise exception 'wing_nightly_disabled'; end if;
  select * into v_existing from public.wing_nightly_run_receipts where business_date=p_business_date for update;
  v_had_receipt := found;
  if found and v_existing.status<>'running' then
    return jsonb_build_object('receipt_id',v_existing.id,'status',upper(v_existing.status));
  elsif found and v_existing.started_at>now()-interval '30 minutes' then
    return jsonb_build_object('receipt_id',v_existing.id,'status','ALREADY_RUNNING');
  elsif found then
    update public.wing_nightly_run_receipts set status='failed',completed_at=now(),
      failure_code='STALE_RUN_RECOVERED',failure_reason='Stale running receipt recovered'
    where id=v_existing.id;
  end if;
  select count(*) into v_candidate_count from public.wing_media_submissions s
  where s.status='approved' and s.featured_at is null
    and s.moderation_status in ('likely_acceptable','overridden')
    and s.wing_verification_status in ('likely_wings','overridden')
    and s.processed_storage_path is not null and s.duplicate_group is null
    and not exists(select 1 from public.wing_submission_abuse_signals a
      where a.submission_id=s.id and a.severity in ('high','critical'));
  if v_candidate_count=0 then
    if v_had_receipt then
      update public.wing_nightly_run_receipts set status='skipped_no_approved_content',
        candidate_count=0,selected_submission_id=null,score_components='{}',
        failure_code='SKIPPED_NO_APPROVED_CONTENT',failure_reason=null,
        completed_at=now(),correlation_id=p_correlation_id where id=v_existing.id
        returning id into v_receipt;
    else
      insert into public.wing_nightly_run_receipts(
        business_date,status,candidate_count,dry_run,completed_at,failure_code,correlation_id
      ) values(p_business_date,'skipped_no_approved_content',0,v_config.publishing_dry_run,
        now(),'SKIPPED_NO_APPROVED_CONTENT',p_correlation_id) returning id into v_receipt;
    end if;
    return jsonb_build_object('receipt_id',v_receipt,'status','SKIPPED_NO_APPROVED_CONTENT');
  end if;
  select s.* into v_submission from public.wing_media_submissions s
  where s.status='approved' and s.featured_at is null
    and s.moderation_status in ('likely_acceptable','overridden')
    and s.wing_verification_status in ('likely_wings','overridden')
    and s.processed_storage_path is not null and s.duplicate_group is null
    and not exists(select 1 from public.wing_submission_abuse_signals a
      where a.submission_id=s.id and a.severity in ('high','critical'))
  order by (
    coalesce(s.quality_score,0)*.35 + coalesce(s.wing_confidence,0)*25
    + least(20,extract(epoch from now()-coalesce(s.approved_at,s.created_at))/86400)
    + least(10,s.priority*.1)
    - case when exists(select 1 from public.wing_media_submissions x where x.user_id=s.user_id
        and x.featured_at>now()-interval '30 days') then 15 else 0 end
    - case when exists(select 1 from public.wing_media_submissions x where x.destination_id=s.destination_id
        and x.featured_at>now()-interval '14 days') then 12 else 0 end
  ) desc,coalesce(s.approved_at,s.created_at),s.id limit 1 for update skip locked;
  v_score:=coalesce(v_submission.quality_score,0)*.35+coalesce(v_submission.wing_confidence,0)*25
    +least(20,extract(epoch from now()-coalesce(v_submission.approved_at,v_submission.created_at))/86400)
    +least(10,v_submission.priority*.1)
    -case when exists(select 1 from public.wing_media_submissions x where x.user_id=v_submission.user_id
      and x.featured_at>now()-interval '30 days') then 15 else 0 end
    -case when exists(select 1 from public.wing_media_submissions x where x.destination_id=v_submission.destination_id
      and x.featured_at>now()-interval '14 days') then 12 else 0 end;
  v_creator_penalty:=case when exists(select 1 from public.wing_media_submissions x
    where x.user_id=v_submission.user_id and x.featured_at>now()-interval '30 days')
    then 15 else 0 end;
  v_restaurant_penalty:=case when exists(select 1 from public.wing_media_submissions x
    where x.destination_id=v_submission.destination_id and x.featured_at>now()-interval '14 days')
    then 12 else 0 end;
  v_components:=jsonb_build_object('quality',coalesce(v_submission.quality_score,0)*.35,
    'wing_confidence',coalesce(v_submission.wing_confidence,0)*25,
    'queue_age',least(20,extract(epoch from now()-coalesce(v_submission.approved_at,v_submission.created_at))/86400),
    'manual_priority',least(10,v_submission.priority*.1),
    'creator_diversity_penalty',v_creator_penalty,
    'restaurant_diversity_penalty',v_restaurant_penalty,'total',v_score);
  if v_had_receipt then
    update public.wing_nightly_run_receipts set status='selected',
      selected_submission_id=v_submission.id,selection_score=v_score,
      score_components=v_components,candidate_count=v_candidate_count,
      dry_run=v_config.publishing_dry_run,completed_at=now(),
      failure_code=null,failure_reason=null,correlation_id=p_correlation_id
    where id=v_existing.id returning id into v_receipt;
  else
    insert into public.wing_nightly_run_receipts(
      business_date,status,selected_submission_id,selection_score,score_components,
      candidate_count,dry_run,completed_at,correlation_id
    ) values(p_business_date,'selected',v_submission.id,v_score,v_components,
      v_candidate_count,v_config.publishing_dry_run,now(),p_correlation_id) returning id into v_receipt;
  end if;
  perform public.wing_transition_submission(v_submission.id,'generation_pending','approved',
    'scheduler',null,'nightly_selection','nightly:'||p_business_date::text,
    p_correlation_id,v_components);
  insert into public.wing_generation_jobs(
    submission_id,nightly_receipt_id,instagram_job_id,facebook_job_id,
    instagram_media_path,facebook_media_path,correlation_id
  ) values(v_submission.id,v_receipt,v_ig,v_fb,
    'publication/'||v_submission.id||'/instagram/'||v_ig,
    'publication/'||v_submission.id||'/facebook/'||v_fb,p_correlation_id)
  returning id into v_generation;
  return jsonb_build_object('receipt_id',v_receipt,'status','SELECTED',
    'submission_id',v_submission.id,'generation_job_id',v_generation,'score_components',v_components);
end;
$$;

create or replace function public.claim_wing_generation_job(
  p_worker text,p_lease_seconds integer default 600
)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public
as $$
declare v_job public.wing_generation_jobs%rowtype; v_token uuid:=gen_random_uuid();
begin
  if char_length(coalesce(p_worker,'')) not between 3 and 120
    or p_lease_seconds not between 60 and 1200 then raise exception 'invalid_worker_lease'; end if;
  update public.wing_generation_jobs set
    status=case when attempt_count>=max_attempts then 'dead' else 'retry' end,
    available_at=case when attempt_count>=max_attempts then available_at
      else now()+least(interval '30 minutes',interval '30 seconds'*(2^greatest(attempt_count-1,0))) end,
    claim_token=null,claimed_by=null,claimed_at=null,lease_expires_at=null,
    failure_code='STALE_LEASE',updated_at=now()
  where status='claimed' and lease_expires_at<=now();
  select * into v_job from public.wing_generation_jobs
  where status in ('pending','retry') and available_at<=now() and attempt_count<max_attempts
  order by available_at,created_at,id for update skip locked limit 1;
  if not found then return null; end if;
  update public.wing_generation_jobs set status='claimed',claimed_at=now(),
    lease_expires_at=now()+make_interval(secs=>p_lease_seconds),claim_token=v_token,
    claimed_by=p_worker,attempt_count=attempt_count+1,updated_at=now() where id=v_job.id;
  return jsonb_build_object('job_id',v_job.id,'submission_id',v_job.submission_id,
    'claim_token',v_token,'instagram_media_path',v_job.instagram_media_path,
    'facebook_media_path',v_job.facebook_media_path,
    'lease_expires_at',now()+make_interval(secs=>p_lease_seconds));
end;
$$;

create or replace function public.complete_wing_generation(
  p_generation_job_id uuid,p_claim_token uuid,
  p_instagram_post_type text,p_instagram_caption text,
  p_facebook_post_type text,p_facebook_caption text,p_metadata jsonb
)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,storage
as $$
declare v_job public.wing_generation_jobs%rowtype;
begin
  select * into v_job from public.wing_generation_jobs where id=p_generation_job_id for update;
  if not found or v_job.status<>'claimed' or v_job.claim_token<>p_claim_token
    or v_job.lease_expires_at<=now() then raise exception 'generation_job_unavailable'; end if;
  if not exists(select 1 from storage.objects where bucket_id='wing-submissions'
    and name=v_job.instagram_media_path)
    or not exists(select 1 from storage.objects where bucket_id='wing-submissions'
    and name=v_job.facebook_media_path) then raise exception 'generated_assets_missing'; end if;
  insert into public.social_content_jobs(id,submission_id,platform,post_type,
    generated_media_path,generated_caption,generated_metadata,status,dry_run,
    idempotency_key,correlation_id)
  select v_job.instagram_job_id,v_job.submission_id,'instagram',p_instagram_post_type,
    v_job.instagram_media_path,p_instagram_caption,p_metadata,'ready',true,
    'social:'||v_job.id||':instagram',v_job.correlation_id from public.wing_moderation_config c
  union all
  select v_job.facebook_job_id,v_job.submission_id,'facebook',p_facebook_post_type,
    v_job.facebook_media_path,p_facebook_caption,p_metadata,'ready',true,
    'social:'||v_job.id||':facebook',v_job.correlation_id from public.wing_moderation_config c;
  update public.wing_generation_jobs set status='succeeded',updated_at=now() where id=v_job.id;
  perform public.wing_transition_submission(v_job.submission_id,'ready_to_post','generation_pending',
    'worker',null,'generation_completed','generation:'||v_job.id,v_job.correlation_id,'{}');
  return jsonb_build_object('instagram_job_id',v_job.instagram_job_id,
    'facebook_job_id',v_job.facebook_job_id);
end;
$$;

alter table public.wing_moderation_config enable row level security;
alter table public.wing_user_moderation_state enable row level security;
alter table public.wing_submission_abuse_signals enable row level security;
alter table public.wing_generation_jobs enable row level security;
revoke all on public.wing_moderation_config,public.wing_user_moderation_state,
  public.wing_submission_abuse_signals,public.wing_generation_jobs
  from public,anon,authenticated;
grant all on public.wing_moderation_config,public.wing_user_moderation_state,
  public.wing_submission_abuse_signals,public.wing_generation_jobs to service_role;

revoke all on function public.wing_enforce_upload_rate_limit(),
  public.record_wing_ai_moderation(uuid,jsonb,text,uuid),
  public.record_wing_fingerprint(uuid,text,text,text,text,uuid,numeric,text,uuid),
  public.claim_wing_processing_job(text,integer),
  public.finish_wing_processing_job(uuid,uuid,boolean,boolean,text,text),
  public.get_wing_admin_queue(integer),
  public.review_wing_submission(uuid,text,text,text,text,uuid),
  public.run_wing_nightly_selection(date,uuid),
  public.claim_wing_generation_job(text,integer),
  public.complete_wing_generation(uuid,uuid,text,text,text,text,jsonb)
from public,anon,authenticated;
grant execute on function public.get_wing_admin_queue(integer),
  public.review_wing_submission(uuid,text,text,text,text,uuid) to authenticated;
grant execute on function public.record_wing_ai_moderation(uuid,jsonb,text,uuid),
  public.record_wing_fingerprint(uuid,text,text,text,text,uuid,numeric,text,uuid),
  public.claim_wing_processing_job(text,integer),
  public.finish_wing_processing_job(uuid,uuid,boolean,boolean,text,text),
  public.run_wing_nightly_selection(date,uuid),
  public.claim_wing_generation_job(text,integer),
  public.complete_wing_generation(uuid,uuid,text,text,text,text,jsonb) to service_role;

commit;

-- Rollback: set nightly_enabled=false first, revoke RPC execution, allow active
-- leases to expire, then forward-fix. Preserve moderation/admin/run receipts.
