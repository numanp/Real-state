-- =====================================================================
-- 0011_saved_searches.sql — Reel Estate
-- A user's saved feed filters (the #1 real-estate retention loop). The stored
-- predicate is exactly the client feed-filter schema (jsonb). Per-owner RLS.
-- Alert fan-out (push / WhatsApp) is a later Edge-Function job over this table.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.saved_searches (
  id          uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 60),
  filters     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS saved_searches_user_idx
  ON public.saved_searches (user_id, created_at DESC);

ALTER TABLE public.saved_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_searches FORCE  ROW LEVEL SECURITY;

GRANT SELECT, INSERT, DELETE ON public.saved_searches TO authenticated;

CREATE POLICY saved_searches_select_own ON public.saved_searches
  FOR SELECT TO authenticated USING (user_id = (select auth.uid()));

CREATE POLICY saved_searches_insert_own ON public.saved_searches
  FOR INSERT TO authenticated WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY saved_searches_delete_own ON public.saved_searches
  FOR DELETE TO authenticated USING (user_id = (select auth.uid()));
