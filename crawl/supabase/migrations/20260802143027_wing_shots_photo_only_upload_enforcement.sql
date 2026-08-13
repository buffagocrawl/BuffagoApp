-- New Wing Shot uploads are photos only. The legacy media_type check remains
-- unchanged so existing video submissions and admin review records remain readable.
begin;

create or replace function public.reject_new_wing_video_upload_intent()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.media_type <> 'photo' then
    raise exception 'unsupported_media_type';
  end if;
  return new;
end;
$$;

drop trigger if exists wing_photo_only_upload_intent on public.wing_submission_upload_intents;
create trigger wing_photo_only_upload_intent
before insert on public.wing_submission_upload_intents
for each row execute function public.reject_new_wing_video_upload_intent();

revoke all on function public.reject_new_wing_video_upload_intent() from public;

commit;
