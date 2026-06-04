-- =====================================================================
-- 0021_agency_reviews_functions.sql — Reel Estate
-- Triggers + RPCs for agency reviews. Every definer fn is SECURITY
-- DEFINER, STABLE/VOLATILE as appropriate, SET search_path = '', fully
-- qualifies objects, REVOKE'd from public/anon and GRANT'd narrowly —
-- exactly like 0007/0015.
--
-- Write paths (authenticated only): submit_agency_review, delete_agency_review
--   — both bind to auth.uid(); a client can only write/delete its OWN review.
-- Read paths:
--   get_agency_rating()    — public aggregate (avg + count) from agencies.
--   get_agency_reviews()   — public list; OMITS reviewer_id (no enumeration).
--   get_my_agency_review() — self-scoped, for edit prefill.
-- =====================================================================

-- ---------------------------------------------------------------------
-- set_updated_at wiring (BEFORE UPDATE) — never trust client timestamps.
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS agencies_set_updated_at ON public.agencies;
CREATE TRIGGER agencies_set_updated_at BEFORE UPDATE ON public.agencies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS agency_reviews_set_updated_at ON public.agency_reviews;
CREATE TRIGGER agency_reviews_set_updated_at BEFORE UPDATE ON public.agency_reviews
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ---------------------------------------------------------------------
-- trg_agency_rating — denormalized rating_count/rating_sum on agencies.
-- AFTER INSERT/UPDATE/DELETE; GREATEST() guards against drift below zero.
-- avg is derived at read time (rating_sum / rating_count).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_agency_rating()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.agencies
      SET rating_count = rating_count + 1,
          rating_sum   = rating_sum + NEW.rating
      WHERE id = NEW.agency_id;
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.agency_id = OLD.agency_id THEN
      -- same agency, rating possibly edited → adjust the sum only
      UPDATE public.agencies
        SET rating_sum = GREATEST(rating_sum - OLD.rating + NEW.rating, 0)
        WHERE id = NEW.agency_id;
    ELSE
      -- review moved between agencies (defensive; agency_id is not edited today)
      UPDATE public.agencies
        SET rating_count = GREATEST(rating_count - 1, 0),
            rating_sum   = GREATEST(rating_sum - OLD.rating, 0)
        WHERE id = OLD.agency_id;
      UPDATE public.agencies
        SET rating_count = rating_count + 1,
            rating_sum   = rating_sum + NEW.rating
        WHERE id = NEW.agency_id;
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.agencies
      SET rating_count = GREATEST(rating_count - 1, 0),
          rating_sum   = GREATEST(rating_sum - OLD.rating, 0)
      WHERE id = OLD.agency_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_agency_rating() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS agency_reviews_rating_ins ON public.agency_reviews;
CREATE TRIGGER agency_reviews_rating_ins
  AFTER INSERT ON public.agency_reviews
  FOR EACH ROW EXECUTE FUNCTION public.trg_agency_rating();

DROP TRIGGER IF EXISTS agency_reviews_rating_upd ON public.agency_reviews;
CREATE TRIGGER agency_reviews_rating_upd
  AFTER UPDATE OF rating, agency_id ON public.agency_reviews
  FOR EACH ROW EXECUTE FUNCTION public.trg_agency_rating();

DROP TRIGGER IF EXISTS agency_reviews_rating_del ON public.agency_reviews;
CREATE TRIGGER agency_reviews_rating_del
  AFTER DELETE ON public.agency_reviews
  FOR EACH ROW EXECUTE FUNCTION public.trg_agency_rating();


-- ---------------------------------------------------------------------
-- submit_agency_review(p_agency_id, p_rating, p_comment) — the ONLY write
-- path for a review. Definer (bypasses RLS as the BYPASSRLS owner), so
-- agency_reviews needs NO client write policy. Binds reviewer to auth.uid()
-- (not a client-supplied id), re-validates rating server-side, and UPSERTs
-- on (agency_id, reviewer_id) so re-submitting EDITS the existing review.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_agency_review(
  p_agency_id uuid,
  p_rating    smallint,
  p_comment   text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user uuid := (select auth.uid());
  v_row  public.agency_reviews;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE = 'P0001'; END IF;

  -- Server-side validation: the RPC is the gate, not the client.
  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'invalid_rating' USING ERRCODE = 'P0001';
  END IF;
  IF p_comment IS NOT NULL AND char_length(p_comment) > 1000 THEN
    RAISE EXCEPTION 'comment_too_long' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.agencies a WHERE a.id = p_agency_id) THEN
    RAISE EXCEPTION 'agency_not_found' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.agency_reviews (agency_id, reviewer_id, rating, comment)
  VALUES (p_agency_id, v_user, p_rating, NULLIF(btrim(p_comment), ''))
  ON CONFLICT (agency_id, reviewer_id) DO UPDATE
    SET rating  = EXCLUDED.rating,
        comment = EXCLUDED.comment
  RETURNING * INTO v_row;

  -- Return ONLY safe columns — NEVER reviewer_id (the table's whole point is
  -- to not leak who reviewed; mirrors get_my_agency_review/get_agency_reviews).
  RETURN jsonb_build_object(
    'id',         v_row.id,
    'agency_id',  v_row.agency_id,
    'rating',     v_row.rating,
    'comment',    v_row.comment,
    'created_at', v_row.created_at,
    'updated_at', v_row.updated_at
  );
END;
$$;
REVOKE ALL ON FUNCTION public.submit_agency_review(uuid, smallint, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.submit_agency_review(uuid, smallint, text) TO authenticated;


-- ---------------------------------------------------------------------
-- delete_agency_review(p_agency_id) — remove the CALLER's own review.
-- The WHERE binds reviewer_id = auth.uid(), so even though this is a
-- definer fn it can never delete another user's review.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_agency_review(p_agency_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_user uuid := (select auth.uid());
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE = 'P0001'; END IF;
  DELETE FROM public.agency_reviews
    WHERE agency_id = p_agency_id AND reviewer_id = v_user;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_agency_review(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.delete_agency_review(uuid) TO authenticated;


-- ---------------------------------------------------------------------
-- get_agency_rating(p_agency_id) — PUBLIC aggregate for the rating badge.
-- Reads the denormalized counters; average is NULL when there are no
-- reviews (the UI renders "sin reseñas" rather than a fake 0).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_agency_rating(p_agency_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'agency_id',    a.id,
    'name',         a.name,
    'logo_path',    a.logo_path,
    'review_count', a.rating_count,
    'average',      CASE WHEN a.rating_count > 0
                         THEN round(a.rating_sum::numeric / a.rating_count, 2)
                         ELSE NULL END
  )
  FROM public.agencies a
  WHERE a.id = p_agency_id;
$$;
REVOKE ALL ON FUNCTION public.get_agency_rating(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_agency_rating(uuid) TO anon, authenticated;


-- ---------------------------------------------------------------------
-- get_agency_reviews(p_agency_id, p_limit, p_offset) — PUBLIC list of a
-- agency's reviews. Returns ONLY safe columns + the reviewer's public
-- display name; NEVER reviewer_id (no enumeration of who reviewed whom).
-- limit is clamped to [1, 50]; offset is non-negative.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_agency_reviews(
  p_agency_id uuid,
  p_limit     integer DEFAULT 20,
  p_offset    integer DEFAULT 0
)
RETURNS TABLE(
  id            uuid,
  rating        smallint,
  comment       text,
  created_at    timestamptz,
  reviewer_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT r.id, r.rating, r.comment, r.created_at,
         COALESCE(NULLIF(btrim(p.display_name), ''), 'Usuario') AS reviewer_name
  FROM public.agency_reviews r
  JOIN public.profiles p ON p.id = r.reviewer_id
  WHERE r.agency_id = p_agency_id
  ORDER BY r.created_at DESC
  LIMIT  LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;
REVOKE ALL ON FUNCTION public.get_agency_reviews(uuid, integer, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.get_agency_reviews(uuid, integer, integer) TO anon, authenticated;


-- ---------------------------------------------------------------------
-- get_my_agency_review(p_agency_id) — the caller's own review (or null),
-- for edit prefill. Self-scoped to auth.uid().
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_agency_review(p_agency_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT to_jsonb(r) FROM (
    SELECT ar.id, ar.agency_id, ar.rating, ar.comment, ar.created_at, ar.updated_at
    FROM public.agency_reviews ar
    WHERE ar.agency_id = p_agency_id
      AND ar.reviewer_id = (select auth.uid())
  ) r;
$$;
REVOKE ALL ON FUNCTION public.get_my_agency_review(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_my_agency_review(uuid) TO authenticated;
