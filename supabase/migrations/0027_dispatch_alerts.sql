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

CREATE OR REPLACE FUNCTION public.dispatch_saved_search_alerts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_msgs  jsonb;
  v_count integer;
  v_ids   uuid[];
BEGIN
  -- One message per (pending alert × the owner's device tokens). The JOIN means
  -- only searches whose owner has a token contribute (and set v_ids).
  SELECT jsonb_agg(jsonb_build_object(
           'to',    t.token,
           'title', 'Nuevas propiedades',
           'body',  a.new_count::text || ' ' ||
                    CASE WHEN a.new_count = 1 THEN 'nueva' ELSE 'nuevas' END ||
                    ' en "' || a.name || '"',
           'data',  jsonb_build_object('saved_search_id', a.saved_search_id))),
         count(*),
         array_agg(DISTINCT a.saved_search_id)
    INTO v_msgs, v_count, v_ids
  FROM public.pending_push_alerts() a
  JOIN public.device_push_tokens t ON t.user_id = a.user_id;

  IF COALESCE(v_count, 0) = 0 THEN
    RETURN 0;
  END IF;

  -- Fire-and-forget to Expo. pg_net enqueues; invalid tokens fail out-of-band
  -- (Expo returns per-message receipts we don't block on here).
  PERFORM net.http_post(
    url     := 'https://exp.host/--/api/v2/push/send',
    body    := v_msgs,
    headers := jsonb_build_object('Content-Type', 'application/json'));

  -- Advance the watermark only for the searches we actually notified.
  UPDATE public.saved_searches s
    SET last_notified_at = a.watermark
    FROM public.pending_push_alerts() a
    WHERE s.id = a.saved_search_id
      AND s.id = ANY (v_ids);

  RETURN v_count;
END;
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
