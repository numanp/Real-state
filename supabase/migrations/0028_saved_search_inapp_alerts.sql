-- =====================================================================
-- 0028_saved_search_inapp_alerts.sql — Reel Estate
-- In-app "N nuevas" badge for saved searches, reusing the 0026 matching
-- engine. Uses a SEPARATE watermark from push: last_seen_at (advanced when the
-- user opens the search in-app) vs last_notified_at (advanced by the push
-- dispatch), so the two channels never zero each other out.
--   * my_saved_search_alerts()  — self-scoped count of new matches per search.
--   * mark_saved_search_seen()  — reset a search's last_seen_at to now().
-- =====================================================================

ALTER TABLE public.saved_searches
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now();

-- ---------------------------------------------------------------------
-- my_saved_search_alerts() — for the CALLER's searches, the count of new
-- active matching listings (published_at > last_seen_at). LEFT JOIN so a
-- search with zero new matches still returns a row (count 0).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.my_saved_search_alerts()
RETURNS TABLE(saved_search_id uuid, new_count integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT s.id, count(p.id)::integer
  FROM public.saved_searches s
  LEFT JOIN public.properties p
    ON p.status = 'active'
   AND p.deleted_at IS NULL
   AND p.published_at > s.last_seen_at
   AND public.saved_search_matches_property(p, s.filters)
  WHERE s.user_id = (select auth.uid())
  GROUP BY s.id;
$$;
REVOKE ALL ON FUNCTION public.my_saved_search_alerts() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.my_saved_search_alerts() TO authenticated;

-- ---------------------------------------------------------------------
-- mark_saved_search_seen(p_saved_search_id) — reset the caller's own
-- search watermark. Scoped to auth.uid(): a definer fn that still can't
-- touch another user's search.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_saved_search_seen(p_saved_search_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_user uuid := (select auth.uid());
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE = 'P0001'; END IF;
  UPDATE public.saved_searches
    SET last_seen_at = now()
    WHERE id = p_saved_search_id AND user_id = v_user;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_saved_search_seen(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.mark_saved_search_seen(uuid) TO authenticated;
