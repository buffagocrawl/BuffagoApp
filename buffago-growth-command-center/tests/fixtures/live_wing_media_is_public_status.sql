CREATE OR REPLACE FUNCTION public.wing_media_is_public_status(p_status text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog'
AS $function$ select p_status in ('approved','generation_pending','ready_to_post','scheduled','posting','posted') $function$;
