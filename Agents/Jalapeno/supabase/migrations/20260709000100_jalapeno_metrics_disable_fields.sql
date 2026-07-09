BEGIN;

ALTER TABLE public.jalapeno_posts
  ADD COLUMN IF NOT EXISTS metrics_status text,
  ADD COLUMN IF NOT EXISTS metrics_error_type text,
  ADD COLUMN IF NOT EXISTS metrics_disabled_at timestamptz,
  ADD COLUMN IF NOT EXISTS metrics_last_error jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_jalapeno_posts_metrics_exclusion
  ON public.jalapeno_posts(metrics_status, metrics_disabled_at);

COMMIT;
