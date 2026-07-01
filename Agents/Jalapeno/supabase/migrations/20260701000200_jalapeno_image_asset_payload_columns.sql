BEGIN;

ALTER TABLE public.jalapeno_image_assets
  ADD COLUMN IF NOT EXISTS image_prompt text,
  ADD COLUMN IF NOT EXISTS image_source text,
  ADD COLUMN IF NOT EXISTS prompt_version text,
  ADD COLUMN IF NOT EXISTS prompt_quality integer,
  ADD COLUMN IF NOT EXISTS generation_time_ms integer,
  ADD COLUMN IF NOT EXISTS validation_status text,
  ADD COLUMN IF NOT EXISTS validation_reason text,
  ADD COLUMN IF NOT EXISTS image_model text,
  ADD COLUMN IF NOT EXISTS image_type text,
  ADD COLUMN IF NOT EXISTS storage_bucket text,
  ADD COLUMN IF NOT EXISTS storage_path text,
  ADD COLUMN IF NOT EXISTS file_size_bytes bigint,
  ADD COLUMN IF NOT EXISTS width integer,
  ADD COLUMN IF NOT EXISTS height integer,
  ADD COLUMN IF NOT EXISTS aspect_ratio numeric(8,4),
  ADD COLUMN IF NOT EXISTS format text,
  ADD COLUMN IF NOT EXISTS metadata jsonb;

COMMIT;
