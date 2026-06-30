BEGIN;

CREATE TABLE IF NOT EXISTS public.jalapeno_image_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.jalapeno_runs(run_id) ON DELETE CASCADE,
  candidate_id text NOT NULL,
  post_id uuid REFERENCES public.jalapeno_posts(id) ON DELETE SET NULL,
  local_temp_path text NOT NULL,
  storage_bucket text,
  storage_path text,
  public_url text,
  image_type text NOT NULL,
  content_type text NOT NULL,
  width integer NOT NULL,
  height integer NOT NULL,
  aspect_ratio numeric(8,4) NOT NULL,
  file_size_bytes bigint NOT NULL,
  format text NOT NULL,
  branding_applied boolean NOT NULL DEFAULT false,
  meme_format_applied boolean NOT NULL DEFAULT false,
  validation_status text NOT NULL,
  uploaded_at timestamptz,
  cleanup_status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.jalapeno_image_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jalapeno_image_assets FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'jalapeno_image_assets_set_updated_at'
  ) THEN
    CREATE TRIGGER jalapeno_image_assets_set_updated_at
    BEFORE UPDATE ON public.jalapeno_image_assets
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_jalapeno_image_assets_run_id ON public.jalapeno_image_assets(run_id);
CREATE INDEX IF NOT EXISTS idx_jalapeno_image_assets_candidate_id ON public.jalapeno_image_assets(candidate_id);
CREATE INDEX IF NOT EXISTS idx_jalapeno_image_assets_public_url ON public.jalapeno_image_assets(public_url);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'jalapeno_content_decisions'
      AND column_name = 'image_asset_id'
  ) THEN
    ALTER TABLE public.jalapeno_content_decisions
      ADD COLUMN image_asset_id uuid;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'jalapeno_content_decisions'
      AND column_name = 'image_public_url'
  ) THEN
    ALTER TABLE public.jalapeno_content_decisions
      ADD COLUMN image_public_url text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'jalapeno_content_decisions'
      AND column_name = 'image_storage_path'
  ) THEN
    ALTER TABLE public.jalapeno_content_decisions
      ADD COLUMN image_storage_path text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'jalapeno_content_decisions'
      AND column_name = 'image_uploaded_at'
  ) THEN
    ALTER TABLE public.jalapeno_content_decisions
      ADD COLUMN image_uploaded_at timestamptz;
  END IF;
END $$;

COMMIT;

