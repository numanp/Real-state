-- =====================================================================
-- 0020_agency_reviews.sql — Reel Estate
-- Agency reviews/ratings feature (ADDITIVE). Introduces a normalized
-- `agencies` table (the review TARGET), backfilled from the denormalized
-- listing_details.agency_name, plus a NULLABLE agency_id FK on
-- listing_details (kept alongside agency_name for compat — the feed/ficha
-- read path is untouched; full normalization is deferred to its own change).
-- `agency_reviews` holds one user→agency rating (1..5) + optional comment,
-- UNIQUE per (agency_id, reviewer_id). Denormalized rating_count/rating_sum
-- on agencies (avg = sum/count) are maintained by AFTER triggers in 0021.
-- Functions/triggers: 0021. RLS + GRANTs: 0022.
-- =====================================================================

-- ---------------------------------------------------------------------
-- agencies — normalized advertiser identity (the review target).
-- rating_count/rating_sum are SYSTEM-maintained (trg_agency_rating, 0021).
-- Clients get SELECT only (0022) and NO write grant, so the counters are
-- immutable without a guard trigger — there is no client write path at all.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agencies (
  id           uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  name         text NOT NULL,
  logo_path    text,
  rating_count integer NOT NULL DEFAULT 0 CHECK (rating_count >= 0),
  rating_sum   integer NOT NULL DEFAULT 0 CHECK (rating_sum >= 0),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Case-insensitive identity key — dedupes the backfill and lets a future
-- normalization join on lower(name) without ambiguity.
CREATE UNIQUE INDEX IF NOT EXISTS agencies_name_lower_key
  ON public.agencies (lower(name));

ALTER TABLE public.agencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agencies FORCE  ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------
-- Backfill agencies from the denormalized listing_details.agency_name.
-- DISTINCT ON (lower(name)) keeps one row per case-insensitive name;
-- ON CONFLICT DO NOTHING makes the whole migration idempotent on re-run.
-- ---------------------------------------------------------------------
INSERT INTO public.agencies (name, logo_path)
SELECT DISTINCT ON (lower(ld.agency_name))
       ld.agency_name, ld.agency_logo_path
FROM public.listing_details ld
WHERE ld.agency_name IS NOT NULL
ORDER BY lower(ld.agency_name), ld.agency_logo_path NULLS LAST
ON CONFLICT (lower(name)) DO NOTHING;


-- ---------------------------------------------------------------------
-- Additive nullable FK on listing_details → agencies. agency_name STAYS
-- (compat). Populated by matching lower(name); ON DELETE SET NULL so
-- removing an agency never cascades into listings.
-- ---------------------------------------------------------------------
ALTER TABLE public.listing_details
  ADD COLUMN IF NOT EXISTS agency_id uuid REFERENCES public.agencies (id) ON DELETE SET NULL;

UPDATE public.listing_details ld
  SET agency_id = a.id
  FROM public.agencies a
  WHERE ld.agency_id IS NULL
    AND ld.agency_name IS NOT NULL
    AND lower(a.name) = lower(ld.agency_name);

CREATE INDEX IF NOT EXISTS listing_details_agency_idx
  ON public.listing_details (agency_id) WHERE agency_id IS NOT NULL;


-- ---------------------------------------------------------------------
-- agency_reviews — one rating (1..5) + optional comment per user per
-- agency. SENSITIVE: carries reviewer_id, so it is RPC-only (0022 grants
-- nothing). Reads go through get_agency_reviews() (omits reviewer_id);
-- writes through submit_agency_review()/delete_agency_review() (definer).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agency_reviews (
  id          uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  agency_id   uuid NOT NULL REFERENCES public.agencies (id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  rating      smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     text CHECK (comment IS NULL OR char_length(comment) <= 1000),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agency_id, reviewer_id)            -- one review per user per agency
);

-- Public reviews list ordered newest-first per agency.
CREATE INDEX IF NOT EXISTS agency_reviews_agency_idx
  ON public.agency_reviews (agency_id, created_at DESC);

ALTER TABLE public.agency_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_reviews FORCE  ROW LEVEL SECURITY;
