-- =====================================================================
-- 0003_core_tables.sql — Reel Estate
-- Core entities: profiles, properties (with integrated ficha columns),
-- property_images. RLS is enabled here but POLICIES live in 0008_rls.sql.
-- Triggers/functions live in 0007_functions_triggers.sql.
--
-- Conventions (FOUNDATION):
--  - UUID PKs via gen_random_uuid()
--  - Storage object PATHS, never URLs
--  - Money in integer minor units (cents) as bigint
--  - Soft-delete tombstone deleted_at on properties
-- =====================================================================

-- ---------------------------------------------------------------------
-- profiles — public-facing user record, 1:1 with auth.users
-- Created via SECURITY DEFINER handle_new_user() trigger (0007).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id            uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  username      extensions.citext UNIQUE,
  display_name  text,
  avatar_path   text,                                   -- storage object path, not a URL
  is_anonymous  boolean      NOT NULL DEFAULT false,
  created_at    timestamptz  NOT NULL DEFAULT now(),
  updated_at    timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT profiles_username_chars CHECK (
    username IS NULL
    OR (char_length(username::text) BETWEEN 3 AND 30
        AND username::text ~ '^[a-zA-Z0-9_]+$')
  ),
  CONSTRAINT profiles_display_name_len CHECK (
    display_name IS NULL OR char_length(display_name) BETWEEN 1 AND 80
  )
);

-- Partial unique on username (already UNIQUE above handles non-null;
-- partial index keeps NULLs cheap and documents intent).
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_uq
  ON public.profiles (username) WHERE username IS NOT NULL;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE  ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------
-- properties — core listing entity (the swipe feed) + integrated ficha
-- columns (REELS-FICHA §3.1). MVP = seeded mock data, publicly browsable.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.properties (
  id                    uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  owner_id              uuid REFERENCES public.profiles (id) ON DELETE SET NULL,

  -- Core descriptive
  title                 text          NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  description           text,
  listing_type          public.listing_type   NOT NULL,
  property_kind         public.property_kind   NOT NULL,
  status                public.listing_status  NOT NULL DEFAULT 'active',

  -- Headline price (authoritative; the feed NEVER joins property_costs)
  price_cents           bigint        NOT NULL CHECK (price_cents >= 0),
  currency              char(3)       NOT NULL DEFAULT 'USD',

  -- Core specs
  bedrooms              smallint      CHECK (bedrooms IS NULL OR bedrooms >= 0),
  bathrooms             numeric(3,1)  CHECK (bathrooms IS NULL OR bathrooms >= 0),
  area_sqm              numeric(10,2) CHECK (area_sqm IS NULL OR area_sqm >= 0),  -- kept as TOTAL (decision §3.1/§10)

  -- Address
  address_line          text,
  city                  text,
  region                text,
  country               char(2),
  postal_code           text,
  location              extensions.geography(Point, 4326),

  -- Denormalized feed fields
  cover_image_path      text,                                   -- primary reel poster → fallback image[0] (trigger 0007)
  like_count            integer       NOT NULL DEFAULT 0 CHECK (like_count >= 0),
  save_count            integer       NOT NULL DEFAULT 0 CHECK (save_count >= 0),

  -- ===== Ficha columns (REELS-FICHA §3.1) =====
  area_total_sqm        numeric(10,2) CHECK (area_total_sqm IS NULL OR area_total_sqm >= 0),
  area_covered_sqm      numeric(10,2) CHECK (area_covered_sqm IS NULL OR area_covered_sqm >= 0),
  area_uncovered_sqm    numeric(10,2) CHECK (area_uncovered_sqm IS NULL OR area_uncovered_sqm >= 0),
  area_semicovered_sqm  numeric(10,2) CHECK (area_semicovered_sqm IS NULL OR area_semicovered_sqm >= 0),
  area_land_sqm         numeric(10,2) CHECK (area_land_sqm IS NULL OR area_land_sqm >= 0),
  rooms                 smallint      CHECK (rooms IS NULL OR rooms >= 0),   -- AR ambientes (≠ bedrooms)
  suites                smallint      CHECK (suites IS NULL OR suites >= 0), -- BR suítes
  half_bathrooms        smallint      CHECK (half_bathrooms IS NULL OR half_bathrooms >= 0),
  parking_spaces        smallint      NOT NULL DEFAULT 0 CHECK (parking_spaces >= 0),
  floor_number          smallint,
  total_floors          smallint      CHECK (total_floors IS NULL OR total_floors >= 0),
  unit_levels           smallint      DEFAULT 1 CHECK (unit_levels IS NULL OR unit_levels >= 1),
  year_built            smallint,
  age_years             smallint      CHECK (age_years IS NULL OR age_years >= 0),
  is_new_construction   boolean       NOT NULL DEFAULT false,
  is_under_construction boolean       NOT NULL DEFAULT false,
  orientation           public.orientation,
  disposition           public.disposition,
  condition             public.property_condition,
  metro_nearby          boolean       NOT NULL DEFAULT false,
  apt_credit            boolean       NOT NULL DEFAULT false,   -- AR "Apto crédito" (mirrored on property_terms)
  locale                text          NOT NULL DEFAULT 'es-AR'
                          CHECK (locale IN ('es-AR', 'pt-BR')),

  -- Display-only escape hatch (REELS-FICHA §4.2)
  extra                 jsonb,

  -- Full-text search: regconfig switched on locale (es → spanish, pt → portuguese)
  search_tsv            tsvector GENERATED ALWAYS AS (
    setweight(
      to_tsvector(
        CASE WHEN locale = 'pt-BR' THEN 'portuguese'::regconfig ELSE 'spanish'::regconfig END,
        coalesce(title, '')
      ), 'A'
    ) ||
    setweight(
      to_tsvector(
        CASE WHEN locale = 'pt-BR' THEN 'portuguese'::regconfig ELSE 'spanish'::regconfig END,
        coalesce(description, '')
      ), 'B'
    ) ||
    setweight(
      to_tsvector(
        CASE WHEN locale = 'pt-BR' THEN 'portuguese'::regconfig ELSE 'spanish'::regconfig END,
        coalesce(city, '') || ' ' || coalesce(region, '')
      ), 'C'
    )
  ) STORED,

  -- Timestamps + soft-delete
  published_at          timestamptz   DEFAULT now(),
  created_at            timestamptz   NOT NULL DEFAULT now(),
  updated_at            timestamptz   NOT NULL DEFAULT now(),
  deleted_at            timestamptz
);

-- ===== Indexes (FOUNDATION + REELS-FICHA M6 filters) =====
-- Geo KNN
CREATE INDEX IF NOT EXISTS properties_location_gist
  ON public.properties USING gist (location);

-- Full-text
CREATE INDEX IF NOT EXISTS properties_search_tsv_gin
  ON public.properties USING gin (search_tsv);

-- Trigram fuzzy on city + title
CREATE INDEX IF NOT EXISTS properties_city_trgm
  ON public.properties USING gin (city extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS properties_title_trgm
  ON public.properties USING gin (title extensions.gin_trgm_ops);

-- Filter composites
CREATE INDEX IF NOT EXISTS properties_type_status_price
  ON public.properties (listing_type, status, price_cents);
CREATE INDEX IF NOT EXISTS properties_beds_price
  ON public.properties (bedrooms, price_cents);

-- Keyset feed order + PARTIAL feed index (the hot path).
-- This is the index the keyset feed query rides; it is also the column set
-- referenced by the public SELECT RLS policy (status, deleted_at).
CREATE INDEX IF NOT EXISTS properties_feed_keyset
  ON public.properties (published_at DESC, id DESC)
  WHERE deleted_at IS NULL AND status = 'active';

-- Owner lookups (future owner uploads)
CREATE INDEX IF NOT EXISTS properties_owner_idx
  ON public.properties (owner_id) WHERE owner_id IS NOT NULL;

-- M6 ficha filter indexes
CREATE INDEX IF NOT EXISTS properties_rooms_idx        ON public.properties (rooms);
CREATE INDEX IF NOT EXISTS properties_parking_idx      ON public.properties (parking_spaces);
CREATE INDEX IF NOT EXISTS properties_floor_idx        ON public.properties (floor_number);
CREATE INDEX IF NOT EXISTS properties_orientation_idx  ON public.properties (orientation);
CREATE INDEX IF NOT EXISTS properties_condition_idx    ON public.properties (condition);
CREATE INDEX IF NOT EXISTS properties_area_covered_idx ON public.properties (area_covered_sqm);
CREATE INDEX IF NOT EXISTS properties_apt_credit_idx   ON public.properties (apt_credit)   WHERE apt_credit;
CREATE INDEX IF NOT EXISTS properties_metro_nearby_idx ON public.properties (metro_nearby) WHERE metro_nearby;

ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.properties FORCE  ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------
-- property_images — ordered ficha photo gallery (1:N). Storage paths.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.property_images (
  id            uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  property_id   uuid NOT NULL REFERENCES public.properties (id) ON DELETE CASCADE,
  storage_path  text NOT NULL,                          -- {property_id}/{uuid}.webp
  position      smallint NOT NULL DEFAULT 0,
  width         smallint,
  height        smallint,
  blurhash      text,
  alt_text      text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT property_images_path_uq UNIQUE (property_id, storage_path)
);

-- (property_id, position, created_at): created_at covers the cover-image
-- fallback tiebreaker (recompute_cover_image ORDER BY position ASC, created_at
-- ASC LIMIT 1) so that pick is a pure index scan, not a per-property sort.
CREATE INDEX IF NOT EXISTS property_images_property_position
  ON public.property_images (property_id, position, created_at);

ALTER TABLE public.property_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_images FORCE  ROW LEVEL SECURITY;
