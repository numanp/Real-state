-- =====================================================================
-- 0027_dispatch_alerts.sql — Reel Estate
-- Saved-search push alerts, part 2: the FAN-OUT. dispatch_saved_search_alerts()
-- turns pending_push_alerts() (0026) into Expo push messages and POSTs them to
-- the Expo Push API via pg_net (net.http_post — async/fire-and-forget), then
-- advances each notified search's watermark. pg_cron runs it every 5 minutes.
--
-- Verification boundary: the SELECTION (who/what) and the watermark advance are
-- DB-verifiable; the actual delivery needs real Expo push tokens + an Expo
-- project (the client registers tokens on a native dev build).
--
-- Watermark advances ONLY for searches that had >= 1 device token in the batch,
-- so a user with no token isn't silently skipped past their matches.
-- =====================================================================

-- Single statement, single snapshot: `pending` is MATERIALIZED so
-- pending_push_alerts() runs exactly ONCE — building messages and advancing the
-- watermark from the same view. (The earlier two-call version could advance a
-- watermark past a listing published between the calls without notifying it.)
-- `advanced` (data-modifying CTE) always runs; `sent` runs because the final
-- SELECT references it. Only searches with a token (present in `batch`) advance.
CREATE OR REPLACE FUNCTION public.dispatch_saved_search_alerts()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH pending AS MATERIALIZED (
    SELECT * FROM public.pending_push_alerts()
  ),
  batch AS (
    SELECT a.saved_search_id, a.watermark,
           jsonb_build_object(
             'to',    t.token,
             'title', 'Nuevas propiedades',
             'body',  a.new_count::text || ' ' ||
                      CASE WHEN a.new_count = 1 THEN 'nueva' ELSE 'nuevas' END ||
                      ' en "' || a.name || '"',
             'data',  jsonb_build_object('saved_search_id', a.saved_search_id)) AS m
    FROM pending a
    JOIN public.device_push_tokens t ON t.user_id = a.user_id
  ),
  sent AS (
    SELECT net.http_post(
             url     := 'https://exp.host/--/api/v2/push/send',
             body    := (SELECT jsonb_agg(m) FROM batch),
             headers := jsonb_build_object('Content-Type', 'application/json')) AS req
    WHERE EXISTS (SELECT 1 FROM batch)
  ),
  advanced AS (
    UPDATE public.saved_searches s
      SET last_notified_at = b.watermark
      FROM (SELECT DISTINCT saved_search_id, watermark FROM batch) b
      WHERE s.id = b.saved_search_id
      RETURNING 1
  )
  SELECT (COALESCE((SELECT count(*) FROM batch), 0)
          + 0 * COALESCE((SELECT count(*) FROM sent), 0)
          + 0 * COALESCE((SELECT count(*) FROM advanced), 0))::integer;
$$;
REVOKE ALL ON FUNCTION public.dispatch_saved_search_alerts() FROM public, anon, authenticated;

-- Schedule every 5 minutes if pg_cron is available (wrapped; non-fatal if absent).
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('reel-estate-dispatch-alerts', '*/5 * * * *',
                          $job$ SELECT public.dispatch_saved_search_alerts(); $job$);
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron scheduling skipped: %', SQLERRM;
END;
$cron$;
