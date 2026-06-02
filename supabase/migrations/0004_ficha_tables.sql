-- =====================================================================
-- 0004_ficha_tables.sql — Reel Estate
-- The ficha "knowledge library" + reels feed-media layer (REELS-FICHA).
-- All ADDITIVE child tables of properties. RLS enabled here; policies in
-- 0008_rls.sql. set_updated_at triggers wired in 0007.
--
-- Media table separation (REELS-FICHA §2.4):
--   property_images  — deep photo gallery (0003)        [unchanged]
--   property_reels   — typed feed media (video|image_set), one PRIMARY
--   property_media   — ficha-only rich media (3D/floor plan/drone/map)
-- =====================================================================

-- ---------------------------------------------------------------------
-- property_reels — the feed discovery unit (REELS-FICHA §2.1)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.property_reels (
  id                 uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  property_id        uuid NOT NULL REFERENCES public.properties (id) ON DELETE CASCADE,
  media_type         public.reel_media_type NOT NULL,
  video_path         text,                                   -- reels bucket: {property_id}/{reel_id}/source.mp4
  poster_path        text,                                   -- still feeding the card + cover_image_path
  image_paths        text[],                                 -- ordered keys for image_set
  thumbnail_blurhash text,
  duration_ms        integer CHECK (duration_ms IS NULL OR duration_ms > 0),
  aspect_ratio       numeric(6,4) NOT NULL DEFAULT 0.5625,   -- 9:16; stored to prevent CLS
  caption            text CHECK (caption IS NULL OR char_length(caption) <= 280),
  position           smallint NOT NULL DEFAULT 0,
  is_primary         boolean  NOT NULL DEFAULT false,
  status             public.reel_status NOT NULL DEFAULT 'ready',
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reel_media_shape CHECK (
    (media_type = 'video'     AND video_path IS NOT NULL AND image_paths IS NULL)
    OR
    (media_type = 'image_set' AND image_paths IS NOT NULL
       AND array_length(image_paths, 1) >= 1 AND video_path IS NULL)
  )
);

-- THE one-primary-per-property enforcement (mirror of folders default-unique).
-- This UNIQUE partial index doubles as the feed JOIN's O(1) primary-reel lookup
-- per property — a unique index is a usable btree, so no separate non-unique
-- (property_id) WHERE is_primary AND status='ready' index is needed.
CREATE UNIQUE INDEX IF NOT EXISTS property_reels_one_primary
  ON public.property_reels (property_id) WHERE is_primary AND status = 'ready';

-- Ordered fetch of ALL reels for the ficha Multimedia carousel (+ FK index)
CREATE INDEX IF NOT EXISTS property_reels_property_position
  ON public.property_reels (property_id, position);

-- Visibility-scoped parent lookups / existence checks (RLS rides status+property_id)
CREATE INDEX IF NOT EXISTS property_reels_property_ready
  ON public.property_reels (property_id) WHERE status = 'ready';

ALTER TABLE public.property_reels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_reels FORCE  ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------
-- property_media — ficha-only rich media (REELS-FICHA §2.4)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.property_media (
  id             uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  property_id    uuid NOT NULL REFERENCES public.properties (id) ON DELETE CASCADE,
  media_type     public.media_type NOT NULL,
  storage_path   text,                                  -- self-hosted (floor plan, drone)
  external_url   text,                                  -- Matterport/3D-tour URL (host allow-list, OWASP A10)
  thumbnail_path text,
  blurhash       text,
  width          smallint,
  height         smallint,
  position       smallint NOT NULL DEFAULT 0,
  alt_text       text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT property_media_source CHECK (storage_path IS NOT NULL OR external_url IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS property_media_property_position
  ON public.property_media (property_id, position);

ALTER TABLE public.property_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_media FORCE  ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------
-- property_costs — polymorphic money lines (REELS-FICHA §3.2)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.property_costs (
  id            uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  property_id   uuid NOT NULL REFERENCES public.properties (id) ON DELETE CASCADE,
  cost_type     public.cost_type   NOT NULL,
  amount_cents  bigint NOT NULL CHECK (amount_cents >= 0),
  currency      char(3) NOT NULL DEFAULT 'ARS',         -- per-row (AR USD venta, ARS alquiler)
  period        public.cost_period NOT NULL,
  is_estimate   boolean NOT NULL DEFAULT false,
  included      boolean NOT NULL DEFAULT false,         -- 'incluido' → show, exclude from monthly sum
  label         text,                                   -- free text when cost_type='other'
  display_order smallint NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS property_costs_order_idx ON public.property_costs (property_id, display_order);
CREATE INDEX IF NOT EXISTS property_costs_type_idx  ON public.property_costs (property_id, cost_type);

ALTER TABLE public.property_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_costs FORCE  ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------
-- property_terms — 1:1 buy/rent flags & scalars (REELS-FICHA §3.3)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.property_terms (
  property_id              uuid PRIMARY KEY REFERENCES public.properties (id) ON DELETE CASCADE,
  -- RENT --
  deposit_months           numeric(3,1),
  advance_months           numeric(3,1),
  guarantee_types          public.guarantee_type[],
  min_term_months          smallint,
  min_income_cents         bigint CHECK (min_income_cents IS NULL OR min_income_cents >= 0),
  min_income_note          text,
  credit_check_required    boolean,
  is_furnished             public.furnished_state,
  pets_allowed             boolean,
  available_from           date,
  utilities_included       boolean,
  -- BUY --
  apt_credit               boolean,
  apt_professional         boolean,
  accepts_financing        boolean,
  accepts_fgts             boolean,
  title_status             text,
  transfer_tax_estimate_cents bigint CHECK (transfer_tax_estimate_cents IS NULL OR transfer_tax_estimate_cents >= 0),
  notary_estimate_cents       bigint CHECK (notary_estimate_cents IS NULL OR notary_estimate_cents >= 0),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS property_terms_apt_credit_idx ON public.property_terms (apt_credit)   WHERE apt_credit;
CREATE INDEX IF NOT EXISTS property_terms_pets_idx       ON public.property_terms (pets_allowed) WHERE pets_allowed;
CREATE INDEX IF NOT EXISTS property_terms_furnished_idx  ON public.property_terms (is_furnished);

ALTER TABLE public.property_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_terms FORCE  ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------
-- property_price_events — append-only price history (REELS-FICHA §3.4)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.property_price_events (
  id           uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  property_id  uuid NOT NULL REFERENCES public.properties (id) ON DELETE CASCADE,
  event_type   public.price_event_type NOT NULL,
  price_cents  bigint CHECK (price_cents IS NULL OR price_cents >= 0),
  currency     char(3),
  status       public.listing_status,
  note         text,
  occurred_at  timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS property_price_events_idx
  ON public.property_price_events (property_id, occurred_at DESC);

ALTER TABLE public.property_price_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_price_events FORCE  ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------
-- property_pois — location intelligence (REELS-FICHA §3.5)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.property_pois (
  id            uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  property_id   uuid NOT NULL REFERENCES public.properties (id) ON DELETE CASCADE,
  poi_type      public.poi_type NOT NULL,
  name          text NOT NULL,
  distance_m    integer CHECK (distance_m IS NULL OR distance_m >= 0),
  walk_minutes  smallint CHECK (walk_minutes IS NULL OR walk_minutes >= 0),
  location      extensions.geography(Point, 4326),
  display_order smallint NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS property_pois_idx
  ON public.property_pois (property_id, poi_type, distance_m);

ALTER TABLE public.property_pois ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_pois FORCE  ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------
-- listing_details — PUBLIC advertiser identity & provenance (§3.6)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.listing_details (
  property_id              uuid PRIMARY KEY REFERENCES public.properties (id) ON DELETE CASCADE,
  listing_code             text UNIQUE,                 -- public opaque código for shareable URLs
  advertiser_type          public.advertiser_type NOT NULL DEFAULT 'agency',
  agency_name              text,
  agency_logo_path         text,
  broker_name              text,
  broker_license           text,                        -- CUCICBA (AR) / CRECI (BR)
  broker_license_authority text,                        -- 'CUCICBA' | 'CMCPSI' | 'CRECI'
  source                   text,
  published_at             timestamptz,
  listed_updated_at        timestamptz,
  other_listings_count     integer CHECK (other_listings_count IS NULL OR other_listings_count >= 0),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS listing_details_code_idx
  ON public.listing_details (listing_code) WHERE listing_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS listing_details_advertiser_idx
  ON public.listing_details (advertiser_type);

ALTER TABLE public.listing_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listing_details FORCE  ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------
-- listing_contacts — SENSITIVE contact + premium intel (§3.6)
-- NO broad public SELECT — reveal ONLY via get_listing_contact() RPC.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.listing_contacts (
  property_id          uuid PRIMARY KEY REFERENCES public.properties (id) ON DELETE CASCADE,
  contact_whatsapp     text,                            -- E.164
  contact_phone        text,
  contact_email        extensions.citext,
  contact_form_enabled boolean NOT NULL DEFAULT true,
  agent_perf_summary   jsonb,                           -- days-on-market, price-cut history, comps (full tier)
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.listing_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listing_contacts FORCE  ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------
-- amenities_catalog — bilingual reference data (REELS-FICHA §4.1)
-- Smallint PK (hot dense join), NOT uuid.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.amenities_catalog (
  id            smallint PRIMARY KEY,
  key           text UNIQUE NOT NULL,
  scope         public.amenity_scope    NOT NULL,
  category      public.amenity_category,
  label_es      text NOT NULL,
  label_pt      text NOT NULL,
  icon          text,                                   -- lucide name
  display_order smallint NOT NULL DEFAULT 0,
  is_active     boolean  NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS amenities_catalog_scope_idx
  ON public.amenities_catalog (scope) WHERE is_active;
CREATE INDEX IF NOT EXISTS amenities_catalog_category_idx
  ON public.amenities_catalog (category);

ALTER TABLE public.amenities_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.amenities_catalog FORCE  ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------
-- property_amenities — normalized M:N (REELS-FICHA §4.1)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.property_amenities (
  property_id  uuid     NOT NULL REFERENCES public.properties (id)       ON DELETE CASCADE,
  amenity_id   smallint NOT NULL REFERENCES public.amenities_catalog (id) ON DELETE RESTRICT,
  available    boolean  NOT NULL DEFAULT true,          -- true=green, false=greyed, no row=unknown
  value        text,                                    -- qualifier: pool='climatizada', parking='2 vagas'
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (property_id, amenity_id)
);

-- Reverse filter 'all properties WITH amenity' — index ONLY present-true rows
CREATE INDEX IF NOT EXISTS property_amenities_filter_idx
  ON public.property_amenities (amenity_id, available) WHERE available;

ALTER TABLE public.property_amenities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_amenities FORCE  ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------
-- property_attributes — hybrid typed-EAV long tail (REELS-FICHA §4.2)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.property_attributes (
  property_id  uuid NOT NULL REFERENCES public.properties (id) ON DELETE CASCADE,
  attr_key     text NOT NULL,
  value_text   text,
  value_num    numeric,
  value_bool   boolean,
  unit         text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (property_id, attr_key)
);

CREATE INDEX IF NOT EXISTS property_attributes_text_idx
  ON public.property_attributes (attr_key, value_text);
CREATE INDEX IF NOT EXISTS property_attributes_num_idx
  ON public.property_attributes (attr_key, value_num) WHERE value_num IS NOT NULL;

ALTER TABLE public.property_attributes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_attributes FORCE  ROW LEVEL SECURITY;
