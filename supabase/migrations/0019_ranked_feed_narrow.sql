-- =====================================================================
-- 0019_ranked_feed_narrow.sql — Reel Estate
-- Perf: ranked_feed (0013) returned SETOF public.properties (~50 columns
-- incl. the search_tsv tsvector + geography + ~45 ficha fields) for a 60-row
-- "Para vos" deck, of which the client reads only 12. Narrow it to RETURNS
-- TABLE of exactly the feed columns (the same set getPage selects) — less
-- serialization/network/parse, and both feed paths now share one column
-- contract. Ranking logic is unchanged.
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
  )
  SELECT
    p.id, p.title, p.listing_type, p.price_cents, p.currency,
    p.bedrooms, p.bathrooms, p.area_sqm, p.city,
    p.like_count, p.save_count, p.published_at
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
