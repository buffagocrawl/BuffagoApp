-- ISOLATED LOCAL STACK ONLY. Already present in the inspected deployed schema.
-- Apply as supabase_admin (Storage owner), not as a production migration.
alter table storage.objects add column if not exists archived_at timestamptz;
alter table storage.objects add column if not exists is_delete_marker boolean not null default false;
