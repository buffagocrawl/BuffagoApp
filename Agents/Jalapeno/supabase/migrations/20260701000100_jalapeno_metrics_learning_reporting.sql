BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'jalapeno_post_metrics' AND column_name = 'collected_at'
  ) THEN
    ALTER TABLE public.jalapeno_post_metrics ADD COLUMN collected_at timestamptz;
  END IF;
END $$;

UPDATE public.jalapeno_post_metrics
SET collected_at = captured_at
WHERE collected_at IS NULL;

ALTER TABLE public.jalapeno_post_metrics
  ALTER COLUMN collected_at SET DEFAULT now();

DO $$
DECLARE
  column_spec record;
BEGIN
  FOR column_spec IN
    SELECT * FROM (VALUES
      ('post_age_hours', 'numeric(10,2)'),
      ('post_age_days', 'numeric(10,2)'),
      ('caption', 'text'),
      ('category', 'text'),
      ('prompt_template', 'text'),
      ('prompt_reason', 'text'),
      ('image_prompt', 'text'),
      ('image_style', 'text'),
      ('hashtags', 'text[] NOT NULL DEFAULT ARRAY[]::text[]'),
      ('cta_type', 'text'),
      ('generation_model', 'text'),
      ('image_model', 'text'),
      ('cost_metadata', 'jsonb NOT NULL DEFAULT ''{}''::jsonb'),
      ('published_at', 'timestamptz'),
      ('state', 'jsonb'),
      ('restaurant', 'jsonb'),
      ('topic', 'text'),
      ('metadata', 'jsonb NOT NULL DEFAULT ''{}''::jsonb')
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

CREATE TABLE IF NOT EXISTS public.jalapeno_performance_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generated_by_run_id uuid REFERENCES public.jalapeno_runs(run_id) ON DELETE SET NULL,
  summary_type text NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.jalapeno_report_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.jalapeno_runs(run_id) ON DELETE SET NULL,
  report_type text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  delivery_status text NOT NULL,
  recipient text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.jalapeno_performance_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jalapeno_report_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jalapeno_performance_summaries FORCE ROW LEVEL SECURITY;
ALTER TABLE public.jalapeno_report_logs FORCE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_jalapeno_post_metrics_collected_at_desc ON public.jalapeno_post_metrics(collected_at DESC);
CREATE INDEX IF NOT EXISTS idx_jalapeno_post_metrics_published_at_desc ON public.jalapeno_post_metrics(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_jalapeno_post_metrics_category ON public.jalapeno_post_metrics(category);
CREATE INDEX IF NOT EXISTS idx_jalapeno_post_metrics_image_style ON public.jalapeno_post_metrics(image_style);
CREATE INDEX IF NOT EXISTS idx_jalapeno_post_metrics_cta_type ON public.jalapeno_post_metrics(cta_type);

CREATE INDEX IF NOT EXISTS idx_jalapeno_posts_post_type ON public.jalapeno_posts(post_type);
CREATE INDEX IF NOT EXISTS idx_jalapeno_posts_metadata_category ON public.jalapeno_posts((metadata->>'category'));
CREATE INDEX IF NOT EXISTS idx_jalapeno_posts_metadata_image_style ON public.jalapeno_posts((metadata->>'image_style'));
CREATE INDEX IF NOT EXISTS idx_jalapeno_posts_metadata_cta_type ON public.jalapeno_posts((metadata->>'cta_type'));

CREATE INDEX IF NOT EXISTS idx_jalapeno_performance_summaries_type_period ON public.jalapeno_performance_summaries(summary_type, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_jalapeno_report_logs_type_created ON public.jalapeno_report_logs(report_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jalapeno_report_logs_delivery_status ON public.jalapeno_report_logs(delivery_status);

INSERT INTO public.jalapeno_settings (
  setting_key,
  setting_value,
  description,
  is_secret,
  is_enabled
) VALUES
  ('report_email_to', 'null'::jsonb, 'Optional report recipient, normally supplied by REPORT_EMAIL_TO', false, true),
  ('report_email_from', 'null'::jsonb, 'Optional report sender, normally supplied by REPORT_EMAIL_FROM', false, true),
  ('metrics_refresh_days', '30'::jsonb, 'Number of recent published days refreshed by Jalapeno metrics collector', false, true),
  ('image_quality_regeneration_enabled', 'true'::jsonb, 'Regenerate once when image quality validation fails before publishing', false, true)
ON CONFLICT (setting_key) DO UPDATE
SET
  description = EXCLUDED.description,
  is_secret = EXCLUDED.is_secret,
  is_enabled = EXCLUDED.is_enabled,
  updated_at = now();

COMMIT;
