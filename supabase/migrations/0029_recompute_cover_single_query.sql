-- =====================================================================
-- 0029_recompute_cover_single_query.sql — Reel Estate
-- Perf: recompute_cover_image() (0007) did TWO sequential index scans per
-- cover update (primary reel poster, then a fallback image query). Collapse
-- into ONE UNION ALL ordered by precedence, so a single scan resolves the
-- cover. Semantics preserved exactly: a primary ready reel WITH a poster wins;
-- a primary reel with a NULL poster falls through to the first property image.
-- Called on every reel/image INSERT/UPDATE/DELETE, so this is a hot path.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.recompute_cover_image(p_property_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cover text;
BEGIN
  SELECT c.cover INTO v_cover
  FROM (
    -- precedence 0: the primary ready reel poster (only if it has one)
    SELECT r.poster_path AS cover, 0 AS pri, 0::smallint AS pos, r.created_at AS created
    FROM public.property_reels r
    WHERE r.property_id = p_property_id
      AND r.is_primary AND r.status = 'ready'
      AND r.poster_path IS NOT NULL
    UNION ALL
    -- precedence 1: the first property image (position ASC, then oldest)
    SELECT i.storage_path, 1, i.position, i.created_at
    FROM public.property_images i
    WHERE i.property_id = p_property_id
  ) c
  ORDER BY c.pri, c.pos, c.created
  LIMIT 1;

  UPDATE public.properties
    SET cover_image_path = v_cover
    WHERE id = p_property_id
      AND cover_image_path IS DISTINCT FROM v_cover;
END;
$$;
REVOKE ALL ON FUNCTION public.recompute_cover_image(uuid) FROM public, anon, authenticated;
