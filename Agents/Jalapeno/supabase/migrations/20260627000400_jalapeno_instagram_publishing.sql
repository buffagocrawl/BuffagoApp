BEGIN;

CREATE TABLE IF NOT EXISTS public.jalapeno_instagram_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL UNIQUE REFERENCES public.jalapeno_runs(run_id) ON DELETE CASCADE,
  candidate_id text NOT NULL,
  post_id uuid REFERENCES public.jalapeno_posts(id) ON DELETE SET NULL,
  image_asset_id uuid REFERENCES public.jalapeno_image_assets(id) ON DELETE SET NULL,
  container_id text,
  container_status text,
  container_created_at timestamptz,
  request_payload_safe jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  published_media_id text,
  permalink text,
  caption text,
  hashtags text[] NOT NULL DEFAULT ARRAY[]::text[],
  alt_text text,
  image_url text,
  content_type text NOT NULL,
  scheduled_post_type text,
  scheduled_for timestamptz,
  published_at timestamptz,
  status text NOT NULL DEFAULT 'pending',
  failure_stage text,
  failure_reason text,
  error_code text,
  error_message text,
  retry_count integer NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  cost_estimate numeric(12,6),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'jalapeno_runs'
      AND column_name = 'publish_status'
  ) THEN
    ALTER TABLE public.jalapeno_runs
      ADD COLUMN publish_status text NOT NULL DEFAULT 'pending';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'jalapeno_runs'
      AND column_name = 'publish_failure_stage'
  ) THEN
    ALTER TABLE public.jalapeno_runs
      ADD COLUMN publish_failure_stage text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'jalapeno_runs'
      AND column_name = 'publish_failure_reason'
  ) THEN
    ALTER TABLE public.jalapeno_runs
      ADD COLUMN publish_failure_reason text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'jalapeno_runs'
      AND column_name = 'publish_error_code'
  ) THEN
    ALTER TABLE public.jalapeno_runs
      ADD COLUMN publish_error_code text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'jalapeno_runs'
      AND column_name = 'publish_error_message'
  ) THEN
    ALTER TABLE public.jalapeno_runs
      ADD COLUMN publish_error_message text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'jalapeno_runs'
      AND column_name = 'publish_retry_count'
  ) THEN
    ALTER TABLE public.jalapeno_runs
      ADD COLUMN publish_retry_count integer NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'jalapeno_runs'
      AND column_name = 'last_publish_attempt_at'
  ) THEN
    ALTER TABLE public.jalapeno_runs
      ADD COLUMN last_publish_attempt_at timestamptz;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'jalapeno_runs'
      AND column_name = 'published_media_id'
  ) THEN
    ALTER TABLE public.jalapeno_runs
      ADD COLUMN published_media_id text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'jalapeno_runs'
      AND column_name = 'published_permalink'
  ) THEN
    ALTER TABLE public.jalapeno_runs
      ADD COLUMN published_permalink text;
  END IF;
END $$;

ALTER TABLE public.jalapeno_instagram_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jalapeno_instagram_posts FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'jalapeno_instagram_posts_set_updated_at'
  ) THEN
    CREATE TRIGGER jalapeno_instagram_posts_set_updated_at
    BEFORE UPDATE ON public.jalapeno_instagram_posts
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_jalapeno_instagram_posts_candidate_id ON public.jalapeno_instagram_posts(candidate_id);
CREATE INDEX IF NOT EXISTS idx_jalapeno_instagram_posts_container_id ON public.jalapeno_instagram_posts(container_id);
CREATE INDEX IF NOT EXISTS idx_jalapeno_instagram_posts_published_media_id ON public.jalapeno_instagram_posts(published_media_id);
CREATE INDEX IF NOT EXISTS idx_jalapeno_instagram_posts_status ON public.jalapeno_instagram_posts(status);
CREATE INDEX IF NOT EXISTS idx_jalapeno_instagram_posts_published_at_desc ON public.jalapeno_instagram_posts(published_at DESC);

COMMIT;
