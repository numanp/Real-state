-- =====================================================================
-- 0002_enums.sql — Reel Estate
-- All native Postgres enum types. Stable, low-cardinality, indexable,
-- type-safe. Created BEFORE any table that references them.
-- Idempotent: each CREATE TYPE guarded by a DO $$ ... $$ block so the
-- migration can be re-applied without erroring (CREATE TYPE has no
-- IF NOT EXISTS clause).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Core (FOUNDATION §Enums)
-- ---------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.listing_type AS ENUM ('buy', 'rent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.property_kind AS ENUM ('house', 'apartment', 'studio', 'land', 'commercial');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.listing_status AS ENUM ('active', 'pending', 'sold', 'rented', 'hidden');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------
-- Membership / entitlements (MEMBERSHIP §Enums)
-- ---------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.app_tier AS ENUM ('free', 'pro', 'ultimate', 'top');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.sub_status AS ENUM ('active', 'in_grace', 'past_due', 'paused', 'canceled', 'expired', 'inactive');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.sub_store AS ENUM ('app_store', 'play_store', 'stripe', 'paddle', 'promotional');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.entitlement_kind AS ENUM ('quota', 'boolean', 'level');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.entitlement_key AS ENUM (
    'swipes_per_day', 'max_favorites', 'max_folders', 'max_saved_searches',
    'filters_geo_amenity', 'rewind', 'no_ads', 'premium_agent_data',
    'saved_search_alerts', 'instant_listing_alerts', 'fresh_listings_first', 'priority_support'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.usage_metric AS ENUM ('swipe');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------
-- Reels (REELS-FICHA §2.1)
-- ---------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.reel_media_type AS ENUM ('video', 'image_set');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.reel_status AS ENUM ('processing', 'ready', 'hidden');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------
-- Ficha-only rich media (REELS-FICHA §2.4)
-- ---------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.media_type AS ENUM ('virtual_tour_3d', 'floor_plan', 'drone', 'map_embed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------
-- Ficha property descriptors (REELS-FICHA §3.1)
-- ---------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.orientation AS ENUM ('n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.disposition AS ENUM ('frente', 'contrafrente', 'interno', 'lateral');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.property_condition AS ENUM (
    'new', 'excellent', 'very_good', 'good', 'to_renovate', 'reciclado'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------
-- Costs (REELS-FICHA §3.2)
-- ---------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.cost_type AS ENUM (
    'rent', 'sale_price', 'expensas', 'condominio', 'iptu', 'abl',
    'seguro_incendio', 'taxa_servico', 'deposit', 'itbi', 'notary',
    'registry', 'agency_fee', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.cost_period AS ENUM ('monthly', 'yearly', 'once');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------
-- Terms (REELS-FICHA §3.3)
-- ---------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.guarantee_type AS ENUM (
    'garantia_propietaria', 'fianza', 'seguro_caucion', 'recibo_sueldo',  -- AR
    'fiador', 'seguro_fianca', 'caucao', 'institutional_none'             -- BR
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.furnished_state AS ENUM ('unfurnished', 'semi', 'furnished');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------
-- Price events (REELS-FICHA §3.4)
-- ---------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.price_event_type AS ENUM (
    'listed', 'price_changed', 'status_changed', 'relisted', 'delisted'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------
-- POIs (REELS-FICHA §3.5)
-- ---------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.poi_type AS ENUM (
    'transit_subway', 'transit_train', 'transit_bus', 'education',
    'health', 'park', 'shopping', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------
-- Advertiser (REELS-FICHA §3.6)
-- ---------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.advertiser_type AS ENUM ('agency', 'owner', 'managed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------
-- Amenities (REELS-FICHA §4.1)
-- ---------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.amenity_scope AS ENUM ('unit', 'building');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.amenity_category AS ENUM (
    'comfort', 'security', 'leisure', 'services',
    'sustainability', 'connectivity', 'accessibility'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
