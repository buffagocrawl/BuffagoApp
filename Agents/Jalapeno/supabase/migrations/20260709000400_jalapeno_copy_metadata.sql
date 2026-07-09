BEGIN;

ALTER TABLE public.jalapeno_post_candidates
  ADD COLUMN IF NOT EXISTS caption_text text,
  ADD COLUMN IF NOT EXISTS copy_source text,
  ADD COLUMN IF NOT EXISTS generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS reuse_blocked_reason text;

ALTER TABLE public.jalapeno_posts
  ADD COLUMN IF NOT EXISTS caption_text text,
  ADD COLUMN IF NOT EXISTS copy_source text,
  ADD COLUMN IF NOT EXISTS generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS reuse_blocked_reason text;

ALTER TABLE public.jalapeno_instagram_posts
  ADD COLUMN IF NOT EXISTS caption_text text,
  ADD COLUMN IF NOT EXISTS copy_source text,
  ADD COLUMN IF NOT EXISTS generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS reuse_blocked_reason text;

ALTER TABLE public.jalapeno_content_candidates
  ADD COLUMN IF NOT EXISTS caption_text text,
  ADD COLUMN IF NOT EXISTS copy_source text,
  ADD COLUMN IF NOT EXISTS generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS reuse_blocked_reason text;

ALTER TABLE public.jalapeno_content_decisions
  ADD COLUMN IF NOT EXISTS caption_text text,
  ADD COLUMN IF NOT EXISTS copy_source text,
  ADD COLUMN IF NOT EXISTS generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS reuse_blocked_reason text;

COMMIT;
