-- =====================================================================
-- 0025_ranked_feed_prefilter.sql — Reel Estate
-- Perf: ranked_feed (0019) ranked the ENTIRE active catalog — it computed the
-- non-indexable taste sort keys (CASE/abs expressions) over every active,
-- unseen property and sorted the whole set before LIMIT. That sort grows with
-- the catalog.
--
-- Fix: a CANDIDATE pre-filter. First take a bounded pool of the most recent
-- active+unseen properties using the indexable keyset order (rides
-- properties_feed_keyset: (published_at DESC, id DESC) WHERE active), THEN apply
-- the taste reorder to just that pool (<= p_limit*10 rows). The expensive sort
-- is now bounded, not O(catalog). Ranking logic + output columns unchanged.
--
-- Tradeoff: taste reordering considers the recent pool, not the whole catalog.
-- For a recency-tiebroken discovery deck that's the intended behavior (rank the
-- fresh pool by taste); the pool (10x the deck) is far larger than any page.
-- =====================================================================

DROP FUNCTION IF EXISTS public.ranked_feed(int);

CREATE OR REPLACE FUNCTION public.ranked_feed(p_limit int DEFAULT 20)
RETURNS TABLE(
  id            uuid,
  title         text,
  listing_type  public.listing_type,
  price_cents   bigint,
  currency      text,
  bedrooms      smallint,
  bathrooms     numeric,
  area_sqm      numeric,
  city          text,
  like_count    integer,
  save_count    integer,
  published_at  timestamptz
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  WITH positives AS (
    SELECT DISTINCT e.property_id
    FROM public.feed_events e
    WHERE e.user_id = (select auth.uid())
      AND e.event_type IN ('like', 'save', 'super_like')
      AND e.property_id IS NOT NULL
  ),
  acted AS (
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
  ),
  -- Bounded candidate pool: newest active+unseen properties via the keyset
  -- index. This is the only place we touch the full catalog, and it stops after
  -- p_limit*10 index rows.
  candidates AS (
    SELECT
      p.id, p.title, p.listing_type, p.price_cents, p.currency,
      p.bedrooms, p.bathrooms, p.area_sqm, p.city,
      p.like_count, p.save_count, p.published_at
    FROM public.properties p
    WHERE p.deleted_at IS NULL
      AND p.status = 'active'
      AND p.id NOT IN (SELECT property_id FROM acted)
    ORDER BY p.published_at DESC, p.id DESC
    LIMIT GREATEST(p_limit, 1) * 10
  )
  SELECT
    c.id, c.title, c.listing_type, c.price_cents, c.currency,
    c.bedrooms, c.bathrooms, c.area_sqm, c.city,
    c.like_count, c.save_count, c.published_at
  FROM candidates c, taste t
  ORDER BY
    (CASE WHEN t.op IS NOT NULL AND c.listing_type = t.op THEN 1 ELSE 0 END) DESC,
    (CASE WHEN t.cities IS NOT NULL AND c.city = ANY (t.cities) THEN 1 ELSE 0 END) DESC,
    abs(COALESCE(c.bedrooms, 0) - COALESCE(t.beds, COALESCE(c.bedrooms, 0))) ASC,
    c.published_at DESC
  LIMIT p_limit;
$$;

REVOKE ALL ON FUNCTION public.ranked_feed(int) FROM public;
GRANT EXECUTE ON FUNCTION public.ranked_feed(int) TO authenticated, anon;
