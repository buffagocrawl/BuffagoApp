BEGIN;

ALTER TABLE public.jalapeno_video_assets
  ADD COLUMN IF NOT EXISTS reuse_enabled boolean NOT NULL DEFAULT true;

UPDATE public.jalapeno_video_assets
SET reuse_enabled = true
WHERE reuse_enabled IS NULL;

UPDATE public.jalapeno_video_assets
SET reuse_enabled = false
WHERE storage_path IN ('1593.mp4', '1594.mp4');

COMMIT;
