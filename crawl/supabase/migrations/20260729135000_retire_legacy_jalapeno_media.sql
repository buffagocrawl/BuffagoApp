begin;

-- Historical Jalapeno media records remain available for audit, but the
-- fabricated/reusable asset pools must no longer be publicly addressable or
-- eligible for future selection.
update storage.buckets
set public = false
where id in ('jalapeno-assets', 'jalapeno-wing-videos');

do $$
begin
  if to_regclass('public.jalapeno_video_assets') is not null then
    execute 'update public.jalapeno_video_assets set active = false, updated_at = now() where active';
  end if;

  if to_regclass('public.jalapeno_settings') is not null then
    execute $sql$
      update public.jalapeno_settings
      set is_enabled = false,
          updated_at = now()
      where setting_key in (
        'auto_publish_enabled',
        'image_generation_enabled',
        'instagram_auto_publish_enabled',
        'video_post_time',
        'video_storage_bucket',
        'video_recent_reuse_days'
      )
    $sql$;
  end if;
end
$$;

commit;
