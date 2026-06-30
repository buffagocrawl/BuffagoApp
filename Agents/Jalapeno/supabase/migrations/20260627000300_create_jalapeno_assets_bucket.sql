BEGIN;

INSERT INTO storage.buckets (id, name, public)
VALUES ('jalapeno-assets', 'jalapeno-assets', true)
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  public = EXCLUDED.public;

COMMIT;
