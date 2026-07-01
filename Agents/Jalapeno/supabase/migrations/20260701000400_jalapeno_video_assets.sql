BEGIN;

INSERT INTO storage.buckets (id, name, public)
VALUES ('jalapeno-wing-videos', 'jalapeno-wing-videos', true)
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  public = EXCLUDED.public;

CREATE TABLE IF NOT EXISTS public.jalapeno_video_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_bucket text NOT NULL DEFAULT 'jalapeno-wing-videos',
  storage_path text NOT NULL UNIQUE,
  public_url text,
  style text,
  caption_type text,
  active boolean NOT NULL DEFAULT true,
  used_count integer NOT NULL DEFAULT 0,
  last_used_at timestamptz,
  performance_score numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE
  column_spec record;
BEGIN
  FOR column_spec IN
    SELECT * FROM (VALUES
      ('media_source', 'text'),
      ('video_asset_id', 'uuid REFERENCES public.jalapeno_video_assets(id) ON DELETE SET NULL'),
      ('storage_path', 'text'),
      ('video_url', 'text')
    ) AS specs(column_name, data_type)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'jalapeno_posts'
        AND column_name = column_spec.column_name
    ) THEN
      EXECUTE format('ALTER TABLE public.jalapeno_posts ADD COLUMN %I %s', column_spec.column_name, column_spec.data_type);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE
  column_spec record;
BEGIN
  FOR column_spec IN
    SELECT * FROM (VALUES
      ('video_asset_id', 'uuid REFERENCES public.jalapeno_video_assets(id) ON DELETE SET NULL'),
      ('video_url', 'text'),
      ('media_kind', 'text'),
      ('media_source', 'text'),
      ('storage_path', 'text')
    ) AS specs(column_name, data_type)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'jalapeno_instagram_posts'
        AND column_name = column_spec.column_name
    ) THEN
      EXECUTE format('ALTER TABLE public.jalapeno_instagram_posts ADD COLUMN %I %s', column_spec.column_name, column_spec.data_type);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE
  column_spec record;
BEGIN
  FOR column_spec IN
    SELECT * FROM (VALUES
      ('video_asset_id', 'uuid REFERENCES public.jalapeno_video_assets(id) ON DELETE SET NULL'),
      ('caption_type', 'text'),
      ('video_style', 'text'),
      ('media_source', 'text'),
      ('storage_path', 'text')
    ) AS specs(column_name, data_type)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'jalapeno_post_metrics'
        AND column_name = column_spec.column_name
    ) THEN
      EXECUTE format('ALTER TABLE public.jalapeno_post_metrics ADD COLUMN %I %s', column_spec.column_name, column_spec.data_type);
    END IF;
  END LOOP;
END $$;

ALTER TABLE public.jalapeno_video_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jalapeno_video_assets FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'jalapeno_video_assets_set_updated_at'
  ) THEN
    CREATE TRIGGER jalapeno_video_assets_set_updated_at
    BEFORE UPDATE ON public.jalapeno_video_assets
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_jalapeno_video_assets_active_last_used
  ON public.jalapeno_video_assets(active, last_used_at ASC NULLS FIRST, used_count ASC);
CREATE INDEX IF NOT EXISTS idx_jalapeno_video_assets_style ON public.jalapeno_video_assets(style);
CREATE INDEX IF NOT EXISTS idx_jalapeno_video_assets_caption_type ON public.jalapeno_video_assets(caption_type);
CREATE INDEX IF NOT EXISTS idx_jalapeno_posts_video_asset_id ON public.jalapeno_posts(video_asset_id);
CREATE INDEX IF NOT EXISTS idx_jalapeno_posts_media_source ON public.jalapeno_posts(media_source);
CREATE INDEX IF NOT EXISTS idx_jalapeno_post_metrics_video_asset_id ON public.jalapeno_post_metrics(video_asset_id);
CREATE INDEX IF NOT EXISTS idx_jalapeno_post_metrics_caption_type ON public.jalapeno_post_metrics(caption_type);

INSERT INTO public.jalapeno_settings (
  setting_key,
  setting_value,
  description,
  is_secret,
  is_enabled
) VALUES
  ('video_post_time', '"20:00"'::jsonb, 'Default time for Supabase video Reel publishing', false, true),
  ('video_storage_bucket', '"jalapeno-wing-videos"'::jsonb, 'Supabase Storage bucket for manually uploaded Jalapeno Reel videos', false, true),
  ('video_recent_reuse_days', '7'::jsonb, 'Minimum preferred days before reusing a video asset when enough inventory exists', false, true)
ON CONFLICT (setting_key) DO UPDATE
SET
  setting_value = EXCLUDED.setting_value,
  description = EXCLUDED.description,
  is_secret = EXCLUDED.is_secret,
  is_enabled = EXCLUDED.is_enabled,
  updated_at = now();

COMMIT;
