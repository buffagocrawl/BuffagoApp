BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.jalapeno_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL UNIQUE,
  agent_name text NOT NULL DEFAULT 'jalapeno',
  agent_version text,
  workflow_version text,
  prompt_version text,
  git_commit text,
  environment text,
  trigger_source text,
  post_type text,
  status text NOT NULL,
  dry_run boolean NOT NULL DEFAULT true,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  duration_ms integer,
  total_candidates integer NOT NULL DEFAULT 0,
  selected_candidate_id uuid,
  model_name text,
  image_model_name text,
  prompt_tokens integer,
  completion_tokens integer,
  total_tokens integer,
  estimated_cost numeric(12,6),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.jalapeno_post_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.jalapeno_runs(run_id) ON DELETE CASCADE,
  candidate_number integer,
  post_type text,
  idea text,
  reasoning text,
  caption text,
  hashtags text[],
  image_prompt text,
  image_storage_path text,
  image_url text,
  raw_text_prompt jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_image_prompt jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_ai_response jsonb NOT NULL DEFAULT '{}'::jsonb,
  engagement_prediction numeric(5,2),
  uniqueness_score numeric(5,2),
  brand_alignment_score numeric(5,2),
  humor_score numeric(5,2),
  quality_score numeric(5,2),
  duplicate_score numeric(5,2),
  overall_score numeric(5,2),
  selected boolean NOT NULL DEFAULT false,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.jalapeno_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.jalapeno_runs(run_id) ON DELETE CASCADE,
  candidate_id uuid REFERENCES public.jalapeno_post_candidates(id) ON DELETE SET NULL,
  post_type text,
  chosen_idea text,
  generated_caption text,
  hashtags text[],
  image_prompt text,
  image_storage_path text,
  image_url text,
  scheduled_for timestamptz,
  published_at timestamptz,
  publish_status text NOT NULL DEFAULT 'drafted',
  instagram_media_id text,
  instagram_permalink text,
  retry_count integer NOT NULL DEFAULT 0,
  last_publish_attempt_at timestamptz,
  publish_response jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.jalapeno_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.jalapeno_runs(run_id) ON DELETE SET NULL,
  post_id uuid REFERENCES public.jalapeno_posts(id) ON DELETE SET NULL,
  candidate_id uuid REFERENCES public.jalapeno_post_candidates(id) ON DELETE SET NULL,
  stage text NOT NULL,
  error_type text,
  message text NOT NULL,
  stack_trace text,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_retryable boolean NOT NULL DEFAULT false,
  retry_count integer NOT NULL DEFAULT 0,
  resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.jalapeno_post_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.jalapeno_posts(id) ON DELETE CASCADE,
  instagram_media_id text,
  likes integer,
  comments integer,
  shares integer,
  saves integer,
  reach integer,
  impressions integer,
  profile_visits integer,
  follows integer,
  engagement_rate numeric(8,4),
  raw_metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  captured_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.jalapeno_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key text NOT NULL UNIQUE,
  setting_value jsonb NOT NULL,
  description text,
  is_secret boolean NOT NULL DEFAULT false,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.jalapeno_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jalapeno_post_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jalapeno_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jalapeno_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jalapeno_post_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jalapeno_settings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.jalapeno_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.jalapeno_post_candidates FORCE ROW LEVEL SECURITY;
ALTER TABLE public.jalapeno_posts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.jalapeno_errors FORCE ROW LEVEL SECURITY;
ALTER TABLE public.jalapeno_post_metrics FORCE ROW LEVEL SECURITY;
ALTER TABLE public.jalapeno_settings FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'jalapeno_runs_set_updated_at'
  ) THEN
    CREATE TRIGGER jalapeno_runs_set_updated_at
    BEFORE UPDATE ON public.jalapeno_runs
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'jalapeno_post_candidates_set_updated_at'
  ) THEN
    CREATE TRIGGER jalapeno_post_candidates_set_updated_at
    BEFORE UPDATE ON public.jalapeno_post_candidates
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'jalapeno_posts_set_updated_at'
  ) THEN
    CREATE TRIGGER jalapeno_posts_set_updated_at
    BEFORE UPDATE ON public.jalapeno_posts
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'jalapeno_settings_set_updated_at'
  ) THEN
    CREATE TRIGGER jalapeno_settings_set_updated_at
    BEFORE UPDATE ON public.jalapeno_settings
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'jalapeno_runs_selected_candidate_id_fkey'
  ) THEN
    ALTER TABLE public.jalapeno_runs
      ADD CONSTRAINT jalapeno_runs_selected_candidate_id_fkey
      FOREIGN KEY (selected_candidate_id) REFERENCES public.jalapeno_post_candidates(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_jalapeno_runs_run_id ON public.jalapeno_runs(run_id);
CREATE INDEX IF NOT EXISTS idx_jalapeno_runs_status ON public.jalapeno_runs(status);
CREATE INDEX IF NOT EXISTS idx_jalapeno_runs_started_at_desc ON public.jalapeno_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_jalapeno_runs_post_type ON public.jalapeno_runs(post_type);

CREATE INDEX IF NOT EXISTS idx_jalapeno_post_candidates_run_id ON public.jalapeno_post_candidates(run_id);
CREATE INDEX IF NOT EXISTS idx_jalapeno_post_candidates_selected ON public.jalapeno_post_candidates(selected);

CREATE INDEX IF NOT EXISTS idx_jalapeno_posts_run_id ON public.jalapeno_posts(run_id);
CREATE INDEX IF NOT EXISTS idx_jalapeno_posts_candidate_id ON public.jalapeno_posts(candidate_id);
CREATE INDEX IF NOT EXISTS idx_jalapeno_posts_publish_status ON public.jalapeno_posts(publish_status);
CREATE INDEX IF NOT EXISTS idx_jalapeno_posts_instagram_media_id ON public.jalapeno_posts(instagram_media_id);
CREATE INDEX IF NOT EXISTS idx_jalapeno_posts_published_at_desc ON public.jalapeno_posts(published_at DESC);

CREATE INDEX IF NOT EXISTS idx_jalapeno_errors_run_id ON public.jalapeno_errors(run_id);
CREATE INDEX IF NOT EXISTS idx_jalapeno_errors_stage ON public.jalapeno_errors(stage);
CREATE INDEX IF NOT EXISTS idx_jalapeno_errors_resolved ON public.jalapeno_errors(resolved);

CREATE INDEX IF NOT EXISTS idx_jalapeno_post_metrics_post_id ON public.jalapeno_post_metrics(post_id);
CREATE INDEX IF NOT EXISTS idx_jalapeno_post_metrics_instagram_media_id ON public.jalapeno_post_metrics(instagram_media_id);
CREATE INDEX IF NOT EXISTS idx_jalapeno_post_metrics_captured_at_desc ON public.jalapeno_post_metrics(captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_jalapeno_settings_setting_key ON public.jalapeno_settings(setting_key);

INSERT INTO public.jalapeno_settings (
  setting_key,
  setting_value,
  description,
  is_secret,
  is_enabled
) VALUES
  ('posting_enabled', 'false'::jsonb, 'Controls whether Jalapeno is allowed to publish', false, true),
  ('dry_run', 'true'::jsonb, 'Default operational mode for Jalapeno validation and local runs', false, true),
  ('instagram_enabled', 'false'::jsonb, 'Master switch for Instagram API usage', false, true),
  ('buffago_post_time', '"16:00"'::jsonb, 'Default time for Buffago post generation', false, true),
  ('meme_post_time', '"20:00"'::jsonb, 'Default time for meme post generation', false, true),
  ('timezone', '"America/New_York"'::jsonb, 'Primary agent timezone', false, true),
  ('text_model', '"gpt-4.1-mini"'::jsonb, 'Default text generation model', false, true),
  ('image_model', '"gpt-5.4"'::jsonb, 'Default image generation model', false, true),
  ('temperature', '0.7'::jsonb, 'Default model temperature', false, true),
  ('max_candidates', '5'::jsonb, 'Maximum number of candidates to generate per run', false, true),
  ('max_retries', '3'::jsonb, 'Maximum retry attempts for transient failures', false, true),
  ('prompt_version', '"phase2-v1"'::jsonb, 'Default prompt version', false, true),
  ('workflow_version', '"phase2-v1"'::jsonb, 'Default workflow version', false, true),
  ('default_hashtag_count', '8'::jsonb, 'Default hashtag count for generated posts', false, true),
  ('default_image_size', '"1024x1024"'::jsonb, 'Default image size for generated images', false, true),
  ('storage_bucket', '"jalapeno-media"'::jsonb, 'Default bucket for image and asset storage', false, true),
  ('metrics_collection_enabled', 'false'::jsonb, 'Controls whether metrics polling is active', false, true)
ON CONFLICT (setting_key) DO UPDATE
SET
  setting_value = EXCLUDED.setting_value,
  description = EXCLUDED.description,
  is_secret = EXCLUDED.is_secret,
  is_enabled = EXCLUDED.is_enabled,
  updated_at = now();

COMMIT;
