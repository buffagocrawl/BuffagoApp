-- Wing Shots core persistence model.
-- This migration intentionally contains schema objects only. Authorization,
-- transition RPCs, worker leases, rewards, and user-facing read boundaries are
-- added by follow-on migrations.

begin;

create table if not exists public.app_user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null
    check (role in ('wing_reviewer', 'wing_admin', 'wing_publisher')),
  active boolean not null default true,
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  revoked_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  reason text check (reason is null or char_length(reason) between 3 and 500),
  correlation_id uuid not null default gen_random_uuid(),
  primary key (user_id, role),
  constraint app_user_roles_revocation_shape check (
    (active and revoked_at is null and revoked_by is null)
    or (not active and revoked_at is not null)
  )
);

create index if not exists app_user_roles_active_role_idx
  on public.app_user_roles (role, user_id)
  where active;

create table if not exists public.wing_media_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  owner_pseudonym_id uuid not null default gen_random_uuid(),
  owner_deleted_at timestamptz,
  rating_id uuid not null references public.destination_ratings(id) on delete restrict,
  destination_id uuid not null references public.destinations(id) on delete restrict,
  media_type text not null check (media_type in ('photo', 'video')),
  original_storage_path text not null unique
    check (original_storage_path ~ '^originals/[0-9a-f-]{36}/[0-9a-f-]{36}/source$'),
  processed_storage_path text unique
    check (
      processed_storage_path is null
      or processed_storage_path ~ '^processed/[0-9a-f-]{36}/primary$'
    ),
  thumbnail_storage_path text unique
    check (
      thumbnail_storage_path is null
      or thumbnail_storage_path ~ '^thumbnails/[0-9a-f-]{36}/preview$'
    ),
  status text not null default 'uploaded' check (status in (
    'uploaded', 'processing', 'in_review', 'approved', 'rejected',
    'generation_pending', 'ready_to_post', 'scheduled', 'posting',
    'posted', 'failed', 'withdrawn'
  )),
  moderation_status text not null default 'pending' check (moderation_status in (
    'pending', 'evaluating', 'likely_acceptable', 'manual_review',
    'clear_rejection', 'overridden', 'failed'
  )),
  wing_verification_status text not null default 'pending' check (
    wing_verification_status in (
      'pending', 'likely_wings', 'uncertain', 'not_wings', 'overridden', 'failed'
    )
  ),
  wing_confidence numeric(5,4)
    check (wing_confidence is null or wing_confidence between 0 and 1),
  quality_score numeric(6,3)
    check (quality_score is null or quality_score between 0 and 100),
  content_score numeric(8,3),
  duplicate_group uuid,
  perceptual_hash text
    check (perceptual_hash is null or char_length(perceptual_hash) between 16 and 256),
  consent_version text not null
    check (char_length(consent_version) between 1 and 40),
  consented_at timestamptz not null,
  attribution_preference text not null check (
    attribution_preference in ('username', 'display_name', 'anonymous')
  ),
  user_caption text check (user_caption is null or char_length(user_caption) <= 500),
  reviewer_notes text check (reviewer_notes is null or char_length(reviewer_notes) <= 2000),
  priority integer not null default 0 check (priority between 0 and 100),
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  rejected_at timestamptz,
  rejection_reason text,
  featured_at timestamptz,
  withdrawn_at timestamptz,
  original_retain_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  correlation_id uuid not null default gen_random_uuid(),
  constraint wing_media_submissions_one_per_rating unique (rating_id),
  constraint wing_media_submissions_path_ownership check (
    split_part(original_storage_path, '/', 3) = id::text
    and (
      (user_id is not null
        and split_part(original_storage_path, '/', 2) = user_id::text)
      or (user_id is null and owner_deleted_at is not null)
    )
  ),
  constraint wing_media_submissions_owner_deletion_shape check (
    (user_id is not null and owner_deleted_at is null)
    or (user_id is null and owner_deleted_at is not null)
  ),
  constraint wing_media_submissions_processed_path_identity check (
    processed_storage_path is null
    or split_part(processed_storage_path, '/', 2) = id::text
  ),
  constraint wing_media_submissions_thumbnail_path_identity check (
    thumbnail_storage_path is null
    or split_part(thumbnail_storage_path, '/', 2) = id::text
  ),
  constraint wing_media_submissions_approval_shape check (
    (approved_at is null and approved_by is null)
    or (approved_at is not null and approved_by is not null)
  ),
  constraint wing_media_submissions_rejection_shape check (
    (rejected_at is null and rejection_reason is null)
    or (rejected_at is not null and rejection_reason is not null)
  ),
  constraint wing_media_submissions_terminal_shape check (
    (status <> 'rejected' or rejected_at is not null)
    and (status <> 'posted' or featured_at is not null)
    and (status <> 'withdrawn' or withdrawn_at is not null)
  )
);

create index if not exists wing_media_submissions_owner_time_idx
  on public.wing_media_submissions (user_id, created_at desc);

create index if not exists wing_media_submissions_review_queue_idx
  on public.wing_media_submissions (
    priority desc, quality_score desc, created_at, id
  )
  where status = 'in_review';

create index if not exists wing_media_submissions_approved_queue_idx
  on public.wing_media_submissions (created_at, id)
  where status = 'approved' and featured_at is null;

create index if not exists wing_media_submissions_destination_time_idx
  on public.wing_media_submissions (destination_id, featured_at desc)
  where featured_at is not null;

create table if not exists public.wing_submission_state_transitions (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null
    references public.wing_media_submissions(id) on delete restrict,
  from_status text check (from_status is null or from_status in (
    'uploaded', 'processing', 'in_review', 'approved', 'rejected',
    'generation_pending', 'ready_to_post', 'scheduled', 'posting',
    'posted', 'failed', 'withdrawn'
  )),
  to_status text not null check (to_status in (
    'uploaded', 'processing', 'in_review', 'approved', 'rejected',
    'generation_pending', 'ready_to_post', 'scheduled', 'posting',
    'posted', 'failed', 'withdrawn'
  )),
  actor_type text not null check (
    actor_type in ('user', 'reviewer', 'worker', 'scheduler', 'publisher', 'system')
  ),
  actor_id uuid references auth.users(id) on delete set null,
  trigger_source text not null check (char_length(trigger_source) between 2 and 100),
  idempotency_key text not null unique
    check (char_length(idempotency_key) between 8 and 200),
  request_fingerprint text not null check (char_length(request_fingerprint) = 32),
  correlation_id uuid not null,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz not null default now(),
  constraint wing_submission_state_transition_changes_state check (
    from_status is null or from_status <> to_status
  )
);

create index if not exists wing_submission_transitions_submission_time_idx
  on public.wing_submission_state_transitions (submission_id, occurred_at, id);

create table if not exists public.wing_moderation_decisions (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null
    references public.wing_media_submissions(id) on delete restrict,
  decision_source text not null check (
    decision_source in ('ai', 'human', 'policy', 'system')
  ),
  recommendation text not null check (
    recommendation in ('accept', 'manual_review', 'reject', 'error')
  ),
  contains_food boolean,
  contains_chicken_wings boolean,
  wing_confidence numeric(5,4)
    check (wing_confidence is null or wing_confidence between 0 and 1),
  nudity_or_sexual_content boolean,
  graphic_content boolean,
  weapons boolean,
  hate_symbols boolean,
  illegal_activity boolean,
  intoxication_concern boolean,
  minors_visible boolean,
  personal_information_visible boolean,
  faces_visible boolean,
  alcohol_dominant boolean,
  offensive_text boolean,
  spam_probability numeric(5,4)
    check (spam_probability is null or spam_probability between 0 and 1),
  duplicate_probability numeric(5,4)
    check (duplicate_probability is null or duplicate_probability between 0 and 1),
  quality_score numeric(6,3)
    check (quality_score is null or quality_score between 0 and 100),
  explanation text check (explanation is null or char_length(explanation) <= 2000),
  model_provider text,
  model_name text,
  model_version text,
  schema_version integer not null default 1 check (schema_version > 0),
  reviewer_id uuid references auth.users(id) on delete set null,
  override_reason text,
  raw_result jsonb not null default '{}'::jsonb
    check (jsonb_typeof(raw_result) = 'object'),
  idempotency_key text not null unique
    check (char_length(idempotency_key) between 8 and 200),
  correlation_id uuid not null,
  evaluated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint wing_moderation_human_reviewer_shape check (
    decision_source <> 'human' or reviewer_id is not null
  ),
  constraint wing_moderation_override_reason_shape check (
    override_reason is null or reviewer_id is not null
  )
);

create index if not exists wing_moderation_submission_time_idx
  on public.wing_moderation_decisions (submission_id, evaluated_at desc, id);

create table if not exists public.wing_processing_jobs (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null
    references public.wing_media_submissions(id) on delete restrict,
  job_kind text not null check (
    job_kind in ('validate', 'photo_process', 'video_process', 'moderate', 'fingerprint')
  ),
  generation integer not null default 1 check (generation > 0),
  status text not null default 'pending' check (
    status in ('pending', 'claimed', 'retry', 'succeeded', 'dead', 'cancelled')
  ),
  available_at timestamptz not null default now(),
  claimed_at timestamptz,
  lease_expires_at timestamptz,
  claim_token uuid,
  claimed_by text,
  attempt_count integer not null default 0 check (attempt_count between 0 and 12),
  max_attempts integer not null default 5 check (max_attempts between 1 and 12),
  last_error_code text,
  last_error_reason text,
  completed_at timestamptz,
  idempotency_key text not null unique
    check (char_length(idempotency_key) between 8 and 200),
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (submission_id, job_kind, generation),
  constraint wing_processing_job_claim_shape check (
    (status = 'claimed' and claimed_at is not null and lease_expires_at is not null
      and claim_token is not null and claimed_by is not null)
    or status <> 'claimed'
  ),
  constraint wing_processing_job_lease_order check (
    lease_expires_at is null or claimed_at is null or lease_expires_at > claimed_at
  )
);

create index if not exists wing_processing_jobs_claim_idx
  on public.wing_processing_jobs (available_at, created_at, id)
  where status in ('pending', 'retry');

create index if not exists wing_processing_jobs_stale_lease_idx
  on public.wing_processing_jobs (lease_expires_at, id)
  where status = 'claimed';

create table if not exists public.wing_media_fingerprints (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null
    references public.wing_media_submissions(id) on delete restrict,
  media_type text not null check (media_type in ('photo', 'video')),
  algorithm text not null check (char_length(algorithm) between 2 and 80),
  algorithm_version text not null check (char_length(algorithm_version) between 1 and 40),
  fingerprint text not null check (char_length(fingerprint) between 16 and 512),
  duplicate_group uuid,
  nearest_submission_id uuid
    references public.wing_media_submissions(id) on delete set null,
  similarity numeric(5,4) check (similarity is null or similarity between 0 and 1),
  created_at timestamptz not null default now(),
  unique (submission_id, algorithm, algorithm_version),
  constraint wing_media_fingerprints_not_self_nearest check (
    nearest_submission_id is null or nearest_submission_id <> submission_id
  )
);

create index if not exists wing_media_fingerprints_lookup_idx
  on public.wing_media_fingerprints (
    media_type, algorithm, algorithm_version, fingerprint
  );

create index if not exists wing_media_fingerprints_duplicate_group_idx
  on public.wing_media_fingerprints (duplicate_group, submission_id)
  where duplicate_group is not null;

create table if not exists public.social_content_jobs (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null
    references public.wing_media_submissions(id) on delete restrict,
  platform text not null check (platform in ('instagram', 'facebook')),
  post_type text not null check (post_type in ('photo', 'reel', 'video')),
  generated_media_path text not null check (
    generated_media_path ~ '^publication/[0-9a-f-]{36}/(instagram|facebook)/[0-9a-f-]{36}$'
  ),
  generated_caption text not null check (char_length(generated_caption) between 1 and 2200),
  generated_alt_text text check (
    generated_alt_text is null or char_length(generated_alt_text) <= 1000
  ),
  generated_metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(generated_metadata) = 'object'),
  status text not null default 'ready' check (status in (
    'ready', 'scheduled', 'claimed', 'posting', 'posted', 'retry',
    'failed', 'cancelled', 'dry_run_succeeded'
  )),
  dry_run boolean not null default true,
  human_approved_at timestamptz,
  human_approved_by uuid references auth.users(id) on delete set null,
  scheduled_for timestamptz,
  claimed_at timestamptz,
  lease_expires_at timestamptz,
  claim_token uuid,
  claimed_by text,
  attempt_count integer not null default 0 check (attempt_count between 0 and 12),
  max_attempts integer not null default 5 check (max_attempts between 1 and 12),
  external_post_id text,
  external_permalink text,
  posted_at timestamptz,
  failure_code text,
  failure_reason text,
  idempotency_key text not null unique
    check (char_length(idempotency_key) between 8 and 200),
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (submission_id, platform),
  constraint social_content_jobs_path_identity check (
    split_part(generated_media_path, '/', 2) = submission_id::text
    and split_part(generated_media_path, '/', 3) = platform
    and split_part(generated_media_path, '/', 4) = id::text
  ),
  constraint social_content_jobs_approval_shape check (
    (human_approved_at is null and human_approved_by is null)
    or (human_approved_at is not null and human_approved_by is not null)
  ),
  constraint social_content_jobs_real_post_requires_approval check (
    dry_run or human_approved_at is not null
  ),
  constraint social_content_jobs_claim_shape check (
    (status in ('claimed', 'posting') and claimed_at is not null
      and lease_expires_at is not null and claim_token is not null
      and claimed_by is not null)
    or status not in ('claimed', 'posting')
  ),
  constraint social_content_jobs_posted_shape check (
    status <> 'posted'
    or (not dry_run and external_post_id is not null and posted_at is not null)
  )
);

create index if not exists social_content_jobs_claim_idx
  on public.social_content_jobs (scheduled_for, created_at, id)
  where status in ('ready', 'scheduled', 'retry');

create index if not exists social_content_jobs_stale_lease_idx
  on public.social_content_jobs (lease_expires_at, id)
  where status in ('claimed', 'posting');

create table if not exists public.social_publication_attempts (
  id uuid primary key default gen_random_uuid(),
  social_job_id uuid not null
    references public.social_content_jobs(id) on delete restrict,
  attempt_number integer not null check (attempt_number between 1 and 12),
  claim_token uuid not null,
  provider_request_id text,
  outcome text not null check (
    outcome in (
      'started', 'succeeded', 'retryable_failure', 'permanent_failure',
      'rate_limited', 'configuration_error', 'dry_run_succeeded'
    )
  ),
  external_post_id text,
  external_permalink text,
  http_status integer check (http_status is null or http_status between 100 and 599),
  failure_code text,
  failure_reason text,
  response_metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(response_metadata) = 'object'),
  idempotency_key text not null unique
    check (char_length(idempotency_key) between 8 and 200),
  correlation_id uuid not null,
  attempted_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (social_job_id, attempt_number),
  constraint social_publication_attempt_success_shape check (
    outcome <> 'succeeded' or external_post_id is not null
  )
);

create index if not exists social_publication_attempts_job_time_idx
  on public.social_publication_attempts (social_job_id, attempted_at, id);

create table if not exists public.wing_admin_actions (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid references public.wing_media_submissions(id) on delete restrict,
  social_job_id uuid references public.social_content_jobs(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (action in (
    'reveal_sensitive_preview', 'approve', 'reject', 'override_moderation',
    'override_wing_verification', 'retry_processing', 'prioritize',
    'remove_priority', 'generate_preview', 'approve_generated_post',
    'schedule', 'publish_now', 'withdraw_from_queue', 'mark_abuse'
  )),
  reason_category text,
  notes text check (notes is null or char_length(notes) <= 2000),
  before_state jsonb not null default '{}'::jsonb
    check (jsonb_typeof(before_state) = 'object'),
  after_state jsonb not null default '{}'::jsonb
    check (jsonb_typeof(after_state) = 'object'),
  idempotency_key text not null unique
    check (char_length(idempotency_key) between 8 and 200),
  request_fingerprint text not null check (char_length(request_fingerprint) = 32),
  correlation_id uuid not null,
  occurred_at timestamptz not null default now(),
  constraint wing_admin_actions_target_shape check (
    submission_id is not null or social_job_id is not null
  ),
  constraint wing_admin_actions_sensitive_notes check (
    action not in ('reject', 'override_moderation', 'override_wing_verification', 'mark_abuse')
    or (reason_category is not null and notes is not null)
  )
);

create index if not exists wing_admin_actions_submission_time_idx
  on public.wing_admin_actions (submission_id, occurred_at, id)
  where submission_id is not null;

create table if not exists public.wing_nightly_run_receipts (
  id uuid primary key default gen_random_uuid(),
  business_date date not null,
  timezone text not null default 'America/New_York'
    check (timezone = 'America/New_York'),
  status text not null check (status in (
    'running', 'selected', 'skipped_no_approved_content',
    'completed', 'partially_completed', 'failed'
  )),
  selected_submission_id uuid
    references public.wing_media_submissions(id) on delete restrict,
  selection_score numeric(8,3),
  score_components jsonb not null default '{}'::jsonb
    check (jsonb_typeof(score_components) = 'object'),
  candidate_count integer not null default 0 check (candidate_count >= 0),
  dry_run boolean not null default true,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  failure_code text,
  failure_reason text,
  correlation_id uuid not null unique,
  created_at timestamptz not null default now(),
  unique (business_date),
  constraint wing_nightly_run_receipts_skip_shape check (
    status <> 'skipped_no_approved_content'
    or (
      selected_submission_id is null
      and candidate_count = 0
      and score_components = '{}'::jsonb
    )
  ),
  constraint wing_nightly_run_receipts_selection_shape check (
    status not in ('selected', 'completed', 'partially_completed')
    or selected_submission_id is not null
  )
);

create index if not exists wing_nightly_run_receipts_status_date_idx
  on public.wing_nightly_run_receipts (status, business_date desc);

-- Supabase Storage remains private. Object access policies are intentionally
-- added only after upload-intent RPC boundaries exist.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'wing-submissions',
  'wing-submissions',
  false,
  52428800,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'video/mp4',
    'video/quicktime'
  ]::text[]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

commit;

-- Rollback: first disable Wing Shots workers and publishing. Preserve audit and
-- publication receipts unless retention/legal review authorizes deletion. Drop
-- tables in reverse dependency order, then remove the private bucket only after
-- all objects have been enumerated and deleted through a service-only process.
