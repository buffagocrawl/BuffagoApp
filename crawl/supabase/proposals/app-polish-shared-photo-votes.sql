-- LOCAL PROPOSAL ONLY. Review and release with the gallery/Jury functions and
-- client. Requires the deployed Wing Jury foundation. Never run automatically.
begin;
-- Bound acquisition during deployment: retry the whole transaction in a quiet
-- window rather than holding partially installed contracts indefinitely.
set local lock_timeout = '5s';
set local statement_timeout = '60s';
lock table public.wing_media_photo_votes, public.wing_jury_votes in share row exclusive mode;
-- A previously installed prototype stamped mirror times into Gallery. Those
-- are not original action times: never reinterpret them as chronology.
do $prior_bridge$
begin
 if to_regclass('private.photo_vote_bridge_legacy_snapshot') is not null
   and to_regclass('private.photo_vote_bridge_jury_snapshot') is null then
  raise exception 'photo_vote_reconciliation_prior_bridge_requires_review' using errcode='22023';
 end if;
end;$prior_bridge$;
create table if not exists private.photo_vote_bridge_legacy_snapshot (
 submission_id uuid not null references public.wing_media_submissions(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade, original_row jsonb not null,
 primary key(submission_id,user_id)
);
alter table private.photo_vote_bridge_legacy_snapshot enable row level security;
revoke all on private.photo_vote_bridge_legacy_snapshot from public,anon,authenticated,service_role;
insert into private.photo_vote_bridge_legacy_snapshot
 select submission_id,user_id,to_jsonb(v) from public.wing_media_photo_votes v
 on conflict do nothing;
-- Preserve BOTH original stores before reconciling. Account/media erasure still
-- cascades; snapshots are audit material, never a restore-over-current script.
create table if not exists private.photo_vote_bridge_jury_snapshot (
 submission_id uuid not null references public.wing_media_submissions(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade, original_row jsonb not null,
 primary key(submission_id,user_id)
);
alter table private.photo_vote_bridge_jury_snapshot enable row level security;
revoke all on private.photo_vote_bridge_jury_snapshot from public,anon,authenticated,service_role;
insert into private.photo_vote_bridge_jury_snapshot
 select submission_id,user_id,to_jsonb(v) from public.wing_jury_votes v
 on conflict do nothing;
-- Never break a contradictory exact tie or accept unusable chronology. Missing
-- historical withdrawals cannot be detected here: release preflight must flag
-- that history gap; absence of a row is NOT a recorded withdrawal.
do $chronology$
begin
 if exists(select 1 from public.wing_media_photo_votes l
   join public.wing_jury_votes j using(submission_id,user_id)
   join auth.users a on a.id=l.user_id and not a.is_anonymous
   where private.is_public_wing_jury_photo(l.submission_id) and l.vote<>j.vote
   and (l.updated_at is null or l.created_at is null or j.created_at is null
     or not isfinite(l.updated_at) or not isfinite(l.created_at) or not isfinite(j.created_at)
     or l.updated_at<l.created_at or l.updated_at>now() or j.created_at>now()
     or l.updated_at=j.created_at)) then
  raise exception 'photo_vote_reconciliation_history_requires_review' using errcode='22023';
 end if;
end;$chronology$;
-- Old controls still send +/-1; 0 represents a shared neutral verdict when a
-- new client voted. Old controls show neither Like nor Dislike selected.
alter table public.wing_media_photo_votes drop constraint if exists wing_media_photo_votes_vote_check;
alter table public.wing_media_photo_votes add constraint wing_media_photo_votes_vote_check check(vote in (-1,0,1));

create or replace function private.lock_photo_vote_actor()
returns trigger language plpgsql security definer set search_path=pg_catalog as $fn$
declare actor uuid;
begin
 -- Nested mirror/FK actions already belong to the outer transaction.
 if pg_trigger_depth()>1 then return null; end if;
 actor:=private.require_authenticated_user();
 perform pg_advisory_xact_lock(hashtextextended('buffago-photo-vote-actor:'||actor::text,0));
 perform 1 from auth.users where id=actor and not is_anonymous for key share;
 if not found then raise exception 'authentication_required' using errcode='42501';end if;
 return null;
end;$fn$;
create or replace function private.lock_legacy_photo_vote()
returns trigger language plpgsql security definer set search_path=pg_catalog as $fn$
begin
 if tg_op='DELETE' and (not exists(select 1 from auth.users where id=old.user_id)
   or not exists(select 1 from public.wing_media_submissions where id=old.submission_id)) then return old;end if;
 -- Same-user statement lock precedes UPDATE row locks. Parent exclusive lock
 -- prevents SHARE-to-UPDATE upgrades when projecting canonical totals.
 -- A legacy UPDATE/DELETE has already locked its own vote row. Never wait
 -- on a parent held by concurrent media deletion (which may need that row).
 -- Return PostgreSQL's retryable 55P03; the old controller rolls back its
 -- optimistic vote and already asks the user to retry.
 perform 1 from public.wing_media_submissions where id=coalesce(new.submission_id,old.submission_id) for update nowait;
 return coalesce(new,old);
end;$fn$;
create or replace function private.project_photo_vote_counts(photo_id uuid)
returns void language sql security definer set search_path=pg_catalog as $fn$
 update public.wing_media_submissions s set like_count=coalesce(c.like_count,0),dislike_count=coalesce(c.dislike_count,0)
 from (select (select like_count from public.wing_jury_photo_vote_counts where submission_id=photo_id) like_count,
              (select dislike_count from public.wing_jury_photo_vote_counts where submission_id=photo_id) dislike_count) c
 where s.id=photo_id;
$fn$;
-- Legacy totals become a projection, never a second counting implementation.
create or replace function private.refresh_wing_media_photo_vote_counts()
returns trigger language plpgsql security definer set search_path=pg_catalog as $fn$
begin perform private.project_photo_vote_counts(coalesce(new.submission_id,old.submission_id));return coalesce(new,old);end;$fn$;

create or replace function private.bridge_photo_vote()
returns trigger language plpgsql security definer set search_path=pg_catalog as $fn$
declare photo_id uuid:=coalesce(new.submission_id,old.submission_id);
 actor uuid:=coalesce(new.user_id,old.user_id); previous text:=current_setting('buffago.photo_vote_edit',true);
begin
 if pg_trigger_depth()>1 or current_setting('buffago.photo_vote_bridge_initial',true)='on' then return coalesce(new,old);end if;
 if not exists(select 1 from auth.users where id=actor) or not exists(select 1 from public.wing_media_submissions where id=photo_id) then
   perform private.project_photo_vote_counts(photo_id);return coalesce(new,old);end if;
 if tg_table_name='wing_media_photo_votes' then
   if actor is distinct from private.require_authenticated_user() then raise exception 'wing_jury_vote_owner_mismatch' using errcode='42501';end if;
   perform set_config('buffago.photo_vote_edit','on',true);
   delete from public.wing_jury_votes where submission_id=photo_id and user_id=actor;
   perform set_config('buffago.photo_vote_edit',coalesce(previous,''),true);
   if tg_op<>'DELETE' then insert into public.wing_jury_votes(submission_id,user_id,vote) values(photo_id,actor,new.vote);end if;
 else
   if tg_op='DELETE' then delete from public.wing_media_photo_votes where submission_id=photo_id and user_id=actor;
   else insert into public.wing_media_photo_votes(submission_id,user_id,vote) values(photo_id,actor,new.vote)
     on conflict(submission_id,user_id) do update set vote=excluded.vote;end if;
 end if;
 perform private.project_photo_vote_counts(photo_id);
 return coalesce(new,old);
end;$fn$;
drop trigger if exists aa_photo_vote_actor on public.wing_media_photo_votes;
create trigger aa_photo_vote_actor before insert or update or delete on public.wing_media_photo_votes for each statement execute function private.lock_photo_vote_actor();
drop trigger if exists aa_photo_vote_actor on public.wing_jury_votes;
create trigger aa_photo_vote_actor before insert or update or delete on public.wing_jury_votes for each statement execute function private.lock_photo_vote_actor();
drop trigger if exists aa_legacy_photo_vote_lock on public.wing_media_photo_votes;
create trigger aa_legacy_photo_vote_lock before insert or update or delete on public.wing_media_photo_votes for each row execute function private.lock_legacy_photo_vote();
drop trigger if exists zz_photo_vote_bridge on public.wing_media_photo_votes;
create trigger zz_photo_vote_bridge after insert or update or delete on public.wing_media_photo_votes for each row execute function private.bridge_photo_vote();
drop trigger if exists zz_photo_vote_bridge on public.wing_jury_votes;
create trigger zz_photo_vote_bridge after insert or delete on public.wing_jury_votes for each row execute function private.bridge_photo_vote();
revoke all on function private.lock_photo_vote_actor(),private.lock_legacy_photo_vote(),private.project_photo_vote_counts(uuid),private.refresh_wing_media_photo_vote_counts(),private.bridge_photo_vote() from public,anon,authenticated,service_role;


-- Use the same lock for blind Jury inserts and editable detail/reveal votes.
-- The original eligibility and ownership validation remains in force.
create or replace function private.validate_wing_jury_vote_insert()
returns trigger language plpgsql security definer set search_path = pg_catalog
as $function$
declare v_user_id uuid := private.require_authenticated_user();
begin
  if new.user_id is distinct from v_user_id then
    raise exception 'wing_jury_vote_owner_mismatch' using errcode = '42501';
  end if;
  perform 1 from public.wing_media_submissions where id = new.submission_id for update;
  perform pg_advisory_xact_lock(hashtextextended('buffago-photo-vote:' || v_user_id::text || ':' || new.submission_id::text, 0));
  perform 1 from storage.objects where bucket_id = 'wing-submissions'
    and name = 'processed/' || new.submission_id::text || '/primary' for update;
  if not private.is_public_wing_jury_photo(new.submission_id) then
    raise exception 'photo_is_not_eligible_for_wing_jury' using errcode = '42501';
  end if;
  return new;
end;
$function$;

-- Direct Jury inserts retain their unique-key duplicate protection. Only the
-- authenticated RPC below can withdraw/replace a verdict. No table write grant
-- is added, and the caller cannot nominate another user.
create or replace function private.enforce_wing_jury_vote_immutability()
returns trigger language plpgsql security definer set search_path = pg_catalog
as $function$
begin
  perform 1 from public.wing_media_submissions where id=old.submission_id for update;
  if tg_op = 'DELETE' and not exists (
    select 1 from auth.users where id = old.user_id
  ) then return old; end if;
  -- Preserve the deployed media-parent FK cascade as well as account deletion.
  if tg_op = 'DELETE' and not exists (
    select 1 from public.wing_media_submissions where id = old.submission_id
  ) then return old; end if;
  if tg_op = 'DELETE'
     and current_setting('buffago.photo_vote_edit', true) = 'on'
     and old.user_id = private.require_authenticated_user() then return old; end if;
  raise exception 'wing_jury_vote_is_immutable' using errcode = '42501';
end;
$function$;

create or replace function public.set_wing_jury_photo_vote(p_submission_id uuid, p_vote smallint)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $function$
declare
  v_user_id uuid := private.require_authenticated_user();
  v_previous text := current_setting('buffago.photo_vote_edit', true);
  v_counts public.wing_jury_photo_vote_counts%rowtype;
begin
  if p_vote is not null and p_vote not in (-1,0,1) then
    raise exception 'invalid_vote' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('buffago-photo-vote-actor:' || v_user_id::text,0));
  perform 1 from auth.users where id = v_user_id and not is_anonymous for key share;
  if not found then raise exception 'authentication_required' using errcode = '42501'; end if;
  perform 1 from public.wing_media_submissions where id = p_submission_id for update;
  perform pg_advisory_xact_lock(hashtextextended('buffago-photo-vote:' || v_user_id::text || ':' || p_submission_id::text, 0));
  perform 1 from storage.objects where bucket_id = 'wing-submissions'
    and name = 'processed/' || p_submission_id::text || '/primary' for update;
  if not private.is_public_wing_jury_photo(p_submission_id) then
    raise exception 'photo_is_not_eligible_for_wing_jury' using errcode = '42501';
  end if;
  perform set_config('buffago.photo_vote_edit', 'on', true);
  delete from public.wing_jury_votes where submission_id = p_submission_id and user_id = v_user_id;
  perform set_config('buffago.photo_vote_edit', coalesce(v_previous, ''), true);
  if p_vote is not null then
    insert into public.wing_jury_votes(submission_id,user_id,vote) values(p_submission_id,v_user_id,p_vote);
  end if;
  select * into v_counts from public.wing_jury_photo_vote_counts where submission_id = p_submission_id;
  return jsonb_build_object('submission_id', p_submission_id, 'vote', p_vote,
    'like_count', coalesce(v_counts.like_count,0), 'neutral_count', coalesce(v_counts.neutral_count,0),
    'dislike_count', coalesce(v_counts.dislike_count,0));
end;
$function$;
revoke all on function public.set_wing_jury_photo_vote(uuid,smallint) from public, anon, service_role;
grant execute on function public.set_wing_jury_photo_vote(uuid,smallint) to authenticated;

-- Latest valid RECORDED action wins eligible conflicts, not table precedence.
-- Gallery updated_at is validator-stamped; Jury created_at records its verdict.
-- Neutral (0) is a verdict, not withdrawal. Unknown historical deletes remain
-- a release review gate. Failed/withdrawn media is never revived/backfilled.
do $backfill$
declare
  v_row record;
  v_sub text := current_setting('request.jwt.claim.sub',true);
  v_claims text := current_setting('request.jwt.claims',true);
begin
  for v_row in select l.* from public.wing_media_photo_votes l
    join public.wing_jury_votes j using(submission_id,user_id)
    join auth.users a on a.id=l.user_id and not a.is_anonymous
    where private.is_public_wing_jury_photo(l.submission_id)
      and l.vote<>j.vote and l.updated_at>j.created_at
    order by l.submission_id,l.user_id
  loop
    perform set_config('request.jwt.claim.sub',v_row.user_id::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',v_row.user_id,'is_anonymous',false)::text,true);
    perform set_config('buffago.photo_vote_bridge_initial','on',true);
    perform set_config('buffago.photo_vote_edit','on',true);
    delete from public.wing_jury_votes where submission_id=v_row.submission_id and user_id=v_row.user_id;
    perform set_config('buffago.photo_vote_edit','',true);
    insert into public.wing_jury_votes(submission_id,user_id,vote,created_at)
      values(v_row.submission_id,v_row.user_id,v_row.vote,v_row.updated_at);
    perform set_config('buffago.photo_vote_bridge_initial','',true);
  end loop;
  for v_row in select vote.* from public.wing_media_photo_votes vote
    join auth.users account on account.id=vote.user_id and not account.is_anonymous
    where private.is_public_wing_jury_photo(vote.submission_id)
    order by vote.submission_id,vote.user_id
  loop
    perform set_config('request.jwt.claim.sub',v_row.user_id::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',v_row.user_id,'is_anonymous',false)::text,true);
    insert into public.wing_jury_votes(submission_id,user_id,vote)
      values(v_row.submission_id,v_row.user_id,v_row.vote) on conflict do nothing;
  end loop;
  perform set_config('request.jwt.claim.sub',coalesce(v_sub,''),true);
  perform set_config('request.jwt.claims',coalesce(v_claims,'{}'),true);
  for v_row in select vote.* from public.wing_jury_votes vote
    join auth.users account on account.id=vote.user_id and not account.is_anonymous
    where private.is_public_wing_jury_photo(vote.submission_id)
    order by vote.submission_id,vote.user_id
  loop
    perform set_config('request.jwt.claim.sub',v_row.user_id::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',v_row.user_id,'is_anonymous',false)::text,true);
    -- Skip legacy->Jury replacement while normalizing the initial mirror.
    perform set_config('buffago.photo_vote_bridge_initial','on',true);
    insert into public.wing_media_photo_votes(submission_id,user_id,vote) values(v_row.submission_id,v_row.user_id,v_row.vote)
      on conflict(submission_id,user_id) do update set vote=excluded.vote;
    perform set_config('buffago.photo_vote_bridge_initial','',true);
    perform private.project_photo_vote_counts(v_row.submission_id);
  end loop;
  perform set_config('request.jwt.claim.sub',coalesce(v_sub,''),true);
  perform set_config('request.jwt.claims',coalesce(v_claims,'{}'),true);
end;
$backfill$;
commit;
