-- User-supplied schema-only export, normalized formatting and dependency order.
-- INCOMPLETE BASELINE: referenced tables/functions and RLS/grants are not supplied.
-- Do not apply until dependency-audit.json is resolved. No production writes.

create table public.wing_media_submissions (
 id uuid not null default gen_random_uuid(), user_id uuid null,
 owner_pseudonym_id uuid not null default gen_random_uuid(), owner_deleted_at timestamptz null,
 rating_id uuid null, destination_id uuid not null, media_type text not null,
 original_storage_path text not null, processed_storage_path text null, thumbnail_storage_path text null,
 status text not null default 'uploaded'::text, moderation_status text not null default 'pending'::text,
 wing_verification_status text not null default 'pending'::text, wing_confidence numeric(5,4) null,
 quality_score numeric(6,3) null, content_score numeric(8,3) null, duplicate_group uuid null,
 perceptual_hash text null, consent_version text not null, consented_at timestamptz not null,
 attribution_preference text not null, user_caption text null, reviewer_notes text null,
 priority integer not null default 0, approved_at timestamptz null, approved_by uuid null,
 rejected_at timestamptz null, rejection_reason text null, featured_at timestamptz null,
 withdrawn_at timestamptz null, original_retain_until timestamptz null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 correlation_id uuid not null default gen_random_uuid(), original_deleted_at timestamptz null,
 submission_source text not null default 'rating'::text, reviewed_at timestamptz null, reviewed_by uuid null,
 is_publish_priority boolean not null default false, priority_set_at timestamptz null, priority_set_by uuid null,
 like_count integer not null default 0, dislike_count integer not null default 0,
 constraint wing_media_submissions_pkey primary key(id),
 constraint wing_media_submissions_thumbnail_storage_path_key unique(thumbnail_storage_path),
 constraint wing_media_submissions_processed_storage_path_key unique(processed_storage_path),
 constraint wing_media_submissions_one_per_rating unique(rating_id),
 constraint wing_media_submissions_original_storage_path_key unique(original_storage_path),
 constraint wing_media_submissions_user_id_fkey foreign key(user_id) references auth.users(id) on delete set null,
 constraint wing_media_submissions_reviewed_by_fkey foreign key(reviewed_by) references auth.users(id) on delete set null,
 constraint wing_media_submissions_priority_set_by_fkey foreign key(priority_set_by) references auth.users(id) on delete set null,
 constraint wing_media_submissions_destination_id_fkey foreign key(destination_id) references destinations(id) on delete restrict,
 constraint wing_media_submissions_approved_by_fkey foreign key(approved_by) references auth.users(id) on delete set null,
 constraint wing_media_submissions_rating_id_fkey foreign key(rating_id) references destination_ratings(id) on delete restrict,
 constraint wing_media_submissions_priority_check check(priority>=0 and priority<=100),
 constraint wing_media_submissions_processed_path_identity check(processed_storage_path is null or split_part(processed_storage_path,'/',2)=id::text),
 constraint wing_media_submissions_processed_storage_path_check check(processed_storage_path is null or processed_storage_path ~ '^processed/[0-9a-f-]{36}/primary$'),
 constraint wing_media_submissions_quality_score_check check(quality_score is null or (quality_score>=0 and quality_score<=100)),
 constraint wing_media_submissions_rejection_shape check((rejected_at is null and rejection_reason is null) or (rejected_at is not null and rejection_reason is not null)),
 constraint wing_media_submissions_reviewer_notes_check check(reviewer_notes is null or char_length(reviewer_notes)<=2000),
 constraint wing_media_submissions_status_check check(status=any(array['uploaded','processing','in_review','approved','rejected','generation_pending','ready_to_post','scheduled','posting','posted','failed','withdrawn']::text[])),
 constraint wing_media_submissions_submission_source_check check(submission_source=any(array['rating','onboarding','buffacoin','profile','home_cta']::text[])),
 constraint wing_media_submissions_terminal_shape check((status<>'rejected' or rejected_at is not null) and (status<>'posted' or featured_at is not null) and (status<>'withdrawn' or withdrawn_at is not null)),
 constraint wing_media_submissions_thumbnail_path_identity check(thumbnail_storage_path is null or split_part(thumbnail_storage_path,'/',2)=id::text),
 constraint wing_media_submissions_thumbnail_storage_path_check check(thumbnail_storage_path is null or thumbnail_storage_path ~ '^thumbnails/[0-9a-f-]{36}/preview$'),
 constraint wing_media_submissions_user_caption_check check(user_caption is null or char_length(user_caption)<=500),
 constraint wing_media_submissions_wing_confidence_check check(wing_confidence is null or (wing_confidence>=0 and wing_confidence<=1)),
 constraint wing_media_submissions_approval_shape check((approved_at is null and approved_by is null) or (approved_at is not null and approved_by is not null)),
 constraint wing_media_submissions_wing_verification_status_check check(wing_verification_status=any(array['pending','likely_wings','uncertain','not_wings','overridden','failed']::text[])),
 constraint wing_media_submissions_attribution_preference_check check(attribution_preference=any(array['username','display_name','anonymous']::text[])),
 constraint wing_media_submissions_consent_version_check check(char_length(consent_version)>=1 and char_length(consent_version)<=40),
 constraint wing_media_submissions_dislike_count_nonnegative check(dislike_count>=0),
 constraint wing_media_submissions_like_count_nonnegative check(like_count>=0),
 constraint wing_media_submissions_media_type_check check(media_type=any(array['photo','video']::text[])),
 constraint wing_media_submissions_moderation_status_check check(moderation_status=any(array['pending','evaluating','likely_acceptable','manual_review','clear_rejection','overridden','failed']::text[])),
 constraint wing_media_submissions_original_storage_path_check check(original_storage_path ~ '^originals/[0-9a-f-]{36}/[0-9a-f-]{36}/source$'),
 constraint wing_media_submissions_owner_deletion_shape check((user_id is not null and owner_deleted_at is null) or (user_id is null and owner_deleted_at is not null)),
 constraint wing_media_submissions_path_ownership check(split_part(original_storage_path,'/',3)=id::text and ((user_id is not null and split_part(original_storage_path,'/',2)=user_id::text) or (user_id is null and owner_deleted_at is not null))),
 constraint wing_media_submissions_perceptual_hash_check check(perceptual_hash is null or (char_length(perceptual_hash)>=16 and char_length(perceptual_hash)<=256))
) tablespace pg_default;

create table public.wing_media_photo_votes (
 submission_id uuid not null, user_id uuid not null, vote smallint not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 constraint wing_media_photo_votes_pkey primary key(submission_id,user_id),
 constraint wing_media_photo_votes_submission_id_fkey foreign key(submission_id) references wing_media_submissions(id) on delete cascade,
 constraint wing_media_photo_votes_user_id_fkey foreign key(user_id) references auth.users(id) on delete cascade,
 constraint wing_media_photo_votes_vote_check check(vote=any(array['-1'::integer,1]))
) tablespace pg_default;

create table public.wing_jury_votes (
 submission_id uuid not null, user_id uuid not null, vote smallint not null,
 created_at timestamptz not null default now(),
 constraint wing_jury_votes_pkey primary key(submission_id,user_id),
 constraint wing_jury_votes_submission_id_fkey foreign key(submission_id) references wing_media_submissions(id) on delete cascade,
 constraint wing_jury_votes_user_id_fkey foreign key(user_id) references auth.users(id) on delete cascade,
 constraint wing_jury_votes_vote_check check(vote=any(array['-1'::integer,0,1]))
) tablespace pg_default;

create table public.wing_jury_photo_vote_counts (
 submission_id uuid not null, like_count integer not null default 0, neutral_count integer not null default 0,
 dislike_count integer not null default 0, updated_at timestamptz not null default now(),
 constraint wing_jury_photo_vote_counts_pkey primary key(submission_id),
 constraint wing_jury_photo_vote_counts_submission_id_fkey foreign key(submission_id) references wing_media_submissions(id) on delete cascade,
 constraint wing_jury_photo_vote_counts_dislike_count_check check(dislike_count>=0),
 constraint wing_jury_photo_vote_counts_like_count_check check(like_count>=0),
 constraint wing_jury_photo_vote_counts_neutral_count_check check(neutral_count>=0),
 constraint wing_jury_photo_vote_counts_total_nonnegative check(like_count+neutral_count+dislike_count>=0)
) tablespace pg_default;

create index if not exists idx_wing_media_photo_votes_user on public.wing_media_photo_votes using btree(user_id,submission_id) tablespace pg_default;
create index if not exists wing_media_submissions_owner_time_idx on public.wing_media_submissions using btree(user_id,created_at desc) tablespace pg_default;
create index if not exists wing_media_submissions_review_queue_idx on public.wing_media_submissions using btree(priority desc,quality_score desc,created_at,id) tablespace pg_default where status='in_review';
create index if not exists wing_media_submissions_approved_queue_idx on public.wing_media_submissions using btree(created_at,id) tablespace pg_default where status='approved' and featured_at is null;
create index if not exists wing_media_submissions_destination_time_idx on public.wing_media_submissions using btree(destination_id,featured_at desc) tablespace pg_default where featured_at is not null;
create index if not exists wing_media_submissions_mango_queue_idx on public.wing_media_submissions using btree(status,created_at desc,id) tablespace pg_default where status=any(array['in_review','approved','rejected','posted','failed']::text[]);
create unique index if not exists wing_media_submissions_one_active_priority_idx on public.wing_media_submissions using btree(is_publish_priority) tablespace pg_default where is_publish_priority and status='approved' and featured_at is null;
create index if not exists wing_media_public_photo_destination_idx on public.wing_media_submissions using btree(destination_id,created_at desc,id) tablespace pg_default where wing_media_is_public_status(status) and media_type='photo';
create index if not exists idx_wing_media_title_card_rank on public.wing_media_submissions using btree(destination_id,like_count desc,dislike_count,created_at,id) tablespace pg_default where media_type='photo' and status='approved';
create index if not exists wing_media_submissions_wing_jury_candidate_idx on public.wing_media_submissions using btree(destination_id,created_at,id) tablespace pg_default where media_type='photo' and status='approved' and processed_storage_path is not null and owner_deleted_at is null and withdrawn_at is null;
create index if not exists wing_jury_votes_user_idx on public.wing_jury_votes using btree(user_id,created_at desc) tablespace pg_default;
create index if not exists wing_jury_votes_submission_vote_idx on public.wing_jury_votes using btree(submission_id,vote) tablespace pg_default;
create index if not exists wing_jury_photo_vote_counts_like_idx on public.wing_jury_photo_vote_counts using btree(like_count desc,submission_id) tablespace pg_default;

create trigger trg_refresh_wing_media_photo_vote_counts after insert or delete or update on wing_media_photo_votes for each row execute function private.refresh_wing_media_photo_vote_counts();
create trigger trg_validate_wing_media_photo_vote before insert or update on wing_media_photo_votes for each row execute function private.validate_wing_media_photo_vote();
create trigger mango_clear_ineligible_priority before update of status,featured_at,is_publish_priority on wing_media_submissions for each row execute function mango_clear_ineligible_priority();
create trigger wing_media_submissions_owner_pseudonymization before update of user_id on wing_media_submissions for each row execute function wing_apply_owner_pseudonymization();
create trigger wing_photo_approval_guard before update of status on wing_media_submissions for each row execute function guard_wing_photo_approval();
create trigger wing_photo_upload_derivatives after insert on wing_media_submissions for each row execute function enqueue_wing_photo_upload_derivatives();
create trigger wing_jury_votes_enforce_immutability before delete or update on wing_jury_votes for each row execute function private.enforce_wing_jury_vote_immutability();
create trigger wing_jury_votes_refresh_counts after insert or delete on wing_jury_votes for each row execute function private.refresh_wing_jury_photo_vote_counts();
create trigger wing_jury_votes_validate_insert before insert on wing_jury_votes for each row execute function private.validate_wing_jury_vote_insert();
