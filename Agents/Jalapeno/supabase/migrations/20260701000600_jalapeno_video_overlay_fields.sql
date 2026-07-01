BEGIN;

ALTER TABLE public.jalapeno_posts
  ADD COLUMN IF NOT EXISTS original_video_url text,
  ADD COLUMN IF NOT EXISTS processed_video_url text,
  ADD COLUMN IF NOT EXISTS original_storage_path text,
  ADD COLUMN IF NOT EXISTS processed_storage_path text,
  ADD COLUMN IF NOT EXISTS overlay_text text,
  ADD COLUMN IF NOT EXISTS overlay_status text,
  ADD COLUMN IF NOT EXISTS overlay_error text;

ALTER TABLE public.jalapeno_instagram_posts
  ADD COLUMN IF NOT EXISTS original_video_url text,
  ADD COLUMN IF NOT EXISTS processed_video_url text,
  ADD COLUMN IF NOT EXISTS original_storage_path text,
  ADD COLUMN IF NOT EXISTS processed_storage_path text,
  ADD COLUMN IF NOT EXISTS overlay_text text,
  ADD COLUMN IF NOT EXISTS overlay_status text,
  ADD COLUMN IF NOT EXISTS overlay_error text;

CREATE INDEX IF NOT EXISTS idx_jalapeno_posts_overlay_status
  ON public.jalapeno_posts(overlay_status);

CREATE INDEX IF NOT EXISTS idx_jalapeno_instagram_posts_overlay_status
  ON public.jalapeno_instagram_posts(overlay_status);

COMMIT;
