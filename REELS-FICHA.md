# REELS-FICHA.md

> Build-ready reference for the two-layer property model in Reel Estate. Reconciles research (LATAM + global portals), the `property_reels` design, and the ficha "knowledge library" design into one cohesive plan. **Everything is ADDITIVE over the locked core schema — nothing here redesigns `profiles`, `properties`, `property_images`, `likes`, `folders`, `folder_items`, or the membership layer.**

---

## 1. Overview — Reel vs Ficha

Two distinct layers, one property. This separation is the spine of the whole design.

| | **REEL** (discovery) | **FICHA** (knowledge library) |
|---|---|---|
| **What** | A vertical 9:16 video OR curated photo-set, full-screen in the swipe feed | The full structured detail page — everything Zonaprop/QuintoAndar show |
| **Cardinality** | `property (1) → reels (N)`, exactly **one PRIMARY** | `property (1) → ficha (1)` (a composed view, not a single table) |
| **Role** | The hero motion/immersive unit that wins the scroll | The deep, scannable, filterable structured record |
| **Feed** | The PRIMARY reel IS the feed viewport unit | Opened on tap from the feed card |
| **Table** | `property_reels` (new, typed media) | composed from many additive child tables |
| **Render** | `expo-video` (video) / `expo-image` (image_set) | sectioned scroll, `FlashList`-free static layout |

**Locked invariants:**
- The feed advances **property by property** (keyset over `properties`). The primary reel is **JOINED in**, never the pagination unit. Not reel-per-item, not a horizontal carousel (MVP).
- Tap a feed card → open the ficha. The ficha shows ALL `property_images`, the non-primary reels, plus the full structured record.
- `properties.cover_image_path` = the primary reel's poster (the denormalized still for the zero-join feed card).

**Why two tables, not one media table:** the portals (Zillow 2023 redesign, Zonaprop, QuintoAndar) ALL treat video/3D as **distinct, badged, first-class** media types — never folded into the photo grid. Matterport 3D drives ~300% more engagement than photos. Reel Estate mirrors that: one hero motion unit for discovery, a deeper structured gallery in the detail page.

> **Reconciliation note (reels table naming):** the reels design proposes a focused `property_reels` table (video | image_set); the ficha design proposes a broader `property_media` table (reel_video | photo_set | virtual_tour_3d | floor_plan | drone | map_embed). **This doc adopts `property_reels` as the canonical feed-discovery table** (single-responsibility, hot feed path, DB-enforced one-primary) and **adds the non-reel rich media types — 3D tour, floor plan, drone, map — as a separate `property_media` sibling table** scoped to the ficha only. See [§2.4](#24-reconciling-reels-vs-property_images-vs-property_media). This keeps the 60fps feed query touching exactly one tight table while still giving the ficha its badged 3D/floor-plan/drone tabs.

---

## 2. Reels Data Model & Feed Integration

### 2.1 `property_reels` — the feed discovery unit

ADDITIVE. Does NOT touch `properties` or `property_images`. Mirrors `property_images` path/blurhash/position conventions and the `folders.is_default` partial-unique pattern for one-primary enforcement. Stores **storage object paths, never URLs** (client resolves signed URLs at read time).

```sql
CREATE TYPE reel_media_type AS ENUM ('video', 'image_set');
CREATE TYPE reel_status     AS ENUM ('processing', 'ready', 'hidden');

CREATE TABLE property_reels (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id        uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  media_type         reel_media_type NOT NULL,
  video_path         text NULL,            -- 'reels' bucket: {property_id}/{reel_id}/source.mp4 (REQUIRED when video)
  poster_path        text NULL,            -- still that feeds the card + cover_image_path (REQUIRED both types)
  image_paths        text[] NULL,          -- ordered keys for image_set (REQUIRED non-empty when image_set)
  thumbnail_blurhash text NULL,            -- zero-byte placeholder, never a blank card
  duration_ms        integer NULL CHECK (duration_ms IS NULL OR duration_ms > 0),
  aspect_ratio       numeric(6,4) NOT NULL DEFAULT 0.5625,  -- 9:16, stored to prevent CLS
  caption            text NULL CHECK (caption IS NULL OR char_length(caption) <= 280),
  position           smallint NOT NULL DEFAULT 0,           -- order within ficha Multimedia carousel
  is_primary         boolean NOT NULL DEFAULT false,        -- exactly one per property (DB-enforced)
  status             reel_status NOT NULL DEFAULT 'ready',  -- only 'ready' is feed/ficha visible
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),    -- shared set_updated_at() BEFORE UPDATE trigger
  CONSTRAINT reel_media_shape CHECK (
    (media_type = 'video'     AND video_path IS NOT NULL AND image_paths IS NULL)
    OR
    (media_type = 'image_set' AND image_paths IS NOT NULL AND array_length(image_paths,1) >= 1 AND video_path IS NULL)
  )
);
```

**Indexes:**

```sql
-- THE one-primary-per-property enforcement (exact mirror of folders UNIQUE(user_id) WHERE is_default)
CREATE UNIQUE INDEX property_reels_one_primary
  ON property_reels (property_id) WHERE is_primary AND status = 'ready';

-- The index the feed JOIN rides: O(1) primary-reel lookup per property
CREATE INDEX property_reels_primary_feed
  ON property_reels (property_id) WHERE is_primary AND status = 'ready';

-- Ordered fetch of ALL reels for the ficha Multimedia carousel (also the FK index)
CREATE INDEX property_reels_property_position
  ON property_reels (property_id, position);

-- Visibility-scoped parent lookups / cheap existence checks
CREATE INDEX property_reels_property_ready
  ON property_reels (property_id) WHERE status = 'ready';
```

### 2.2 Primary-reel strategy (DB-enforced, not app-enforced)

- **Enforcement:** the partial unique `(property_id) WHERE is_primary AND status='ready'`. Postgres physically rejects a second primary — no app-level race window. Same shape as `folders UNIQUE(user_id) WHERE is_default`.
- **Why scoped to `status='ready'`:** rotation. Swap primary in ONE transaction — set old `is_primary=false` (or `status='hidden'`) and new `is_primary=true`. The hidden former-primary never collides.
- **Selection (MVP, seed-only):** seed marks the curated vertical 9:16 **video** reel as `is_primary=true`; themed secondary reels + image_sets are `is_primary=false` and surface only in the ficha. An `image_set` primary is the allowed **fallback** when a seller has no video.
- **Fail-closed:** a property with zero ready primaries (e.g. all `processing`) has **no index entry** and is invisible to the feed (the feed INNER-JOINs the primary). Correct behavior — never show a card with no media.
- **Later (owner uploads):** same partial unique holds; add a `SECURITY DEFINER owns_property(property_id)` guard to write policies (analogue of `owns_folder`).

### 2.3 Feed query — pagination stays property-by-property

Keyset over PROPERTIES (unchanged from FOUNDATION). The primary reel is INNER-JOINed; it does NOT become the pagination unit.

```sql
SELECT
  p.id, p.title, p.price_cents, p.currency, p.listing_type,
  p.bedrooms, p.bathrooms, p.area_total_sqm, p.city, p.region,
  p.like_count, p.save_count, p.published_at,
  r.id AS reel_id, r.media_type, r.video_path, r.poster_path,
  r.image_paths, r.thumbnail_blurhash, r.duration_ms, r.aspect_ratio, r.caption
FROM properties p
JOIN property_reels r
  ON r.property_id = p.id
 AND r.is_primary
 AND r.status = 'ready'            -- rides property_reels_primary_feed
WHERE p.status = 'active' AND p.deleted_at IS NULL   -- SAME predicate as the RLS SELECT policy
  -- + optional filters: listing_type, price_cents range, bedrooms, rooms, parking_spaces, location <-> :point
  AND (p.published_at, p.id) < (:last_published_at, :last_id)   -- KEYSET, never OFFSET
ORDER BY p.published_at DESC, p.id DESC
LIMIT :page_size;   -- capped <= 20 (anti-scraping, OWASP A04)
```

**Key points:**
- **INNER JOIN on purpose** — a property with no ready primary reel does NOT appear (fail-closed). This replaces relying on `cover_image_path` alone.
- The join is **O(1) per property** (partial index returns exactly one row). The keyset walks the existing partial feed index on `properties` `WHERE deleted_at IS NULL AND status='active'` ordered by `(published_at DESC, id DESC)`. **Page fetches stay O(1) at any depth — NEVER OFFSET** (it scans all prior rows under RLS).
- The cursor is the **last property's** `(published_at, id)` tuple — the reel join never participates in the cursor, so adding reels did NOT change the pagination contract. `TanStack useInfiniteQuery.getNextPageParam` returns that tuple; `fetchNextPage` fires as the active index nears end-of-page.
- Denormalized counts + reel poster read **inline — zero aggregation on the hot path** (preserves the 60fps invariant).

### 2.4 Reconciling reels vs `property_images` vs `property_media`

**CLEAN SEPARATION — three tables, three responsibilities, zero overlap:**

| Table | Layer | Holds | Renderer |
|---|---|---|---|
| `property_images` (**unchanged**) | Ficha | The deep photo gallery (the "37 Fotos" grid) — plain stills, `(property_id, position)` | `expo-image` |
| `property_reels` (**new**) | Feed + Ficha | Typed feed media: vertical video OR curated image_set; carries `is_primary` feed semantics + video fields | `expo-video` / `expo-image` |
| `property_media` (**new, ficha-only**) | Ficha | The OTHER badged rich media: `virtual_tour_3d`, `floor_plan`, `drone`, `map_embed` | tab-specific |

**Why NOT extend `property_images`:** it would force nullable video columns on every gallery photo, conflate "gallery still" with "feed unit", and break the clean `(property_id, position)` gallery semantics. The reels carry `is_primary` feed-selection that the gallery has no concept of.

**Why split `property_reels` from `property_media`:** the feed hot path must touch exactly ONE tight table. `property_reels` is single-responsibility (video|image_set, DB-enforced one-primary, feed-query optimized). The 3D tour / floor plan / drone / map are **ficha-only**, never on the feed path — keeping them out of `property_reels` keeps the feed index and CHECK constraint clean. (If you prefer one table, the ficha design's broader `property_media` enum is a valid alternative — but you lose the tight feed-only index.)

```sql
-- Ficha-only rich media (NOT on the feed path)
CREATE TYPE media_type AS ENUM ('virtual_tour_3d', 'floor_plan', 'drone', 'map_embed');

CREATE TABLE property_media (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  media_type    media_type NOT NULL,
  storage_path  text NULL,        -- self-hosted (floor plan, drone) in private bucket
  external_url  text NULL,        -- Matterport/3D-tour URL; validate host allow-list (OWASP A10/SSRF)
  thumbnail_path text NULL,
  blurhash      text NULL,        -- avoid CLS
  width         smallint NULL,
  height        smallint NULL,
  position      smallint NOT NULL DEFAULT 0,
  alt_text      text NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (storage_path IS NOT NULL OR external_url IS NOT NULL)
);
CREATE INDEX property_media_property_position ON property_media (property_id, position);
```

**`cover_image_path` reconciliation (one denormalization-source change, not a redesign):** today FOUNDATION syncs `cover_image_path` from `property_images` position=0. **Switch the trigger to sync from the PRIMARY reel's `poster_path`** so the feed card's denormalized still always matches the feed unit shown. **Precedence:** primary reel `poster_path` → (fallback) `property_images` position=0 → NULL. Zero-join feed render and the existing `cover_image_path` contract stay intact.

**Ficha composition:** the ficha shows (a) ALL `property_images` as the photo gallery, AND (b) all reels (primary replayable + non-primary) AND (c) `property_media` 3D/floor-plan/drone/map — as **switchable badged tabs** (the portal tab/badge pattern).

---

## 3. Ficha Data Model (Knowledge Library)

The ficha is a **composed view** over `properties` + additive child tables. Modeling discipline (locked to FOUNDATION):

- **Hot / always-present / filterable** → COLUMNS on `properties` (indexed for M6).
- **Yes/no presence with present-vs-absent semantics** → `amenities_catalog` + `property_amenities` M:N.
- **Long-tail curated-filterable** → typed-EAV `property_attributes` (+ optional `jsonb` escape hatch for sparse display-only).
- **Money** → polymorphic `property_costs` (AR/BR, buy/rent; monthly TOTAL computed, never stored).
- **Buy/rent flags + scalars** → 1:1 `property_terms`, rendered by `listing_type`.
- **Provenance** → `listing_details` (public). **Sensitive contact + agent intel** → `listing_contacts` behind a gated RPC.

### 3.1 New columns on `properties`

Additive. Every column M6 filters on gets an index.

| Column | Type | Meaning / market |
|---|---|---|
| `area_total_sqm` | `numeric(10,2)` | AR superficie total / BR área total. **Recommend: keep existing `area_sqm` as the total + add the rest, to avoid touching feed code.** |
| `area_covered_sqm` | `numeric(10,2)` | AR cubierta / BR área útil (privativa) — the m² for `price_per_m2`. **Indexed.** |
| `area_uncovered_sqm` | `numeric(10,2)` NULL | AR descubierta |
| `area_semicovered_sqm` | `numeric(10,2)` NULL | AR semicubierta (balcón/galería) — AR-only triad |
| `area_land_sqm` | `numeric(10,2)` NULL | terreno / área do terreno (casas/PH) |
| `rooms` | `smallint` NULL | AR **ambientes** (living + bedrooms; monoambiente=1). **DISTINCT from bedrooms — ambientes ≠ quartos.** Indexed. |
| `suites` | `smallint` NULL | BR suítes (ensuite bedrooms) |
| `half_bathrooms` | `smallint` NULL | toilette/lavabo (full baths stay in `bathrooms`) |
| `parking_spaces` | `smallint` NOT NULL DEFAULT 0 | cocheras / vagas. **Indexed (M6).** |
| `floor_number` | `smallint` NULL | piso/andar (0/neg = PB/térreo). Indexed. |
| `total_floors` | `smallint` NULL | plantas del edificio |
| `unit_levels` | `smallint` NULL DEFAULT 1 | dúplex=2, tríplex=3 |
| `year_built` | `smallint` NULL | año de construcción (decade-only → `property_attributes`) |
| `age_years` | `smallint` NULL | antigüedad |
| `is_new_construction` | `boolean` NOT NULL DEFAULT false | a estrenar / lançamento |
| `is_under_construction` | `boolean` NOT NULL DEFAULT false | en pozo / na planta |
| `orientation` | `orientation` NULL | enum n/s/e/w/ne/nw/se/sw — LATAM-strong. Indexed. |
| `disposition` | `disposition` NULL | AR enum frente/contrafrente/interno/lateral. Indexed. |
| `condition` | `property_condition` NULL | enum new/excellent/very_good/good/to_renovate/reciclado. Indexed. |
| `metro_nearby` | `boolean` NOT NULL DEFAULT false | denormalized header badge (detail in `property_pois`). Partial-indexed. |
| `apt_credit` | `boolean` NOT NULL DEFAULT false | AR "Apto crédito" — **column here so feed card/filter reads it without a join** (also mirrored in `property_terms`). Partial-indexed. |
| `locale` | `text` NOT NULL DEFAULT 'es-AR' | es-AR \| pt-BR — drives `search_tsv` regconfig (`'spanish'` vs `'portuguese'`) and ES/PT label selection |

```sql
-- M6 filter indexes for the new columns
CREATE INDEX properties_rooms_idx          ON properties (rooms);
CREATE INDEX properties_parking_idx        ON properties (parking_spaces);
CREATE INDEX properties_floor_idx          ON properties (floor_number);
CREATE INDEX properties_orientation_idx    ON properties (orientation);
CREATE INDEX properties_condition_idx      ON properties (condition);
CREATE INDEX properties_area_covered_idx   ON properties (area_covered_sqm);
CREATE INDEX properties_apt_credit_idx     ON properties (apt_credit)   WHERE apt_credit;
CREATE INDEX properties_metro_nearby_idx   ON properties (metro_nearby) WHERE metro_nearby;
```

> `search_tsv` should be a GENERATED expression that switches regconfig on `locale` so ES (AR) tokenizes as `'spanish'` and PT (BR) as `'portuguese'`.

### 3.2 `property_costs` — polymorphic money (the biggest AR↔BR divergence)

One row per cost line. Renders BR's summed monthly breakdown (aluguel + condomínio + IPTU + seguro incêndio + taxa = TOTAL) AND AR's flat expensas + one-time-buyer list **from the same schema, zero branching**.

```sql
CREATE TYPE cost_type   AS ENUM (
  'rent','sale_price','expensas','condominio','iptu','abl',
  'seguro_incendio','taxa_servico','deposit','itbi','notary',
  'registry','agency_fee','other');
CREATE TYPE cost_period AS ENUM ('monthly','yearly','once');

CREATE TABLE property_costs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  cost_type     cost_type NOT NULL,
  amount_cents  bigint NOT NULL CHECK (amount_cents >= 0),
  currency      char(3) NOT NULL DEFAULT 'ARS',     -- ARS/USD/BRL, per-row (AR USD venta, ARS alquiler)
  period        cost_period NOT NULL,
  is_estimate   boolean NOT NULL DEFAULT false,     -- ITBI/cartório/notary are estimates
  included      boolean NOT NULL DEFAULT false,     -- ABL/IPTU 'incluido' → show, exclude from sum
  label         text NULL,                          -- free-text when cost_type='other'
  display_order smallint NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX property_costs_order_idx ON property_costs (property_id, display_order);
CREATE INDEX property_costs_type_idx  ON property_costs (property_id, cost_type);
```

- **Monthly TOTAL is COMPUTED** in the read query/view: `SUM(amount_cents) WHERE period='monthly' AND NOT included`. Never stored — avoids drift.
- **Single-source rule:** the headline price stays in `properties.price_cents` (+ `currency`), denormalized for the feed card and keyset sort — **the feed NEVER joins `property_costs`.** The `sale_price`/`rent` cost row **mirrors** it for the unified breakdown panel; the seeder keeps them in sync, `properties` is authoritative.
- `price_per_m2` is COMPUTED (`price_cents / area_covered_sqm`), never stored.

### 3.3 `property_terms` — 1:1 buy/rent flags & scalars

Rent columns and buy columns coexist as nullable fields on ONE row; the ficha renders the rent set OR buy set by `listing_type`. Mirrors Rightmove's Sales/Lettings split.

```sql
CREATE TYPE guarantee_type  AS ENUM (
  'garantia_propietaria','fianza','seguro_caucion','recibo_sueldo',   -- AR
  'fiador','seguro_fianca','caucao','institutional_none');            -- BR (QuintoAndar = institutional_none)
CREATE TYPE furnished_state AS ENUM ('unfurnished','semi','furnished');

CREATE TABLE property_terms (
  property_id      uuid PRIMARY KEY REFERENCES properties(id) ON DELETE CASCADE,  -- 1:1
  -- RENT --
  deposit_months          numeric(3,1) NULL,   -- AR depósito = 1 mes / BR caução
  advance_months          numeric(3,1) NULL,   -- AR mes de adelanto
  guarantee_types         guarantee_type[] NULL,
  min_term_months         smallint NULL,        -- AR legal min 36
  min_income_cents        bigint NULL,          -- BR renda bruta mínima
  min_income_note         text NULL,            -- 'a partir de R$ 6.243 até 4 pessoas'
  credit_check_required   boolean NULL,         -- BR avaliação de crédito
  is_furnished            furnished_state NULL, -- sem mobília/semimobiliado/mobiliado
  pets_allowed            boolean NULL,         -- aceita pet / apto mascotas
  available_from          date NULL,
  utilities_included      boolean NULL,
  -- BUY --
  apt_credit              boolean NULL,         -- AR apto crédito (mirrored on properties for feed)
  apt_professional        boolean NULL,         -- AR apto profesional
  accepts_financing       boolean NULL,         -- BR aceita financiamento
  accepts_fgts            boolean NULL,         -- BR aceita FGTS
  title_status            text NULL,            -- escritura/matrícula
  transfer_tax_estimate_cents bigint NULL,      -- ITBI / sellos
  notary_estimate_cents       bigint NULL,      -- escritura/cartório
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX property_terms_apt_credit_idx ON property_terms (apt_credit)   WHERE apt_credit;
CREATE INDEX property_terms_pets_idx       ON property_terms (pets_allowed) WHERE pets_allowed;
CREATE INDEX property_terms_furnished_idx  ON property_terms (is_furnished);
```

- Drive the rent-vs-buy render off `properties.listing_type`, **NOT** off which columns are null.
- Cross-table CHECK (guarantee only when rent) can't reach `properties.listing_type` in a row CHECK — **enforce softly in the seeder**, not a hard constraint.

### 3.4 `property_price_events` — price history (LATAM differentiator)

Append-only timeline. Zonaprop/QuintoAndar do NOT show this; Zillow/Redfin do — high trust, low data cost. Enables the "price reduced" badge.

```sql
CREATE TYPE price_event_type AS ENUM ('listed','price_changed','status_changed','relisted','delisted');

CREATE TABLE property_price_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id  uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  event_type   price_event_type NOT NULL,
  price_cents  bigint NULL CHECK (price_cents >= 0),
  currency     char(3) NULL,
  status       listing_status NULL,    -- snapshot at event
  note         text NULL,
  occurred_at  timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX property_price_events_idx ON property_price_events (property_id, occurred_at DESC);
```

Append-only (no UPDATE/DELETE path). Can later be auto-populated by an `AFTER UPDATE` trigger on `properties.price_cents`.

### 3.5 `property_pois` — location intelligence (curated)

QuintoAndar "Metrô próximo" / transporte / educação / saúde / parques. MVP = curated text + distance; later PostGIS-derived from a POI dataset via `properties.location`.

```sql
CREATE TYPE poi_type AS ENUM (
  'transit_subway','transit_train','transit_bus','education','health','park','shopping','other');

CREATE TABLE property_pois (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  poi_type      poi_type NOT NULL,
  name          text NOT NULL,                     -- 'Estação Santa Cecília'
  distance_m    integer NULL,
  walk_minutes  smallint NULL,
  location      geography(Point,4326) NULL,        -- optional, future PostGIS derivation
  display_order smallint NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX property_pois_idx ON property_pois (property_id, poi_type, distance_m);
```

The `properties.metro_nearby` boolean is the cheap denormalized header badge; this table is the detailed list.

### 3.6 `listing_details` + `listing_contacts` — advertiser (public identity vs gated contact)

Split into two tables to make the membership gate a **DATABASE boundary, not a client check**.

```sql
CREATE TYPE advertiser_type AS ENUM ('agency','owner','managed');  -- inmobiliaria | dueño | gestionado

-- PUBLIC identity & provenance
CREATE TABLE listing_details (
  property_id        uuid PRIMARY KEY REFERENCES properties(id) ON DELETE CASCADE,  -- 1:1
  listing_code       text UNIQUE NULL,             -- public opaque código for shareable URLs (NOT the uuid)
  advertiser_type    advertiser_type NOT NULL DEFAULT 'agency',
  agency_name        text NULL,
  agency_logo_path   text NULL,
  broker_name        text NULL,
  broker_license     text NULL,                    -- matrícula CUCICBA (AR) / CRECI (BR)
  broker_license_authority text NULL,              -- 'CUCICBA' | 'CMCPSI' | 'CRECI'
  source             text NULL,
  published_at       timestamptz NULL,             -- feeds properties.published_at keyset order
  listed_updated_at  timestamptz NULL,
  other_listings_count integer NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX listing_details_code_idx ON listing_details (listing_code) WHERE listing_code IS NOT NULL;
CREATE INDEX listing_details_advertiser_idx  ON listing_details (advertiser_type);

-- SENSITIVE contact + premium intel (NO broad public SELECT)
CREATE TABLE listing_contacts (
  property_id        uuid PRIMARY KEY REFERENCES properties(id) ON DELETE CASCADE,  -- 1:1
  contact_whatsapp   text NULL,                    -- E.164
  contact_phone      text NULL,
  contact_email      citext NULL,
  contact_form_enabled boolean NOT NULL DEFAULT true,
  agent_perf_summary jsonb NULL,                   -- days-on-market, price-cut history, comps (full tier)
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
```

**Gated reveal RPC** (the security boundary — a patched client gets NOTHING):

```sql
CREATE FUNCTION get_listing_contact(p_property_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE lvl text;
BEGIN
  IF NOT public.is_property_visible(p_property_id) THEN RETURN NULL; END IF;
  lvl := public.resolve_entitlement((select auth.uid()), 'premium_agent_data');  -- none|limited|full
  -- 'none'    -> identity only + upgrade CTA (no contact)
  -- 'limited' -> broker_name + masked/partial contact + contact form
  -- 'full'    -> full contact + agent_perf_summary
  ...
END $$;
REVOKE ALL ON FUNCTION get_listing_contact(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION get_listing_contact(uuid) TO authenticated;
```

Free users see WHO is selling (identity, license) from `listing_details`; unlocking the **contact channel + agent intel** is the gated capability — consumes the existing `premium_agent_data` LEVEL entitlement (none/limited/full) from MEMBERSHIP.md. UX gate (blur/CTA) and security gate (RPC returns nothing) stay independent (OWASP A01).

---

## 4. Amenities & Attributes

### 4.1 Amenities — normalized M:N (the QuintoAndar "presentes vs ausentes" pattern)

NOT free text — amenities must be queryable/filterable for M6.

```sql
CREATE TYPE amenity_scope    AS ENUM ('unit','building');  -- AC/balcony (unit) vs pool/gym (building) — two filter axes
CREATE TYPE amenity_category AS ENUM (
  'comfort','security','leisure','services','sustainability','connectivity','accessibility');

CREATE TABLE amenities_catalog (
  id            smallint PRIMARY KEY,           -- stable small int, NOT uuid (hot reference data, dense join index)
  key           text UNIQUE NOT NULL,           -- 'pool','gym','elevator','grill','security_24h','sauna',...
  scope         amenity_scope NOT NULL,
  category      amenity_category NULL,
  label_es      text NOT NULL,                  -- AR
  label_pt      text NOT NULL,                  -- BR
  icon          text NULL,                      -- lucide name
  display_order smallint NOT NULL DEFAULT 0,
  is_active     boolean NOT NULL DEFAULT true   -- retire without deleting historical joins
);
CREATE INDEX amenities_catalog_scope_idx    ON amenities_catalog (scope) WHERE is_active;
CREATE INDEX amenities_catalog_category_idx ON amenities_catalog (category);

CREATE TABLE property_amenities (
  property_id  uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  amenity_id   smallint NOT NULL REFERENCES amenities_catalog(id) ON DELETE RESTRICT,
  available    boolean NOT NULL DEFAULT true,   -- true=green chip, false=greyed 'indisponível', no row=unknown
  value        text NULL,                       -- qualifier: pool='climatizada', parking='2 vagas'
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (property_id, amenity_id)
);
-- Reverse filter 'all properties WITH pool' — index ONLY present-true rows (M6 hot path stays O(log n) and small)
CREATE INDEX property_amenities_filter_idx ON property_amenities (amenity_id, available) WHERE available;
```

- **`available` boolean IS the signal:** present-true = green chip; present-false = greyed "indisponível"; no row = unknown. Exactly QuintoAndar's "Itens disponíveis / indisponíveis".
- **Scope separates two filter axes:** UNIT amenity (AC, balcony) vs BUILDING amenity (pool, gym).
- **Catalog over enum:** adding an amenity is a seed INSERT (no `ALTER TYPE`); bilingual labels + scope/category need columns.

**Seed catalog (concrete, bilingual ES/PT):** pileta/piscina (+ climatizada), solárium/sky park, gimnasio/academia, SUM/salão de festas, parrilla/churrasqueira, sauna, jacuzzi/hidromassagem, laundry/lavanderia, seguridad 24h/portaria 24h, CFTV/cámaras, cochera/vaga, baulera/depósito privativo, ascensor/elevador, espacio verde/jardim, juegos/playground, quadra esportiva, microcine/cinema, coworking/business center, recepción/recepção, AC split (unit), calefacción/aquecimento (unit), balcón/varanda (unit), placares/closet (unit), ponto de carga EV, aceita pet.

### 4.2 Attributes — hybrid typed-EAV + jsonb escape hatch

For the long tail of `campo:valor` that is NOT worth a column and NOT a yes/no amenity (flooring type, heating type, condición, building name/decade, luminosity, ceiling height).

```sql
CREATE TABLE property_attributes (
  property_id  uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  attr_key     text NOT NULL,        -- allowlist: 'flooring','heating','condition','building_name',
                                     -- 'building_decade','disposition','luminosity','ceiling_height_m',...
  value_text   text NULL,
  value_num    numeric NULL,         -- range-filterable later (e.g. ceiling_height_m)
  value_bool   boolean NULL,
  unit         text NULL,            -- 'm','years'
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (property_id, attr_key)
);
CREATE INDEX property_attributes_text_idx ON property_attributes (attr_key, value_text);
CREATE INDEX property_attributes_num_idx  ON property_attributes (attr_key, value_num) WHERE value_num IS NOT NULL;
```

**The tradeoff (why hybrid, not pure jsonb or pure EAV):**
- **Pure jsonb** is great for sparse display-only data but WEAK for selective equality/range FILTERING at scale — GIN is larger, planner-opaque, can't be a tight composite btree; `flooring=porcelanato AND condition=excelente` degrades. You also lose type safety and value consistency across ES/PT.
- **Pure EAV** is filter-friendly per key but explodes row count and needs a self-join per attribute for multi-attribute queries.
- **Hybrid:** typed-EAV (`property_attributes`) for the **curated filterable** keys (indexed only on the handful product exposes as filters) + a single nullable `properties.extra jsonb` column as the **escape hatch** for sparse display-only extras (raw portal dumps, future energy-label sub-values, UK-style tenure block), GIN-indexed only if/when search needs it.

**Net:** columns for hot filters, catalog-M:N for amenities, typed-EAV for the curated filterable long tail, jsonb for sparse display-only. Keeps the feed/filter path on indexable btree/enum columns — no per-row subqueries the RLS-perf rule warns against.

---

## 5. Buy vs Rent

Driven off `properties.listing_type (buy|rent)` — **NOT two parallel schemas, NOT one flat bloated row.** Shared facts (beds/baths/area/kind/location/amenities/media/description/agent) live once. The divergence lives in two places: **`property_costs`** (money, polymorphic) and **`property_terms`** (flags/scalars, rendered by `listing_type`).

### 5.1 BUY (venta / comprar)

| Concern | AR | BR |
|---|---|---|
| **Price currency** | typically **USD** (per-row `currency`) | BRL |
| **Recurring monthly** | `expensas` (+ extraordinarias) | `condominio` + `iptu` |
| **One-time buyer costs** (`property_costs`, `period='once'`, `is_estimate=true`) | escritura (~2%), sellos/`itbi`, agency_fee, gestoría | `itbi` (2–3%, e.g. SP/Rio/BH 3%), escritura/`notary`, `registry`, financing fees (MIP+DFI) |
| **Flags** (`property_terms`) | `apt_credit` (clean escritura, mortgage-eligible), `apt_professional` | `accepts_financing`, `accepts_fgts` |
| **Computed** | `price_per_m2` = `price_cents / area_covered_sqm` | same |

### 5.2 RENT (alquiler / aluguel)

| Concern | AR | BR |
|---|---|---|
| **Price** | monthly **ARS** | monthly **BRL** |
| **Monthly cost shape** | `rent` + `expensas` (+ sometimes ABL) — flat extras list | **DECOMPOSED & summed:** `rent` + `condominio` + `iptu` + `seguro_incendio` + `taxa_servico` = **TOTAL** (computed) |
| **Move-in** (`property_terms`) | `deposit_months`=1, `advance_months`, agency_fee | caução / institutional |
| **Guarantee** (`guarantee_types[]`) | `garantia_propietaria`, `fianza`, `seguro_caucion`, `recibo_sueldo` | `fiador`, `seguro_fianca`, `caucao`, or QuintoAndar `institutional_none` (sem fiador) |
| **Term** | `min_term_months` = 36 (legal min) | varies |
| **Income** | `min_income_note` (certificado de ingresos) | `min_income_cents` + note ('a partir de R$ 6.243 até 4 pessoas'), `credit_check_required` |
| **Salient flags** | `is_furnished`, `pets_allowed`, `available_from` | same — very salient in BR |

> **The LATAM-critical guarantee mechanics** (garantía propietaria / fianza / seguro de caución / recibo de sueldo in AR; fiador / seguro-fiança / caução, or QuintoAndar's institutional "sem fiador" in BR) have **no US/UK equivalent** and are often a HARD requirement — modeled as a `guarantee_type[]` array, never lost in free text.

**Render contract:** the UI reads `listing_type` and renders either *"Precio + expensas/condomínio breakdown + (buy) apto crédito/financiamento/ITBI estimate"* OR *"Aluguel total breakdown + (rent) depósito/garantía/fiador/plazo/renda mínima/mobiliado/pet"* — mirroring Rightmove's Sales-vs-Lettings split and the Zonaprop vs QuintoAndar references.

---

## 6. Media & Storage

### 6.1 Buckets

| Bucket | Purpose | Visibility | Limits |
|---|---|---|---|
| `property-images` (**existing**) | Ficha photo gallery | Private + signed | (existing) |
| `reels` (**new**) | Reel video source, posters, image_set frames | **Private** (never public) | `file_size_limit` = **50 MB**; mime allow-list below |
| `property-media` (**new**, optional) | Self-hosted floor plan / drone / 3D poster | Private + signed | larger video limit; mime allow-list |

**`reels` bucket constraints** (server-side guard — defense-in-depth, do NOT trust client `contentType`, OWASP A04/A08):
- `allowed_mime_types = ['video/mp4','video/quicktime','video/webm','image/webp','image/avif','image/jpeg','image/png']` (video for source, image for poster + image_set frames).

### 6.2 Path convention (keyed off first segment = `property_id`)

So policies + cleanup work exactly like `property-images`:

```
reels bucket:
  video source : {property_id}/{reel_id}/source.mp4
  poster       : {property_id}/{reel_id}/poster.webp     ← feeds the card + cover_image_path
  image_set    : {property_id}/{reel_id}/{n}.webp
```

### 6.3 Read access — signed URLs (TTL 3600s)

```sql
-- storage.objects SELECT policy for the reels bucket
USING ( bucket_id = 'reels'
        AND (select is_property_visible( (split_part(name,'/',1))::uuid )) )
```

Reuses the **same `is_property_visible()` SECURITY DEFINER** rule as the `property-images` storage policy — reels of hidden/soft-deleted listings can **never be signed**.

- **Batch-generate** signed URLs (`createSignedUrls`) for the preload window (active + next 2–3) so scrolling stays 60fps — same batching as images.
- **expo-video poster:** initialize the player with the SIGNED `poster_path` URL as `poster` so the first frame paints instantly while the source loads; `thumbnail_blurhash` is the zero-byte placeholder underneath.

### 6.4 Write access

- **MVP:** NO client INSERT/UPDATE/DELETE — reels uploaded with **service_role** (seed/CI) only. Black-box client cannot upload/overwrite/delete.
- **Later (owner uploads):** `WITH CHECK owns_property((split_part(name,'/',1))::uuid)` via SECURITY DEFINER helper — prevents writing into another property's prefix (path-traversal / object-key IDOR).
- **Later (CDN):** swap Supabase signed URLs for CloudFront signed URLs/cookies + Origin Access Control. The `{property_id}/...` convention and `is_property_visible` rule carry over — migration touches only the storage helper, not the schema. **Keep reel URLs CDN-swappable from day one.**

---

## 7. Feed / Video Performance (60fps)

Goal: 60fps feed with **`expo-video`** (NOT deprecated `expo-av`), bound to the **UI-thread active index**, never to React state.

1. **Single player bound to active index.** One `expo-video VideoPlayer` for the feed; source swapped to the active property's primary `video_path` (signed URL). Only the active reel plays. The active index is driven by `useViewabilityPreload` via `useAnimatedReaction` on the UI thread (FOUNDATION's top mitigation) — `play()`/`pause()` fires off that, NOT off a React re-render, so fast scroll never stutters the JS thread.

2. **Preload next only.** When item `i` becomes active, warm `i+1`'s video source + signed URL, but PLAY only `i`. Do NOT preload >1–2 ahead (decoder/memory pressure on low-end Android). For `image_set` primaries use `expo-image.prefetch()` of the next poster/frames (cheaper).

3. **Mute off-screen / autoplay muted.** Off-screen players paused AND muted; active player respects the global mute toggle from `feedUiStore` (Zustand). Autoplay starts **muted** (platform autoplay-with-sound restrictions, esp. web) — tap to unmute. Mute read via Zustand selector so toggling it doesn't re-render the whole list.

4. **Three-stage progressive paint (never blank).** Card paints `thumbnail_blurhash` (zero bytes) → signed `poster_path` still → video starts. `aspect_ratio` stored so the card reserves exact 9:16 space — **no layout shift (CLS).**

5. **Recycling discipline.** FlashList v2 recycles cells (**no `estimatedItemSize` — removed in v2**). `FeedCard` + `FeedCardMedia` are `React.memo` with stable `useCallback` handlers; `recyclingKey = property.id` so a recycled cell swaps the player source cleanly instead of tearing down. On scroll-out, release/pause the player and fall back to its poster — memory stays bounded.

6. **Who plays what.** video reels → `expo-video`; image_set reels → `expo-image` (same fast-image path). The card branches on `media_type` — keeps the video decoder reserved for actual video cards only.

---

## 8. RLS

**Every new property-child table:** `ENABLE` + `FORCE` RLS, deny-by-default.

| Table | SELECT policy | Writes (MVP) |
|---|---|---|
| `property_reels` | PUBLIC (anon+auth) `USING ( status='ready' AND (select is_property_visible(property_id)) )` | none — service_role/seed only |
| `property_media` | PUBLIC `USING ( (select is_property_visible(property_id)) )` | none |
| `property_costs` | PUBLIC `USING ( is_property_visible(property_id) )` | none |
| `property_terms` | PUBLIC `USING ( is_property_visible(property_id) )` | none |
| `property_amenities` | PUBLIC `USING ( is_property_visible(property_id) )` | none |
| `property_attributes` | PUBLIC `USING ( is_property_visible(property_id) )` | none |
| `property_price_events` | PUBLIC `USING ( is_property_visible(property_id) )` | none (+ future trigger) |
| `property_pois` | PUBLIC `USING ( is_property_visible(property_id) )` | none |
| `listing_details` | PUBLIC `USING ( is_property_visible(property_id) )` — identity only | none |
| `amenities_catalog` | **PUBLIC `USING (true)`** — pure reference data (like `entitlements_catalog`) | none |
| `listing_contacts` | **NO broad public SELECT** — reveal ONLY via `get_listing_contact()` RPC | none |

**Rules (locked to FOUNDATION):**
- **Single source of visibility:** reuse the existing `is_property_visible(property_id)` SECURITY DEFINER STABLE helper everywhere (table policies AND the `reels`/`property-media` storage policies). A pentester cannot read costs/amenities/media/contact of a soft-deleted/hidden/processing listing.
- **Wrap the helper in `(select ...)`** so the planner caches it as an initPlan (per FOUNDATION's RLS-perf rule).
- **Index every RLS-referenced column** — `property_id` on every child; `status` + `property_id` on `property_reels`. Missing RLS indexes are the #1 perf killer.
- **`listing_contacts` is the security boundary:** contact never leaves the DB without `resolve_entitlement(uid,'premium_agent_data')` passing inside the RPC. A patched client that defeats the UI blur still gets NOTHING (OWASP A01).
- **`property_media.external_url` host allow-list** validated server-side (OWASP A10 / SSRF) before signing/embedding.
- **Writes are service_role/seed only in MVP** — identical posture to `properties` and `property_images`.

---

## 9. Ficha UI Sections

The detail page, top to bottom. Each maps to concrete tables.

| # | Section | Source | Notes |
|---|---|---|---|
| 1 | **Header / Encabezado** (above the fold) | primary reel (hero) + `properties` + `property_terms` | overlay: título, `listing_type` chip, price+currency, bairro/barrio + cidade, beds/baths/area/parking icon row, **BADGES** (`apt_credit` "Apto crédito", `metro_nearby` "Metrô próx.", `is_new_construction` "A estrenar/Lançamento", destacado). Save/share (likes/folders). |
| 2 | **Media gallery / Multimedia** | `property_reels` + `property_images` + `property_media` | **switchable BADGED tabs:** [Reel/Vídeo] [Fotos] [Tour 3D] [Planta] [Drone] [Mapa]. Non-primary reels + photo_set + 3D + floor_plan live here; primary reel is the hero above. Video/3D as DISTINCT entry points, not mixed into the photo grid. Show "37 Fotos" count as a quality badge. |
| 3 | **Price & costs / Preço & custos** | `property_costs` + `property_terms` | BR summed monthly table (Aluguel+Condomínio+IPTU+Seguro+Taxa = **TOTAL**) OR AR expensas + one-time buyer costs; `price_per_m2` computed; (buy) apt_credit/financiamento/FGTS/ITBI-notary estimates; price-history link (`property_price_events`). |
| 4 | **Key facts / Ficha técnica resumen** | `properties` columns | scannable chips: property_kind, area_total/covered/land, rooms (ambientes)/bedrooms (quartos)/suites, bathrooms/half, parking, floor/total_floors, year/age, condition, orientation, disposition — the Zillow "What's Special" / Idealista "Características básicas" strip. |
| 5 | **Characteristics / Características** | `property_attributes` + UNIT-scope `property_amenities` | flooring, heating, AC, condition, building name/decade, luminosity + unit amenities (AC, balcony, wardrobes) as present/absent chips. |
| 6 | **Building amenities / Comodidades** | BUILDING-scope `property_amenities` | "disponíveis / indisponíveis" chip lists (pool, gym, SUM/salão, parrilla/churrasqueira, security 24h, elevator, coworking) — the QuintoAndar present-vs-absent pattern. |
| 7 | **Terms & requirements / Términos** | `property_terms` (by `listing_type`) | RENT: depósito, adelanto, garantía/fiador types, plazo mínimo, renda/ingreso mínimo, mobiliado, aceita pet, available_from. BUY: apto crédito, escritura/title, financiamento/FGTS, ITBI/sellos + notary estimates. |
| 8 | **Description / Descripción** | `properties.search_tsv` + `locale` | free-text (es-AR/pt-BR) + curated highlight chips. |
| 9 | **Location / Ubicación** | `properties.location` (PostGIS) + `property_pois` | map (exact-or-approximate pin per AR privacy), full/short address, categorized POIs (transporte/metrô, educação, saúde, parques, comercios) with distances; `metro_nearby` badge. |
| 10 | **Listing & advertiser / Datos del aviso** | `listing_details` + `get_listing_contact()` RPC | listing_code, published/updated, advertiser_type, agency name/logo, broker_name + license (CUCICBA/CRECI), other_listings_count. Contact CTA (WhatsApp/teléfono/form) **GATED** via RPC (`premium_agent_data` none/limited/full). |
| 11 | **Actions / Ações** | likes/folders + transactional stubs | Favoritar/Guardar, Compartir, Contactar/Agendar visita, Fazer proposta, Avaliação de crédito — flows mostly **post-MVP** but their place is reserved. |

---

## 10. Tasks (mapped to M1 / M3 / M4)

### New enums to `CREATE TYPE` (native, low-cardinality, indexable)

`reel_media_type`, `reel_status`, `amenity_scope`, `amenity_category`, `cost_type`, `cost_period`, `guarantee_type`, `furnished_state`, `price_event_type`, `poi_type`, `media_type`, `advertiser_type`, `orientation`, `disposition`, `property_condition`.

### M1 — Schema, RLS, storage foundation

| # | Task | Notes |
|---|---|---|
| M1.1 | Create the 15 new enums | before any table that references them |
| M1.2 | `ALTER TABLE properties` — add the §3.1 columns + their M6 indexes | **Decision: keep `area_sqm` as total + add covered/land** (avoid touching existing feed code). Add `locale`; update `search_tsv` GENERATED expr to switch regconfig on it. |
| M1.3 | Create `property_reels` + 4 indexes + CHECK + RLS (after `properties` and the `is_property_visible` helper — FOUNDATION task 15) | the one-primary partial unique IS the enforcement |
| M1.4 | Create `property_media` + index + RLS | ficha-only rich media (3D/floor plan/drone/map) |
| M1.5 | Create `amenities_catalog` (+ `USING(true)` RLS) and **seed** the bilingual catalog | from the §4.1 seed list |
| M1.6 | Create `property_amenities` + filter index + RLS | partial `(amenity_id, available) WHERE available` |
| M1.7 | Create `property_attributes` + indexes + RLS; add `properties.extra jsonb` escape hatch | |
| M1.8 | Create `property_costs` + 2 indexes + RLS | |
| M1.9 | Create `property_terms` + 3 partial indexes + RLS + `set_updated_at` trigger | |
| M1.10 | Create `property_price_events` + index + RLS | append-only |
| M1.11 | Create `property_pois` + index + RLS | |
| M1.12 | Create `listing_details` + indexes + RLS (public identity) | |
| M1.13 | Create `listing_contacts` + RLS (NO public SELECT) + `get_listing_contact()` SECURITY DEFINER RPC, REVOKE public/anon, GRANT authenticated | consumes `resolve_entitlement(...,'premium_agent_data')` from MEMBERSHIP |
| M1.14 | Add `reels` private bucket (+ optional `property-media` bucket) with mime/size limits + storage SELECT policy reusing `is_property_visible` | alongside the property-images bucket (FOUNDATION task 22) |
| M1.15 | **Adjust the `cover_image_path` sync trigger** → prefer primary reel `poster_path`, fallback `property_images` position=0 | FOUNDATION task 20 |
| M1.16 | `supabase gen types typescript` → refresh `database.types.ts` | FOUNDATION task 24, after all DDL |
| M1.17 | Seed script: properties + reels (one primary video per property) + images + costs + terms + amenities + attributes + pois + listing_details/contacts; keep `properties.price_cents` ↔ `property_costs` sale_price/rent in sync | service_role only |

### M3 — Feed integration (reels)

| # | Task | Notes |
|---|---|---|
| M3.1 | Feed query: INNER JOIN primary reel onto the keyset-over-properties query (§2.3) | cursor stays `(published_at, id)`; never OFFSET; cap page ≤ 20 |
| M3.2 | `useInfiniteQuery` wiring: `getNextPageParam` returns last property's tuple; `fetchNextPage` near end-of-page | |
| M3.3 | Batch `createSignedUrls` for the preload window (active + next 2–3), `reels` bucket | |
| M3.4 | `expo-video` single-player feed: source bound to UI-thread active index via `useAnimatedReaction`; play only active; preload i+1 only | §7.1–7.2 |
| M3.5 | Three-stage progressive paint (blurhash → poster → video); store/use `aspect_ratio`; no CLS | §7.4 |
| M3.6 | `feedUiStore` (Zustand) global mute; autoplay muted; off-screen pause+mute; Zustand selector reads | §7.3 |
| M3.7 | FlashList v2 card: `React.memo`, `recyclingKey = property.id`, release player on scroll-out; branch renderer on `media_type` (video→expo-video, image_set→expo-image) | §7.5–7.6, no `estimatedItemSize` |

### M4 — Ficha UI (knowledge library)

| # | Task | Notes |
|---|---|---|
| M4.1 | Ficha route + sectioned layout (§9 sections 1–11) | opened on feed-card tap |
| M4.2 | Header (hero primary reel replayable + badges) + Multimedia tabs (reels/photos/3D/floor plan/drone/map) | switchable badged tabs; "N Fotos" count badge |
| M4.3 | Price & costs panel — BR summed-TOTAL breakdown vs AR expensas+one-time, driven by `listing_type`; computed monthly TOTAL + `price_per_m2` | §3.2, §5 |
| M4.4 | Key-facts chip strip from `properties` columns | §9.4 |
| M4.5 | Characteristics (`property_attributes` + unit amenities) + Building amenities (`disponíveis/indisponíveis` chips) | §4 |
| M4.6 | Terms & requirements — rent set OR buy set by `listing_type` (guarantee_types[], deposit, plazo, renda; apt_credit, financing, FGTS, estimates) | §3.3, §5 |
| M4.7 | Location section — map + categorized `property_pois` with distances + metro badge | §3.5 |
| M4.8 | Advertiser section + **gated contact reveal** via `get_listing_contact()` (none→CTA, limited→masked, full→everything) | §3.6 |
| M4.9 | Price-history view from `property_price_events` + "price reduced" badge | §3.4 |
| M4.10 | Actions row (likes/folders wired; transactional flows stubbed for post-MVP) | §9.11 |

### Deferred (designed-in, out of MVP)

Video transcoding/MediaConvert (`reel_status='processing'` reserves the hook) · owner reel/media uploads (`owns_property` write guard) · 3D as a `property_reels` type (currently `property_media`) · CloudFront signed URLs/cookies · energy label (EPC/certificado energético) · climate/flood risk · walk/transit score · UK-style tenure block (model via `property_attributes`/jsonb — no new tables) · PostGIS-derived POIs/walk-score from a dataset · price-event AFTER-UPDATE trigger.

### Flagged product decisions (resolve before freezing schema)

1. **`area_sqm`** → *recommend* keep as total + add covered/land (avoid touching existing feed code) vs rename to `area_total_sqm`.
2. **`property_costs` price mirror** → *recommend* `properties.price_cents` stays authoritative for feed/keyset; costs mirrors for the breakdown; seeder syncs (or trigger later).
3. **One media table vs two** → *this doc recommends* `property_reels` (feed) + `property_media` (ficha-only rich media) for a tight feed index; the ficha design's single broad `property_media` is the valid alternative.
4. **Before freezing the attribute/label set:** do an authenticated/headless scrape of 2–3 Zonaprop venta + 2–3 alquiler fichas to validate exact "características" labels (the reference Zonaprop URL returned HTTP 403; AR fields were reconstructed from help-center + Argenprop; QuintoAndar was fetched directly with verified field data).