BEGIN;

ALTER TABLE public.jalapeno_post_candidates
  ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS run_id uuid NOT NULL,
  ADD COLUMN IF NOT EXISTS candidate_number integer,
  ADD COLUMN IF NOT EXISTS post_type text,
  ADD COLUMN IF NOT EXISTS idea text,
  ADD COLUMN IF NOT EXISTS reasoning text,
  ADD COLUMN IF NOT EXISTS caption text,
  ADD COLUMN IF NOT EXISTS hashtags text[],
  ADD COLUMN IF NOT EXISTS image_prompt text,
  ADD COLUMN IF NOT EXISTS image_storage_path text,
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS raw_text_prompt jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS raw_image_prompt jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS raw_ai_response jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS engagement_prediction numeric,
  ADD COLUMN IF NOT EXISTS uniqueness_score numeric,
  ADD COLUMN IF NOT EXISTS brand_alignment_score numeric,
  ADD COLUMN IF NOT EXISTS humor_score numeric,
  ADD COLUMN IF NOT EXISTS quality_score numeric,
  ADD COLUMN IF NOT EXISTS duplicate_score numeric,
  ADD COLUMN IF NOT EXISTS overall_score numeric,
  ADD COLUMN IF NOT EXISTS selected boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS caption_options jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS overlay_options jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS selected_caption text,
  ADD COLUMN IF NOT EXISTS selected_overlay text,
  ADD COLUMN IF NOT EXISTS ranking_reason text,
  ADD COLUMN IF NOT EXISTS ranking_score numeric,
  ADD COLUMN IF NOT EXISTS ranking_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS openai_used boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS openai_model text,
  ADD COLUMN IF NOT EXISTS fallback_reason text,
  ADD COLUMN IF NOT EXISTS feedback_summary_version text,
  ADD COLUMN IF NOT EXISTS feedback_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS caption_text text,
  ADD COLUMN IF NOT EXISTS copy_source text,
  ADD COLUMN IF NOT EXISTS generated_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'jalapeno_post_candidates_run_id_fkey'
  ) THEN
    ALTER TABLE public.jalapeno_post_candidates
      ADD CONSTRAINT jalapeno_post_candidates_run_id_fkey
      FOREIGN KEY (run_id) REFERENCES public.jalapeno_runs(run_id) ON DELETE CASCADE;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
