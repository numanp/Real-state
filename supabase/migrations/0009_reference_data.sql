-- =====================================================================
-- 0009_reference_data.sql — Reel Estate
-- Reference / lookup rows that ship with the schema (NOT mock content —
-- that lives in seed.sql). Idempotent via ON CONFLICT upserts.
--
--   1. entitlements_catalog — 12 capability rows
--   2. tier_entitlements    — 4 tiers × 12 keys = 48 rows
--                             (top IDENTICAL to ultimate — the locked principle)
--   3. amenities_catalog    — bilingual ES/PT catalog (REELS-FICHA §4.1)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. entitlements_catalog (MEMBERSHIP §entitlements_catalog)
-- ---------------------------------------------------------------------
INSERT INTO public.entitlements_catalog (key, kind, description, unit) VALUES
  ('swipes_per_day',         'quota',   'Daily swipe budget on the feed',                 'per_day'),
  ('max_favorites',          'quota',   'Max saved properties across all folders',        'count'),
  ('max_folders',            'quota',   'Max user-created folders',                       'count'),
  ('max_saved_searches',     'quota',   'Max persisted saved searches',                   'count'),
  ('filters_geo_amenity',    'level',   'Geo + amenity filter precision',                 NULL),
  ('rewind',                 'boolean', 'Undo the last swipe',                            NULL),
  ('no_ads',                 'boolean', 'Remove sponsored interstitials',                 NULL),
  ('premium_agent_data',     'level',   'Advertiser contact channel + agent intelligence', NULL),
  ('saved_search_alerts',    'boolean', 'Alerts for saved searches',                      NULL),
  ('instant_listing_alerts', 'boolean', 'Sub-minute new-listing alerts',                  NULL),
  ('fresh_listings_first',   'boolean', 'Newest/best-match feed ordering',                NULL),
  ('priority_support',       'boolean', 'Priority customer support',                      NULL)
ON CONFLICT (key) DO UPDATE
  SET kind = EXCLUDED.kind,
      description = EXCLUDED.description,
      unit = EXCLUDED.unit;


-- ---------------------------------------------------------------------
-- 2. tier_entitlements — the resolution matrix (MEMBERSHIP §Tier/Entitlement Matrix)
-- Columns: tier, entitlement_key, enabled, limit_int, is_unlimited, level_value
-- NOTE: 'ultimate' and 'top' rows are BYTE-IDENTICAL for every key.
-- ---------------------------------------------------------------------

-- ===== swipes_per_day (quota) =====
INSERT INTO public.tier_entitlements (tier, entitlement_key, enabled, limit_int, is_unlimited, level_value) VALUES
  ('free',     'swipes_per_day', true, 30,  false, NULL),
  ('pro',      'swipes_per_day', true, 150, false, NULL),
  ('ultimate', 'swipes_per_day', true, NULL, true, NULL),
  ('top',      'swipes_per_day', true, NULL, true, NULL)
ON CONFLICT (tier, entitlement_key) DO UPDATE
  SET enabled = EXCLUDED.enabled, limit_int = EXCLUDED.limit_int,
      is_unlimited = EXCLUDED.is_unlimited, level_value = EXCLUDED.level_value;

-- ===== max_favorites (quota) =====
INSERT INTO public.tier_entitlements (tier, entitlement_key, enabled, limit_int, is_unlimited, level_value) VALUES
  ('free',     'max_favorites', true, 10,  false, NULL),
  ('pro',      'max_favorites', true, 100, false, NULL),
  ('ultimate', 'max_favorites', true, NULL, true, NULL),
  ('top',      'max_favorites', true, NULL, true, NULL)
ON CONFLICT (tier, entitlement_key) DO UPDATE
  SET enabled = EXCLUDED.enabled, limit_int = EXCLUDED.limit_int,
      is_unlimited = EXCLUDED.is_unlimited, level_value = EXCLUDED.level_value;

-- ===== max_folders (quota) — free=1 (the default folder only) =====
INSERT INTO public.tier_entitlements (tier, entitlement_key, enabled, limit_int, is_unlimited, level_value) VALUES
  ('free',     'max_folders', true, 1,   false, NULL),
  ('pro',      'max_folders', true, 5,   false, NULL),
  ('ultimate', 'max_folders', true, NULL, true, NULL),
  ('top',      'max_folders', true, NULL, true, NULL)
ON CONFLICT (tier, entitlement_key) DO UPDATE
  SET enabled = EXCLUDED.enabled, limit_int = EXCLUDED.limit_int,
      is_unlimited = EXCLUDED.is_unlimited, level_value = EXCLUDED.level_value;

-- ===== max_saved_searches (quota) — free=0 (disabled) =====
INSERT INTO public.tier_entitlements (tier, entitlement_key, enabled, limit_int, is_unlimited, level_value) VALUES
  ('free',     'max_saved_searches', false, 0,   false, NULL),
  ('pro',      'max_saved_searches', true,  3,   false, NULL),
  ('ultimate', 'max_saved_searches', true,  NULL, true, NULL),
  ('top',      'max_saved_searches', true,  NULL, true, NULL)
ON CONFLICT (tier, entitlement_key) DO UPDATE
  SET enabled = EXCLUDED.enabled, limit_int = EXCLUDED.limit_int,
      is_unlimited = EXCLUDED.is_unlimited, level_value = EXCLUDED.level_value;

-- ===== filters_geo_amenity (level) =====
INSERT INTO public.tier_entitlements (tier, entitlement_key, enabled, limit_int, is_unlimited, level_value) VALUES
  ('free',     'filters_geo_amenity', false, NULL, false, 'none'),
  ('pro',      'filters_geo_amenity', true,  NULL, false, 'some'),
  ('ultimate', 'filters_geo_amenity', true,  NULL, false, 'all'),
  ('top',      'filters_geo_amenity', true,  NULL, false, 'all')
ON CONFLICT (tier, entitlement_key) DO UPDATE
  SET enabled = EXCLUDED.enabled, limit_int = EXCLUDED.limit_int,
      is_unlimited = EXCLUDED.is_unlimited, level_value = EXCLUDED.level_value;

-- ===== rewind (boolean) =====
INSERT INTO public.tier_entitlements (tier, entitlement_key, enabled, limit_int, is_unlimited, level_value) VALUES
  ('free',     'rewind', false, NULL, false, NULL),
  ('pro',      'rewind', true,  NULL, false, NULL),
  ('ultimate', 'rewind', true,  NULL, false, NULL),
  ('top',      'rewind', true,  NULL, false, NULL)
ON CONFLICT (tier, entitlement_key) DO UPDATE
  SET enabled = EXCLUDED.enabled, limit_int = EXCLUDED.limit_int,
      is_unlimited = EXCLUDED.is_unlimited, level_value = EXCLUDED.level_value;

-- ===== no_ads (boolean) =====
INSERT INTO public.tier_entitlements (tier, entitlement_key, enabled, limit_int, is_unlimited, level_value) VALUES
  ('free',     'no_ads', false, NULL, false, NULL),
  ('pro',      'no_ads', true,  NULL, false, NULL),
  ('ultimate', 'no_ads', true,  NULL, false, NULL),
  ('top',      'no_ads', true,  NULL, false, NULL)
ON CONFLICT (tier, entitlement_key) DO UPDATE
  SET enabled = EXCLUDED.enabled, limit_int = EXCLUDED.limit_int,
      is_unlimited = EXCLUDED.is_unlimited, level_value = EXCLUDED.level_value;

-- ===== premium_agent_data (level): none | limited | full =====
INSERT INTO public.tier_entitlements (tier, entitlement_key, enabled, limit_int, is_unlimited, level_value) VALUES
  ('free',     'premium_agent_data', false, NULL, false, 'none'),
  ('pro',      'premium_agent_data', true,  NULL, false, 'limited'),
  ('ultimate', 'premium_agent_data', true,  NULL, false, 'full'),
  ('top',      'premium_agent_data', true,  NULL, false, 'full')
ON CONFLICT (tier, entitlement_key) DO UPDATE
  SET enabled = EXCLUDED.enabled, limit_int = EXCLUDED.limit_int,
      is_unlimited = EXCLUDED.is_unlimited, level_value = EXCLUDED.level_value;

-- ===== saved_search_alerts (boolean) =====
INSERT INTO public.tier_entitlements (tier, entitlement_key, enabled, limit_int, is_unlimited, level_value) VALUES
  ('free',     'saved_search_alerts', false, NULL, false, NULL),
  ('pro',      'saved_search_alerts', true,  NULL, false, NULL),
  ('ultimate', 'saved_search_alerts', true,  NULL, false, NULL),
  ('top',      'saved_search_alerts', true,  NULL, false, NULL)
ON CONFLICT (tier, entitlement_key) DO UPDATE
  SET enabled = EXCLUDED.enabled, limit_int = EXCLUDED.limit_int,
      is_unlimited = EXCLUDED.is_unlimited, level_value = EXCLUDED.level_value;

-- ===== instant_listing_alerts (boolean) — pro=off, ultimate/top=on =====
INSERT INTO public.tier_entitlements (tier, entitlement_key, enabled, limit_int, is_unlimited, level_value) VALUES
  ('free',     'instant_listing_alerts', false, NULL, false, NULL),
  ('pro',      'instant_listing_alerts', false, NULL, false, NULL),
  ('ultimate', 'instant_listing_alerts', true,  NULL, false, NULL),
  ('top',      'instant_listing_alerts', true,  NULL, false, NULL)
ON CONFLICT (tier, entitlement_key) DO UPDATE
  SET enabled = EXCLUDED.enabled, limit_int = EXCLUDED.limit_int,
      is_unlimited = EXCLUDED.is_unlimited, level_value = EXCLUDED.level_value;

-- ===== fresh_listings_first (boolean) — pro=off, ultimate/top=on =====
INSERT INTO public.tier_entitlements (tier, entitlement_key, enabled, limit_int, is_unlimited, level_value) VALUES
  ('free',     'fresh_listings_first', false, NULL, false, NULL),
  ('pro',      'fresh_listings_first', false, NULL, false, NULL),
  ('ultimate', 'fresh_listings_first', true,  NULL, false, NULL),
  ('top',      'fresh_listings_first', true,  NULL, false, NULL)
ON CONFLICT (tier, entitlement_key) DO UPDATE
  SET enabled = EXCLUDED.enabled, limit_int = EXCLUDED.limit_int,
      is_unlimited = EXCLUDED.is_unlimited, level_value = EXCLUDED.level_value;

-- ===== priority_support (boolean) — pro=off, ultimate/top=on =====
INSERT INTO public.tier_entitlements (tier, entitlement_key, enabled, limit_int, is_unlimited, level_value) VALUES
  ('free',     'priority_support', false, NULL, false, NULL),
  ('pro',      'priority_support', false, NULL, false, NULL),
  ('ultimate', 'priority_support', true,  NULL, false, NULL),
  ('top',      'priority_support', true,  NULL, false, NULL)
ON CONFLICT (tier, entitlement_key) DO UPDATE
  SET enabled = EXCLUDED.enabled, limit_int = EXCLUDED.limit_int,
      is_unlimited = EXCLUDED.is_unlimited, level_value = EXCLUDED.level_value;


-- ---------------------------------------------------------------------
-- 3. amenities_catalog — bilingual ES/PT (REELS-FICHA §4.1 seed list)
-- Stable smallint ids. scope: unit|building. category for grouping.
-- ---------------------------------------------------------------------
INSERT INTO public.amenities_catalog (id, key, scope, category, label_es, label_pt, icon, display_order) VALUES
  ( 1, 'pool',            'building', 'leisure',        'Pileta',                 'Piscina',                 'waves',          10),
  ( 2, 'pool_heated',     'building', 'leisure',        'Pileta climatizada',     'Piscina aquecida',        'waves',          11),
  ( 3, 'solarium',        'building', 'leisure',        'Solárium',               'Sky park / Solário',      'sun',            12),
  ( 4, 'gym',             'building', 'leisure',        'Gimnasio',               'Academia',                'dumbbell',       20),
  ( 5, 'party_room',      'building', 'leisure',        'SUM',                    'Salão de festas',         'party-popper',   21),
  ( 6, 'grill',           'building', 'leisure',        'Parrilla',               'Churrasqueira',           'flame',          22),
  ( 7, 'sauna',           'building', 'leisure',        'Sauna',                  'Sauna',                   'thermometer',    23),
  ( 8, 'jacuzzi',         'building', 'leisure',        'Jacuzzi',                'Hidromassagem',           'bath',           24),
  ( 9, 'laundry',         'building', 'services',       'Laundry',                'Lavanderia',              'washing-machine',30),
  (10, 'security_24h',    'building', 'security',       'Seguridad 24h',          'Portaria 24h',            'shield',         40),
  (11, 'cctv',            'building', 'security',       'CFTV / Cámaras',         'CFTV / Câmeras',          'cctv',           41),
  (12, 'parking',         'unit',     'services',       'Cochera',                'Vaga de garagem',         'car',            50),
  (13, 'storage_room',    'unit',     'services',       'Baulera',                'Depósito privativo',      'box',            51),
  (14, 'elevator',        'building', 'accessibility',  'Ascensor',               'Elevador',                'move-vertical',  60),
  (15, 'green_space',     'building', 'leisure',        'Espacio verde',          'Jardim',                  'trees',          70),
  (16, 'playground',      'building', 'leisure',        'Juegos infantiles',      'Playground',              'baby',           71),
  (17, 'sports_court',    'building', 'leisure',        'Cancha deportiva',       'Quadra esportiva',        'volleyball',     72),
  (18, 'cinema',          'building', 'leisure',        'Microcine',              'Cinema',                  'clapperboard',   73),
  (19, 'coworking',       'building', 'services',       'Coworking',              'Business center',         'briefcase',      80),
  (20, 'reception',       'building', 'services',       'Recepción',              'Recepção',                'concierge-bell', 81),
  (21, 'ac_split',        'unit',     'comfort',        'Aire acondicionado split','Ar-condicionado split',  'air-vent',       90),
  (22, 'heating',         'unit',     'comfort',        'Calefacción',            'Aquecimento',             'flame',          91),
  (23, 'balcony',         'unit',     'comfort',        'Balcón',                 'Varanda',                 'door-open',      92),
  (24, 'closet',          'unit',     'comfort',        'Placares / Vestidor',    'Closet',                  'shirt',          93),
  (25, 'ev_charger',      'building', 'sustainability', 'Punto de carga EV',      'Ponto de carga EV',       'plug-zap',      100),
  (26, 'pet_friendly',    'building', 'services',       'Apto mascotas',          'Aceita pet',              'paw-print',     110)
ON CONFLICT (id) DO UPDATE
  SET key = EXCLUDED.key, scope = EXCLUDED.scope, category = EXCLUDED.category,
      label_es = EXCLUDED.label_es, label_pt = EXCLUDED.label_pt,
      icon = EXCLUDED.icon, display_order = EXCLUDED.display_order;
