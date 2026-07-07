BEGIN;

ALTER TABLE public.jalapeno_instagram_posts
  ADD COLUMN IF NOT EXISTS metrics_status text,
  ADD COLUMN IF NOT EXISTS metrics_error_type text,
  ADD COLUMN IF NOT EXISTS metrics_disabled_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_jalapeno_instagram_posts_metrics_status
  ON public.jalapeno_instagram_posts(metrics_status);

CREATE INDEX IF NOT EXISTS idx_jalapeno_instagram_posts_metrics_disabled_at
  ON public.jalapeno_instagram_posts(metrics_disabled_at);

COMMIT;
