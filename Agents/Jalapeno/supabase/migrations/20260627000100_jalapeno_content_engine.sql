BEGIN;

CREATE TABLE IF NOT EXISTS public.jalapeno_content_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.jalapeno_runs(run_id) ON DELETE CASCADE,
  candidate_id text NOT NULL,
  content_type text NOT NULL,
  reason_chosen text,
  working_title text,
  short_summary text,
  target_emotion text,
  suggested_cta text,
  suggested_image_concept text,
  suggested_caption_angle text,
  primary_theme text,
  secondary_theme text,
  mood text,
  hook_style text,
  cta_category text,
  restaurants_mentioned text[] NOT NULL DEFAULT ARRAY[]::text[],
  cities_mentioned text[] NOT NULL DEFAULT ARRAY[]::text[],
  states_mentioned text[] NOT NULL DEFAULT ARRAY[]::text[],
  food_categories text[] NOT NULL DEFAULT ARRAY[]::text[],
  holiday_references text[] NOT NULL DEFAULT ARRAY[]::text[],
  sports_references text[] NOT NULL DEFAULT ARRAY[]::text[],
  current_event_references text[] NOT NULL DEFAULT ARRAY[]::text[],
  source_signals text[] NOT NULL DEFAULT ARRAY[]::text[],
  visual_style text,
  image_composition text,
  duplicate_score numeric(5,3),
  overall_score numeric(6,3),
  rejected boolean NOT NULL DEFAULT false,
  rejection_reason text,
  score_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.jalapeno_content_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.jalapeno_runs(run_id) ON DELETE CASCADE,
  winner_candidate_id text,
  runner_up_candidate_id text,
  decision_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  winner_reasoning jsonb NOT NULL DEFAULT '[]'::jsonb,
  model_name text,
  token_usage jsonb NOT NULL DEFAULT '{}'::jsonb,
  cost_estimate numeric(12,6),
  platform text NOT NULL DEFAULT 'instagram',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.jalapeno_content_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id text NOT NULL UNIQUE,
  run_id uuid REFERENCES public.jalapeno_runs(run_id) ON DELETE SET NULL,
  timestamp timestamptz NOT NULL DEFAULT now(),
  platform text NOT NULL DEFAULT 'instagram',
  post_type text,
  primary_theme text,
  secondary_theme text,
  mood text,
  target_emotion text,
  restaurants_mentioned text[] NOT NULL DEFAULT ARRAY[]::text[],
  cities_mentioned text[] NOT NULL DEFAULT ARRAY[]::text[],
  states_mentioned text[] NOT NULL DEFAULT ARRAY[]::text[],
  food_categories text[] NOT NULL DEFAULT ARRAY[]::text[],
  holiday_references text[] NOT NULL DEFAULT ARRAY[]::text[],
  sports_references text[] NOT NULL DEFAULT ARRAY[]::text[],
  current_event_references text[] NOT NULL DEFAULT ARRAY[]::text[],
  hook_style text,
  cta_category text,
  specific_cta text,
  hashtags text[] NOT NULL DEFAULT ARRAY[]::text[],
  dominant_image_colors text[] NOT NULL DEFAULT ARRAY[]::text[],
  image_style text,
  image_composition text,
  caption_length integer,
  emoji_count integer,
  question_included boolean,
  carousel boolean,
  publishing_time text,
  likes integer,
  comments integer,
  shares integer,
  saves integer,
  reach integer,
  impressions integer,
  engagement_rate numeric(8,4),
  follower_growth integer,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.jalapeno_content_performance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id text NOT NULL,
  run_id uuid REFERENCES public.jalapeno_runs(run_id) ON DELETE SET NULL,
  platform text NOT NULL DEFAULT 'instagram',
  likes integer,
  comments integer,
  shares integer,
  saves integer,
  reach integer,
  impressions integer,
  engagement_rate numeric(8,4),
  follower_growth integer,
  raw_metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  captured_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.jalapeno_content_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jalapeno_content_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jalapeno_content_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jalapeno_content_performance ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.jalapeno_content_candidates FORCE ROW LEVEL SECURITY;
ALTER TABLE public.jalapeno_content_decisions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.jalapeno_content_memory FORCE ROW LEVEL SECURITY;
ALTER TABLE public.jalapeno_content_performance FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'jalapeno_content_candidates_set_updated_at'
  ) THEN
    CREATE TRIGGER jalapeno_content_candidates_set_updated_at
    BEFORE UPDATE ON public.jalapeno_content_candidates
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'jalapeno_content_decisions_set_updated_at'
  ) THEN
    CREATE TRIGGER jalapeno_content_decisions_set_updated_at
    BEFORE UPDATE ON public.jalapeno_content_decisions
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'jalapeno_content_memory_set_updated_at'
  ) THEN
    CREATE TRIGGER jalapeno_content_memory_set_updated_at
    BEFORE UPDATE ON public.jalapeno_content_memory
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_jalapeno_content_candidates_run_id ON public.jalapeno_content_candidates(run_id);
CREATE INDEX IF NOT EXISTS idx_jalapeno_content_candidates_content_type ON public.jalapeno_content_candidates(content_type);
CREATE INDEX IF NOT EXISTS idx_jalapeno_content_candidates_overall_score ON public.jalapeno_content_candidates(overall_score DESC);

CREATE INDEX IF NOT EXISTS idx_jalapeno_content_decisions_run_id ON public.jalapeno_content_decisions(run_id);
CREATE INDEX IF NOT EXISTS idx_jalapeno_content_decisions_platform ON public.jalapeno_content_decisions(platform);

CREATE INDEX IF NOT EXISTS idx_jalapeno_content_memory_post_id ON public.jalapeno_content_memory(post_id);
CREATE INDEX IF NOT EXISTS idx_jalapeno_content_memory_platform ON public.jalapeno_content_memory(platform);
CREATE INDEX IF NOT EXISTS idx_jalapeno_content_memory_timestamp_desc ON public.jalapeno_content_memory(timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_jalapeno_content_performance_post_id ON public.jalapeno_content_performance(post_id);
CREATE INDEX IF NOT EXISTS idx_jalapeno_content_performance_captured_at_desc ON public.jalapeno_content_performance(captured_at DESC);

COMMIT;
