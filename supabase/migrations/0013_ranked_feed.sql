-- =====================================================================
-- 0013_ranked_feed.sql — Reel Estate
-- Server-side "Para vos" ranking from the user's FULL signal history in
-- feed_events (not just the session pool the client ranker sees). Structured
-- content-based scoring — a pgvector/embeddings version can replace the body
-- behind this same function signature later.
--
-- SECURITY INVOKER (default): runs as the caller, so RLS on feed_events (own)
-- and properties (public-read) both apply. auth.uid() is the caller.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.ranked_feed(p_limit int DEFAULT 20)
RETURNS SETOF public.properties
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  WITH positives AS (  -- properties the user reacted positively to (taste examples)
    SELECT DISTINCT e.property_id
    FROM public.feed_events e
    WHERE e.user_id = (select auth.uid())
      AND e.event_type IN ('like', 'save', 'super_like')
      AND e.property_id IS NOT NULL
  ),
  acted AS (  -- everything already engaged with → exclude from the deck
    SELECT DISTINCT e.property_id
    FROM public.feed_events e
    WHERE e.user_id = (select auth.uid()) AND e.property_id IS NOT NULL
  ),
  taste AS (
    SELECT
      array_agg(DISTINCT p.city) FILTER (WHERE p.city IS NOT NULL) AS cities,
      mode() WITHIN GROUP (ORDER BY p.listing_type)                AS op,
      avg(p.bedrooms)                                              AS beds
    FROM positives pos
    JOIN public.properties p ON p.id = pos.property_id
  )
  SELECT p.*
  FROM public.properties p, taste t
  WHERE p.deleted_at IS NULL
    AND p.status = 'active'
    AND p.id NOT IN (SELECT property_id FROM acted)
  ORDER BY
    (CASE WHEN t.op IS NOT NULL AND p.listing_type = t.op THEN 1 ELSE 0 END) DESC,
    (CASE WHEN t.cities IS NOT NULL AND p.city = ANY (t.cities) THEN 1 ELSE 0 END) DESC,
    abs(COALESCE(p.bedrooms, 0) - COALESCE(t.beds, COALESCE(p.bedrooms, 0))) ASC,
    p.published_at DESC
  LIMIT p_limit;
$$;

REVOKE ALL ON FUNCTION public.ranked_feed(int) FROM public;
GRANT EXECUTE ON FUNCTION public.ranked_feed(int) TO authenticated, anon;
