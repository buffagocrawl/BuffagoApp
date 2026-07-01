BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'jalapeno_image_assets'
      AND column_name = 'quality_score'
  ) THEN
    ALTER TABLE public.jalapeno_image_assets
      ADD COLUMN quality_score integer;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'jalapeno_instagram_posts'
      AND column_name = 'quality_score'
  ) THEN
    ALTER TABLE public.jalapeno_instagram_posts
      ADD COLUMN quality_score integer;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'jalapeno_instagram_posts'
      AND column_name = 'image_source'
  ) THEN
    ALTER TABLE public.jalapeno_instagram_posts
      ADD COLUMN image_source text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'jalapeno_instagram_posts'
      AND column_name = 'image_validation_status'
  ) THEN
    ALTER TABLE public.jalapeno_instagram_posts
      ADD COLUMN image_validation_status text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'jalapeno_instagram_posts'
      AND column_name = 'image_validation_reason'
  ) THEN
    ALTER TABLE public.jalapeno_instagram_posts
      ADD COLUMN image_validation_reason text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'jalapeno_instagram_posts'
      AND column_name = 'prompt_quality'
  ) THEN
    ALTER TABLE public.jalapeno_instagram_posts
      ADD COLUMN prompt_quality integer;
  END IF;
END $$;

COMMIT;
