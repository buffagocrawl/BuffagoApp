BEGIN;

ALTER TABLE public.jalapeno_post_candidates
  ADD COLUMN IF NOT EXISTS caption_options jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS overlay_options jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS selected_caption text,
  ADD COLUMN IF NOT EXISTS selected_overlay text,
  ADD COLUMN IF NOT EXISTS ranking_reason text,
  ADD COLUMN IF NOT EXISTS ranking_score numeric(12,3),
  ADD COLUMN IF NOT EXISTS ranking_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS openai_used boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS openai_model text,
  ADD COLUMN IF NOT EXISTS fallback_reason text,
  ADD COLUMN IF NOT EXISTS feedback_summary_version text,
  ADD COLUMN IF NOT EXISTS feedback_summary jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.jalapeno_posts
  ADD COLUMN IF NOT EXISTS caption_options jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS overlay_options jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS selected_caption text,
  ADD COLUMN IF NOT EXISTS selected_overlay text,
  ADD COLUMN IF NOT EXISTS ranking_reason text,
  ADD COLUMN IF NOT EXISTS ranking_score numeric(12,3),
  ADD COLUMN IF NOT EXISTS ranking_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS openai_used boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS openai_model text,
  ADD COLUMN IF NOT EXISTS fallback_reason text,
  ADD COLUMN IF NOT EXISTS feedback_summary_version text,
  ADD COLUMN IF NOT EXISTS feedback_summary jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.jalapeno_instagram_posts
  ADD COLUMN IF NOT EXISTS caption_options jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS overlay_options jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS selected_caption text,
  ADD COLUMN IF NOT EXISTS selected_overlay text,
  ADD COLUMN IF NOT EXISTS ranking_reason text,
  ADD COLUMN IF NOT EXISTS ranking_score numeric(12,3),
  ADD COLUMN IF NOT EXISTS ranking_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS openai_used boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS openai_model text,
  ADD COLUMN IF NOT EXISTS fallback_reason text,
  ADD COLUMN IF NOT EXISTS feedback_summary_version text,
  ADD COLUMN IF NOT EXISTS feedback_summary jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.jalapeno_content_candidates
  ADD COLUMN IF NOT EXISTS caption_options jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS overlay_options jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS selected_caption text,
  ADD COLUMN IF NOT EXISTS selected_overlay text,
  ADD COLUMN IF NOT EXISTS ranking_reason text,
  ADD COLUMN IF NOT EXISTS ranking_score numeric(12,3),
  ADD COLUMN IF NOT EXISTS ranking_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS openai_used boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS openai_model text,
  ADD COLUMN IF NOT EXISTS fallback_reason text,
  ADD COLUMN IF NOT EXISTS feedback_summary_version text,
  ADD COLUMN IF NOT EXISTS feedback_summary jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.jalapeno_content_decisions
  ADD COLUMN IF NOT EXISTS caption_options jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS overlay_options jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS selected_caption text,
  ADD COLUMN IF NOT EXISTS selected_overlay text,
  ADD COLUMN IF NOT EXISTS ranking_reason text,
  ADD COLUMN IF NOT EXISTS ranking_score numeric(12,3),
  ADD COLUMN IF NOT EXISTS ranking_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS openai_used boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS openai_model text,
  ADD COLUMN IF NOT EXISTS fallback_reason text,
  ADD COLUMN IF NOT EXISTS feedback_summary_version text,
  ADD COLUMN IF NOT EXISTS feedback_summary jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMIT;
