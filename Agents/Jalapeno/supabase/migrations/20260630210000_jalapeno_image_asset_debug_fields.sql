BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'jalapeno_image_assets'
      AND column_name = 'image_source'
  ) THEN
    ALTER TABLE public.jalapeno_image_assets
      ADD COLUMN image_source text NOT NULL DEFAULT 'unknown';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'jalapeno_image_assets'
      AND column_name = 'image_prompt'
  ) THEN
    ALTER TABLE public.jalapeno_image_assets
      ADD COLUMN image_prompt text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'jalapeno_image_assets'
      AND column_name = 'prompt_quality'
  ) THEN
    ALTER TABLE public.jalapeno_image_assets
      ADD COLUMN prompt_quality integer NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'jalapeno_image_assets'
      AND column_name = 'validation_reason'
  ) THEN
    ALTER TABLE public.jalapeno_image_assets
      ADD COLUMN validation_reason text;
  END IF;
END $$;

COMMIT;
