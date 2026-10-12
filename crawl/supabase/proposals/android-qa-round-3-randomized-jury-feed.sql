-- REVIEW PROPOSAL ONLY. No production execution without explicit approval.
-- Private, expiring snapshot manifests keep randomized feed sessions stable.
-- Existing media/votes/moderation remain authoritative. No client catalog transfer.
BEGIN;
CREATE SCHEMA IF NOT EXISTS private;
CREATE TABLE IF NOT EXISTS private.wing_jury_feed_sessions (
  id uuid PRIMARY KEY, principal uuid, latitude double precision, longitude double precision,
  snapshot_at timestamptz NOT NULL, expires_at timestamptz NOT NULL,
  last_destination_id uuid, last_page integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS wing_jury_feed_sessions_expiry ON private.wing_jury_feed_sessions(expires_at);
-- Self-contained private session-creation admission log.
CREATE TABLE IF NOT EXISTS private.wing_jury_session_creation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  principal uuid,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS wing_jury_creation_rate_window ON private.wing_jury_session_creation_log(created_at);
CREATE INDEX IF NOT EXISTS wing_jury_creation_principal_window ON private.wing_jury_session_creation_log(principal,created_at);
ALTER TABLE private.wing_jury_session_creation_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.wing_jury_session_creation_log FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS private.wing_jury_feed_manifest (
  session_id uuid NOT NULL REFERENCES private.wing_jury_feed_sessions(id) ON DELETE CASCADE,
  submission_id uuid NOT NULL, destination_id uuid NOT NULL,
  tier integer NOT NULL, shuffle_key text NOT NULL, consumed boolean NOT NULL DEFAULT false,
  PRIMARY KEY(session_id,submission_id)
);
CREATE INDEX IF NOT EXISTS wing_jury_feed_manifest_remaining ON private.wing_jury_feed_manifest(session_id,tier,shuffle_key) WHERE NOT consumed;
CREATE TABLE IF NOT EXISTS private.wing_jury_feed_pages (
  session_id uuid NOT NULL REFERENCES private.wing_jury_feed_sessions(id) ON DELETE CASCADE,
  page_number integer NOT NULL, submission_ids uuid[] NOT NULL,
  PRIMARY KEY(session_id,page_number)
);
ALTER TABLE private.wing_jury_feed_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.wing_jury_feed_manifest ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.wing_jury_feed_pages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.wing_jury_feed_sessions,private.wing_jury_feed_manifest,private.wing_jury_feed_pages FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.wing_jury_randomized_feed_candidates(
  p_latitude double precision,p_longitude double precision,p_user_id uuid,p_judged_submission_ids uuid[],
  p_session_id uuid,p_snapshot_at timestamptz,p_after_page integer,p_limit integer
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $function$
DECLARE
  v_session private.wing_jury_feed_sessions%rowtype;
  v_selected uuid[] := '{}'::uuid[];
  v_choice record;
  v_tier integer;
  v_count integer;
  v_now timestamptz;
  v_page integer := coalesce(p_after_page,0)+1;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 24 THEN RAISE EXCEPTION 'invalid_feed_limit'; END IF;
  IF p_session_id IS NULL OR p_snapshot_at IS NULL OR NOT isfinite(p_snapshot_at)
    OR p_snapshot_at > clock_timestamp()
    OR p_after_page IS NULL OR p_after_page < 0 THEN RAISE EXCEPTION 'invalid_feed_session'; END IF;
  IF (p_latitude IS NULL) <> (p_longitude IS NULL) OR
    (p_latitude IS NOT NULL AND NOT(p_latitude BETWEEN -90 AND 90 AND p_longitude BETWEEN -180 AND 180)) THEN RAISE EXCEPTION 'invalid_feed_location'; END IF;
  IF cardinality(p_judged_submission_ids)>500 OR array_position(p_judged_submission_ids,NULL) IS NOT NULL THEN RAISE EXCEPTION 'invalid_feed_exclusions'; END IF;
  -- Serialize allocation and retry for a session without exposing private tables.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_session_id::text,0));
  -- Explicit expiry checks below enforce TTL independently of housekeeping.
  -- Bounded TTL cleanup; unfinished sessions cannot grow indefinitely over time.
  DELETE FROM private.wing_jury_feed_sessions expired WHERE expired.id IN (
    SELECT session.id FROM private.wing_jury_feed_sessions session WHERE session.expires_at<clock_timestamp() ORDER BY session.expires_at LIMIT 20 FOR UPDATE SKIP LOCKED
  );
  SELECT * INTO v_session FROM private.wing_jury_feed_sessions session WHERE session.id=p_session_id FOR UPDATE;
  IF NOT FOUND THEN
    IF p_after_page<>0 OR p_snapshot_at<=clock_timestamp()-interval '15 minutes' THEN RAISE EXCEPTION 'expired_feed_session'; END IF;
    -- Dedicated private creation log. Serialize count/insert
    -- across all new sessions; no client IP, guest ID or session ID is a rate key.
    PERFORM pg_advisory_xact_lock(hashtextextended('wing_jury_randomized_creation',0));
    v_now:=clock_timestamp();
    DELETE FROM private.wing_jury_session_creation_log WHERE id IN (
      SELECT id FROM private.wing_jury_session_creation_log WHERE created_at<v_now-interval '1 hour' ORDER BY created_at LIMIT 200 FOR UPDATE SKIP LOCKED
    );
    IF (SELECT count(*) FROM private.wing_jury_session_creation_log WHERE created_at>=v_now-interval '1 minute')>=120
      OR (SELECT count(*) FROM private.wing_jury_session_creation_log)>=1000
      OR (SELECT count(*) FROM private.wing_jury_session_creation_log WHERE principal IS NOT DISTINCT FROM p_user_id AND created_at>=v_now-interval '1 minute')>=(CASE WHEN p_user_id IS NULL THEN 30 ELSE 10 END)
      OR (SELECT count(*) FROM private.wing_jury_session_creation_log WHERE principal IS NOT DISTINCT FROM p_user_id AND created_at>=v_now-interval '1 hour')>=(CASE WHEN p_user_id IS NULL THEN 300 ELSE 60 END)
      OR (SELECT count(*) FROM private.wing_jury_feed_sessions)>=1000 THEN
      -- Return instead of raising so bounded housekeeping commits on rejection.
      RETURN jsonb_build_object('error','feed_rate_limited');
    END IF;
    INSERT INTO private.wing_jury_session_creation_log(principal,created_at)
      VALUES(p_user_id,v_now);
    INSERT INTO private.wing_jury_feed_sessions(id,principal,latitude,longitude,snapshot_at,expires_at)
      VALUES(p_session_id,p_user_id,p_latitude,p_longitude,p_snapshot_at,p_snapshot_at+interval '15 minutes') RETURNING * INTO v_session;
    INSERT INTO private.wing_jury_feed_manifest(session_id,submission_id,destination_id,tier,shuffle_key)
      WITH candidates AS (
        SELECT photo.id,photo.destination_id,
          CASE WHEN p_latitude IS NOT NULL AND destination.lat BETWEEN -90 AND 90 AND destination.lng BETWEEN -180 AND 180
          THEN 2*6371000*asin(sqrt(least(1::double precision,greatest(0::double precision,
            power(sin(radians(destination.lat::double precision-p_latitude)/2),2)
            +cos(radians(p_latitude))*cos(radians(destination.lat::double precision))*power(sin(radians(destination.lng::double precision-p_longitude)/2),2))))) ELSE NULL END AS distance
        FROM public.wing_media_submissions photo JOIN public.destinations destination ON destination.id=photo.destination_id
        WHERE photo.created_at<=p_snapshot_at AND private.is_public_wing_jury_photo(photo.id)
          AND (p_user_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.wing_jury_votes vote WHERE vote.submission_id=photo.id AND vote.user_id=p_user_id))
          AND (p_user_id IS NOT NULL OR NOT(photo.id=ANY(coalesce(p_judged_submission_ids,'{}'::uuid[]))))
      )
      SELECT p_session_id,candidate.id,candidate.destination_id,
        CASE WHEN candidate.distance IS NULL THEN 4 WHEN candidate.distance<=25*1609.344 THEN 0
          WHEN candidate.distance<=50*1609.344 THEN 1 WHEN candidate.distance<=100*1609.344 THEN 2
          WHEN candidate.distance<=250*1609.344 THEN 3 ELSE 4 END,
        md5(p_session_id::text||candidate.id::text) FROM candidates candidate LIMIT 10001;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count>10000 OR (SELECT count(*) FROM private.wing_jury_feed_manifest)>250000 THEN
      DELETE FROM private.wing_jury_feed_sessions WHERE id=p_session_id;
      RETURN jsonb_build_object('error','feed_capacity_exceeded');
    END IF;
  ELSIF v_session.expires_at<=clock_timestamp() THEN
    RAISE EXCEPTION 'expired_feed_session';
  ELSIF v_session.snapshot_at IS DISTINCT FROM p_snapshot_at THEN
    RAISE EXCEPTION 'invalid_feed_snapshot';
  ELSIF v_session.principal IS DISTINCT FROM p_user_id OR v_session.latitude IS DISTINCT FROM p_latitude
    OR v_session.longitude IS DISTINCT FROM p_longitude
    THEN RAISE EXCEPTION 'invalid_feed_session'; END IF;
  UPDATE private.wing_jury_feed_sessions session SET expires_at=least(session.snapshot_at+interval '24 hours',clock_timestamp()+interval '24 hours') WHERE session.id=p_session_id;
  SELECT page.submission_ids INTO v_selected FROM private.wing_jury_feed_pages page WHERE page.session_id=p_session_id AND page.page_number=v_page;
  IF NOT FOUND THEN
    IF v_page>10001 OR (SELECT count(*) FROM private.wing_jury_feed_pages)>=250000 THEN RETURN jsonb_build_object('error','feed_capacity_exceeded'); END IF;
    IF p_after_page<>v_session.last_page THEN RAISE EXCEPTION 'invalid_feed_page'; END IF;
    -- Discard new withdrawals/votes without renumbering the remaining snapshot.
    UPDATE private.wing_jury_feed_manifest manifest SET consumed=true
      WHERE manifest.session_id=p_session_id AND NOT manifest.consumed AND (
        NOT private.is_public_wing_jury_photo(manifest.submission_id)
        OR (p_user_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.wing_jury_votes vote WHERE vote.submission_id=manifest.submission_id AND vote.user_id=p_user_id))
        OR (p_user_id IS NULL AND manifest.submission_id=ANY(coalesce(p_judged_submission_ids,'{}'::uuid[])))
      );
    v_selected:='{}'::uuid[];
    FOR photo_number IN 1..p_limit LOOP
      SELECT min(manifest.tier) INTO v_tier FROM private.wing_jury_feed_manifest manifest WHERE manifest.session_id=p_session_id AND NOT manifest.consumed;
      EXIT WHEN v_tier IS NULL;
      SELECT manifest.submission_id,manifest.destination_id INTO v_choice
        FROM private.wing_jury_feed_manifest manifest WHERE manifest.session_id=p_session_id AND NOT manifest.consumed AND manifest.tier=v_tier
        ORDER BY (manifest.destination_id IS NOT DISTINCT FROM v_session.last_destination_id),manifest.shuffle_key,manifest.submission_id LIMIT 1;
      UPDATE private.wing_jury_feed_manifest manifest SET consumed=true WHERE manifest.session_id=p_session_id AND manifest.submission_id=v_choice.submission_id;
      v_selected:=array_append(v_selected,v_choice.submission_id);
      v_session.last_destination_id:=v_choice.destination_id;
    END LOOP;
    INSERT INTO private.wing_jury_feed_pages VALUES(p_session_id,v_page,v_selected);
    UPDATE private.wing_jury_feed_sessions session SET last_page=v_page,last_destination_id=v_session.last_destination_id WHERE session.id=p_session_id;
  END IF;
  RETURN jsonb_build_object(
    'page_number',v_page,
    'snapshot_at',to_char(v_session.snapshot_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'has_more',EXISTS(SELECT 1 FROM private.wing_jury_feed_manifest manifest WHERE manifest.session_id=p_session_id AND NOT manifest.consumed)
      OR EXISTS(SELECT 1 FROM private.wing_jury_feed_pages page WHERE page.session_id=p_session_id AND page.page_number>v_page),
    'candidates',coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id',photo.id,'destination_id',photo.destination_id,'user_id',photo.user_id,
        'media_type',photo.media_type,'status',photo.status,'processed_storage_path',photo.processed_storage_path,
        'owner_deleted_at',photo.owner_deleted_at,'withdrawn_at',photo.withdrawn_at,'consent_version',photo.consent_version,
        'consented_at',photo.consented_at,'attribution_preference',photo.attribution_preference,
        'created_at',to_char(photo.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'page_number',v_page
      ) ORDER BY selected.ordinal)
      FROM unnest(v_selected) WITH ORDINALITY selected(id,ordinal) JOIN public.wing_media_submissions photo ON photo.id=selected.id
      WHERE private.is_public_wing_jury_photo(photo.id)
        AND (p_user_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.wing_jury_votes vote WHERE vote.submission_id=photo.id AND vote.user_id=p_user_id))
        AND (p_user_id IS NOT NULL OR NOT(photo.id=ANY(coalesce(p_judged_submission_ids,'{}'::uuid[]))))
    ),'[]'::jsonb)
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.wing_jury_randomized_feed_candidates(double precision,double precision,uuid,uuid[],uuid,timestamptz,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wing_jury_randomized_feed_candidates(double precision,double precision,uuid,uuid[],uuid,timestamptz,integer,integer) TO service_role;
-- Server-only lookup lets the Edge boundary replay the exact immutable timestamp.
CREATE OR REPLACE FUNCTION public.wing_jury_randomized_session_snapshot(
  p_session_id uuid,p_user_id uuid,p_latitude double precision,p_longitude double precision
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $snapshot$
DECLARE v_session private.wing_jury_feed_sessions%rowtype;
BEGIN
  SELECT * INTO v_session FROM private.wing_jury_feed_sessions WHERE id=p_session_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_session.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'expired_feed_session'; END IF;
  IF v_session.principal IS DISTINCT FROM p_user_id OR v_session.latitude IS DISTINCT FROM p_latitude
    OR v_session.longitude IS DISTINCT FROM p_longitude THEN RAISE EXCEPTION 'invalid_feed_session'; END IF;
  RETURN to_char(v_session.snapshot_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
END; $snapshot$;
REVOKE ALL ON FUNCTION public.wing_jury_randomized_session_snapshot(uuid,uuid,double precision,double precision) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wing_jury_randomized_session_snapshot(uuid,uuid,double precision,double precision) TO service_role;
COMMIT;
