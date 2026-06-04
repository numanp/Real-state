-- =====================================================================
-- 0024_feed_events_retention.sql — Reel Estate
-- Table hygiene: feed_events is append-only and grows with every view/scroll.
-- Add a retention purge (mirrors purge_soft_deleted in 0007) + a nightly
-- pg_cron job. Definer, REVOKE'd from clients — only pg_cron (as the job
-- owner) and the trusted service_role ever run it.
--
-- TRADEOFF: ranked_feed (0019) derives both the taste profile and the
-- "already-acted" exclusion from the user's feed_events history. Purging old
-- events means a property a user passed on > retention ago can resurface in
-- "Para vos" — acceptable (tastes and listings change); recent signal, which
-- dominates ranking, is fully retained. Default window: 180 days.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.purge_feed_events(p_retention interval DEFAULT interval '180 days')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.feed_events
    WHERE created_at < now() - p_retention;
END;
$$;
REVOKE ALL ON FUNCTION public.purge_feed_events(interval) FROM public, anon, authenticated;

-- Schedule nightly if pg_cron is available; otherwise skip silently (mirrors
-- the wrapped scheduling in 0007 so a missing pg_cron never breaks the migration).
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('reel-estate-purge-feed-events', '23 3 * * *',
                          $job$ SELECT public.purge_feed_events(); $job$);
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron scheduling skipped: %', SQLERRM;
END;
$cron$;
