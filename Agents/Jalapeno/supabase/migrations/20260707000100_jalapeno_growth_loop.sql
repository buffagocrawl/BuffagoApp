BEGIN;

CREATE TABLE IF NOT EXISTS public.jalapeno_post_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL UNIQUE REFERENCES public.jalapeno_posts(id) ON DELETE CASCADE,
  run_id uuid REFERENCES public.jalapeno_runs(run_id) ON DELETE SET NULL,
  candidate_id text,
  content_type text,
  content_mix_bucket text,
  creative_style text,
  hook_text text,
  overlay_text text,
  caption_style text,
  hashtags text[] NOT NULL DEFAULT ARRAY[]::text[],
  asset_path text,
  prompt_template_name text,
  generated_prompt text,
  scheduled_time timestamptz,
  published_time timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.jalapeno_post_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL UNIQUE REFERENCES public.jalapeno_posts(id) ON DELETE CASCADE,
  instagram_media_id text,
  score numeric(8,2) NOT NULL,
  scoring_version text NOT NULL,
  metric_snapshot_at timestamptz,
  source_window text,
  score_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.jalapeno_growth_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_week_start timestamptz NOT NULL,
  report_week_end timestamptz NOT NULL,
  report_type text NOT NULL DEFAULT 'weekly_growth',
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  recommendations jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.jalapeno_content_strategy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid REFERENCES public.jalapeno_growth_reports(id) ON DELETE SET NULL,
  strategy_status text NOT NULL DEFAULT 'draft',
  is_active boolean NOT NULL DEFAULT false,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  strategy jsonb NOT NULL DEFAULT '{}'::jsonb,
  rationale jsonb NOT NULL DEFAULT '{}'::jsonb,
  applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.jalapeno_post_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jalapeno_post_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jalapeno_growth_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jalapeno_content_strategy ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.jalapeno_post_patterns FORCE ROW LEVEL SECURITY;
ALTER TABLE public.jalapeno_post_scores FORCE ROW LEVEL SECURITY;
ALTER TABLE public.jalapeno_growth_reports FORCE ROW LEVEL SECURITY;
ALTER TABLE public.jalapeno_content_strategy FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'jalapeno_post_patterns_set_updated_at'
  ) THEN
    CREATE TRIGGER jalapeno_post_patterns_set_updated_at
    BEFORE UPDATE ON public.jalapeno_post_patterns
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'jalapeno_post_scores_set_updated_at'
  ) THEN
    CREATE TRIGGER jalapeno_post_scores_set_updated_at
    BEFORE UPDATE ON public.jalapeno_post_scores
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'jalapeno_content_strategy_set_updated_at'
  ) THEN
    CREATE TRIGGER jalapeno_content_strategy_set_updated_at
    BEFORE UPDATE ON public.jalapeno_content_strategy
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_jalapeno_post_patterns_content_type ON public.jalapeno_post_patterns(content_type);
CREATE INDEX IF NOT EXISTS idx_jalapeno_post_patterns_creative_style ON public.jalapeno_post_patterns(creative_style);
CREATE INDEX IF NOT EXISTS idx_jalapeno_post_patterns_published_time_desc ON public.jalapeno_post_patterns(published_time DESC);
CREATE INDEX IF NOT EXISTS idx_jalapeno_post_scores_score_desc ON public.jalapeno_post_scores(score DESC);
CREATE INDEX IF NOT EXISTS idx_jalapeno_growth_reports_week_desc ON public.jalapeno_growth_reports(report_week_start DESC);
CREATE INDEX IF NOT EXISTS idx_jalapeno_content_strategy_active ON public.jalapeno_content_strategy(is_active, effective_from DESC);

INSERT INTO public.jalapeno_settings (
  setting_key,
  setting_value,
  description,
  is_secret,
  is_enabled
) VALUES
  ('growth_loop_apply_requires_jalapeno_dry_run_false', 'true'::jsonb, 'Safeguard to require JALAPENO_DRY_RUN=false before mutating active strategy', false, true),
  ('growth_loop_min_posts_for_strategy', '6'::jsonb, 'Minimum scored posts before Jalapeno adjusts strategy away from baseline', false, true)
ON CONFLICT (setting_key) DO UPDATE
SET
  description = EXCLUDED.description,
  is_secret = EXCLUDED.is_secret,
  is_enabled = EXCLUDED.is_enabled,
  updated_at = now();

COMMIT;
