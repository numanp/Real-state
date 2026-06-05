-- =====================================================================
-- 0037_reels_feed_join.sql — Reel Estate
-- Surface the PRIMARY reel media in the discovery feed (REELS-FICHA §2.3).
--
-- ranked_feed (0025) returned only `properties` columns, so the client could
-- not render reel video — it fell back to a synthesized image_set poster.
-- This adds an INNER JOIN onto each property's primary, READY reel so:
--   (a) every feed row carries the reel media (video_path/poster_path/...), and
--   (b) the feed is FAIL-CLOSED — a property with no ready primary reel never
--       appears (the INNER JOIN drops it). Correct: never show a card with no
--       media (matches the `property_reels_one_primary` partial-unique design).
--
-- Pagination/ranking contract is UNCHANGED: the candidate pool still rides the
-- keyset over properties (published_at DESC, id DESC); the reel join is O(1) per
-- property via the property_reels primary partial index. Only the output widens
-- with the reel columns and the candidate set narrows to media-ready listings.
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
  published_at  timestamptz,
  -- primary reel (REELS-FICHA §2.3) — INNER JOIN, fail-closed
  reel_id            uuid,
  media_type         public.reel_media_type,
  video_path         text,
  poster_path        text,
  image_paths        text[],
  thumbnail_blurhash text,
  duration_ms        integer,
  aspect_ratio       numeric,
  caption            text
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
  -- Bounded candidate pool: newest active+unseen properties that HAVE a ready
  -- primary reel, via the keyset index. This is the only place we touch the
  -- full catalog, and it stops after p_limit*10 index rows.
  candidates AS (
    SELECT
      p.id, p.title, p.listing_type, p.price_cents, p.currency,
      p.bedrooms, p.bathrooms, p.area_sqm, p.city,
      p.like_count, p.save_count, p.published_at,
      r.id AS reel_id, r.media_type, r.video_path, r.poster_path,
      r.image_paths, r.thumbnail_blurhash, r.duration_ms, r.aspect_ratio, r.caption
    FROM public.properties p
    JOIN public.property_reels r
      ON r.property_id = p.id
     AND r.is_primary
     AND r.status = 'ready'
    WHERE p.deleted_at IS NULL
      AND p.status = 'active'
      AND p.id NOT IN (SELECT property_id FROM acted)
    ORDER BY p.published_at DESC, p.id DESC
    LIMIT GREATEST(p_limit, 1) * 10
  )
  SELECT
    c.id, c.title, c.listing_type, c.price_cents, c.currency,
    c.bedrooms, c.bathrooms, c.area_sqm, c.city,
    c.like_count, c.save_count, c.published_at,
    c.reel_id, c.media_type, c.video_path, c.poster_path,
    c.image_paths, c.thumbnail_blurhash, c.duration_ms, c.aspect_ratio, c.caption
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
