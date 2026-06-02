-- =====================================================================
-- seed.sql — Reel Estate — realistic MOCK content
-- Runs with service_role (bypasses RLS). Loaded by `supabase db reset` /
-- `supabase start`. Storage object PATHS only (no real bytes here — the
-- seeding SCRIPT uploads the actual media to the private buckets; these
-- paths follow the {property_id}/{reel_id}/... convention so they resolve).
--
-- Coverage: 16 properties — BUY + RENT, AR-ES (Buenos Aires) + BR-PT
-- (São Paulo / Rio). Each property gets:
--   - 1 PRIMARY video reel (+ some non-primary reels / image_sets)
--   - a photo gallery (property_images)
--   - polymorphic property_costs (price mirror + recurring + one-time)
--   - 1:1 property_terms (rent OR buy set)
--   - property_amenities (present + a few absent)
--   - property_attributes (long-tail)
--   - property_pois (transit/education/health/park)
--   - listing_details (public) + listing_contacts (gated)
--   - a 'listed' property_price_events row
--
-- Idempotent: ON CONFLICT DO NOTHING on properties keyed by fixed UUIDs.
-- Triggers fire naturally (cover_image_path sync from primary reel poster).
-- properties.price_cents stays authoritative; the sale_price/rent cost row
-- MIRRORS it (kept in sync here).
-- =====================================================================

-- Deterministic seed: a single PL/pgSQL block iterating a property spec table.
DO $seed$
DECLARE
  r          record;
  v_reel_id  uuid;
  v_reel2_id uuid;
  v_n        integer;
BEGIN

-- ===================================================================
-- Property specs. Each row = one property. Currency/locale/listing_type
-- vary to cover AR-ES buy/rent (USD venta, ARS alquiler) and BR-PT
-- buy/rent (BRL). geog built from lon/lat.
-- ===================================================================
FOR r IN
  WITH spec(
    id, title, descr, listing_type, kind, locale, currency, price_cents,
    bedrooms, bathrooms, half_baths, rooms, suites, parking,
    area_total, area_covered, area_land, floor_no, total_floors,
    year_built, age_years, orientation, disposition, cond,
    city, region, country, addr, postal, lon, lat,
    metro_nearby, apt_credit, is_new, days_ago
  ) AS (
    VALUES
    -- ============ ARGENTINA — BUY (venta, USD) ============
    ('a1111111-1111-1111-1111-111111111101'::uuid,
     'Monoambiente a estrenar en Palermo Soho',
     'Departamento monoambiente luminoso a estrenar, excelente ubicación en Palermo Soho. Apto crédito hipotecario. Cocina integrada, balcón francés.',
     'buy','studio','es-AR','USD', 9500000::bigint,
     0, 1.0, 0, 1, 0, 0,
     38.50, 34.00, NULL, 4, 8,
     2025, 0, 'ne', 'frente', 'new',
     'Buenos Aires','CABA','AR','Honduras 4800','C1414', -58.4256, -34.5885,
     true, true, true, 3),

    ('a1111111-1111-1111-1111-111111111102'::uuid,
     'Casa 4 ambientes con jardín en Belgrano R',
     'Casa señorial en Belgrano R, 4 ambientes amplios, jardín con parrilla, garage para 2 autos. Apto crédito. A reciclar a gusto.',
     'buy','house','es-AR','USD', 38000000::bigint,
     3, 2.0, 1, 4, 1, 2,
     220.00, 180.00, 320.00, 0, 2,
     1995, 30, 's', NULL, 'to_renovate',
     'Buenos Aires','CABA','AR','Av. Forest 1200','C1427', -58.4604, -34.5722,
     false, true, false, 12),

    ('a1111111-1111-1111-1111-111111111103'::uuid,
     'Departamento 3 ambientes en Caballito',
     'Tres ambientes contrafrente muy luminoso, cocina separada, lavadero independiente. Edificio con SUM y laundry. Apto profesional.',
     'buy','apartment','es-AR','USD', 14500000::bigint,
     2, 1.0, 0, 3, 0, 1,
     72.00, 65.00, NULL, 6, 12,
     2010, 15, 'e', 'contrafrente', 'very_good',
     'Buenos Aires','CABA','AR','Av. Rivadavia 5400','C1424', -58.4368, -34.6190,
     true, true, false, 20),

    ('a1111111-1111-1111-1111-111111111104'::uuid,
     'PH 2 ambientes reciclado en Villa Crespo',
     'PH al frente totalmente reciclado, con patio y terraza propia. Sin expensas. Apto crédito.',
     'buy','house','es-AR','USD', 11800000::bigint,
     1, 1.0, 0, 2, 0, 0,
     55.00, 48.00, 60.00, 0, 1,
     1940, 85, 'n', 'frente', 'reciclado',
     'Buenos Aires','CABA','AR','Vera 700','C1414', -58.4419, -34.5985,
     false, true, false, 30),

    -- ============ ARGENTINA — RENT (alquiler, ARS) ============
    ('a1111111-1111-1111-1111-111111111105'::uuid,
     'Dos ambientes amoblado en Recoleta',
     'Dos ambientes totalmente amoblado y equipado, ideal ejecutivos. Apto mascotas. Disponible inmediato. Contrato 36 meses.',
     'rent','apartment','es-AR','ARS', 65000000::bigint,
     1, 1.0, 0, 2, 0, 0,
     50.00, 45.00, NULL, 9, 14,
     2008, 17, 'se', 'frente', 'excellent',
     'Buenos Aires','CABA','AR','Av. Callao 1100','C1023', -58.3925, -34.5955,
     true, false, false, 5),

    ('a1111111-1111-1111-1111-111111111106'::uuid,
     'Tres ambientes en Núñez con cochera',
     'Tres ambientes en torre con amenities: pileta, gimnasio, seguridad 24h. Cochera cubierta. Acepta garantía propietaria o seguro de caución.',
     'rent','apartment','es-AR','ARS', 95000000::bigint,
     2, 2.0, 1, 3, 1, 1,
     85.00, 78.00, NULL, 15, 24,
     2018, 7, 'nw', 'contrafrente', 'excellent',
     'Buenos Aires','CABA','AR','Av. del Libertador 7100','C1429', -58.4561, -34.5430,
     true, false, false, 8),

    ('a1111111-1111-1111-1111-111111111107'::uuid,
     'Loft en Puerto Madero con vista al río',
     'Loft premium en Puerto Madero, doble altura, vista al dique. Amenities full. Cochera y baulera. Semi amoblado.',
     'rent','studio','es-AR','ARS', 140000000::bigint,
     1, 1.0, 1, 1, 0, 1,
     68.00, 62.00, NULL, 22, 40,
     2015, 10, 'e', 'frente', 'excellent',
     'Buenos Aires','CABA','AR','Olga Cossettini 800','C1107', -58.3620, -34.6116,
     false, false, false, 2),

    ('a1111111-1111-1111-1111-111111111108'::uuid,
     'Casa quinta en Pilar con pileta',
     'Casa quinta en barrio cerrado, lote de 1200 m2, pileta climatizada, parrilla y quincho. Ideal familia. Acepta recibo de sueldo.',
     'rent','house','es-AR','ARS', 110000000::bigint,
     3, 3.0, 1, 5, 2, 3,
     280.00, 240.00, 1200.00, 0, 2,
     2012, 13, 's', NULL, 'very_good',
     'Pilar','Buenos Aires','AR','Ruta 8 km 50','B1629', -58.9142, -34.4587,
     false, false, false, 18),

    -- ============ BRASIL — BUY (venda, BRL) ============
    ('b2222222-2222-2222-2222-222222222201'::uuid,
     'Apartamento 2 quartos com suíte em Pinheiros',
     'Lindo apartamento de 2 quartos sendo 1 suíte, próximo ao metrô Faria Lima. Aceita financiamento e FGTS. Lazer completo no condomínio.',
     'buy','apartment','pt-BR','BRL', 78000000::bigint,
     2, 2.0, 1, 3, 1, 1,
     74.00, 68.00, NULL, 8, 18,
     2019, 6, 'ne', NULL, 'excellent',
     'São Paulo','SP','BR','Rua dos Pinheiros 1400','05422', -46.6810, -23.5670,
     true, false, false, 6),

    ('b2222222-2222-2222-2222-222222222202'::uuid,
     'Casa térrea 3 dormitórios na Vila Madalena',
     'Casa térrea reformada, 3 dormitórios, quintal com churrasqueira, 2 vagas. Aceita financiamento. Ótima localização.',
     'buy','house','pt-BR','BRL', 165000000::bigint,
     3, 2.0, 1, 4, 1, 2,
     180.00, 150.00, 250.00, 0, 1,
     2000, 25, 'n', NULL, 'very_good',
     'São Paulo','SP','BR','Rua Harmonia 600','05435', -46.6918, -23.5540,
     false, false, false, 22),

    ('b2222222-2222-2222-2222-222222222203'::uuid,
     'Studio novo no centro do Rio de Janeiro',
     'Studio compacto e moderno, lançamento, mobiliado, próximo ao metrô Carioca. Investimento ideal para locação.',
     'buy','studio','pt-BR','BRL', 42000000::bigint,
     0, 1.0, 0, 1, 0, 0,
     32.00, 28.00, NULL, 12, 25,
     2025, 0, 'e', NULL, 'new',
     'Rio de Janeiro','RJ','BR','Rua da Assembleia 100','20011', -43.1770, -22.9050,
     true, false, true, 4),

    ('b2222222-2222-2222-2222-222222222204'::uuid,
     'Cobertura duplex 3 suítes em Ipanema',
     'Cobertura duplex de altíssimo padrão, 3 suítes, terraço com piscina privativa e vista mar. Aceita financiamento.',
     'buy','apartment','pt-BR','BRL', 520000000::bigint,
     3, 4.0, 1, 5, 3, 3,
     320.00, 290.00, NULL, 14, 14,
     2017, 8, 's', NULL, 'excellent',
     'Rio de Janeiro','RJ','BR','Rua Vinícius de Moraes 200','22411', -43.2050, -22.9847,
     false, false, false, 14),

    -- ============ BRASIL — RENT (aluguel, BRL) ============
    ('b2222222-2222-2222-2222-222222222205'::uuid,
     'Apartamento 1 quarto na Vila Mariana sem fiador',
     'Apartamento de 1 quarto, sem mobília, modelo QuintoAndar sem fiador. Próximo ao metrô Ana Rosa. Aceita pet. Avaliação de crédito.',
     'rent','apartment','pt-BR','BRL', 320000::bigint,
     1, 1.0, 0, 2, 0, 0,
     42.00, 38.00, NULL, 5, 12,
     2014, 11, 'ne', NULL, 'good',
     'São Paulo','SP','BR','Rua Domingos de Morais 2000','04035', -46.6380, -23.5870,
     true, false, false, 9),

    ('b2222222-2222-2222-2222-222222222206'::uuid,
     'Cobertura mobiliada 2 quartos em Moema',
     'Cobertura mobiliada, 2 quartos com suíte, varanda gourmet com churrasqueira. Condomínio com academia e piscina. Aceita pet.',
     'rent','apartment','pt-BR','BRL', 850000::bigint,
     2, 2.0, 1, 3, 1, 2,
     110.00, 100.00, NULL, 16, 16,
     2016, 9, 'nw', NULL, 'excellent',
     'São Paulo','SP','BR','Alameda dos Maracatins 1100','04089', -46.6650, -23.6020,
     false, false, false, 11),

    ('b2222222-2222-2222-2222-222222222207'::uuid,
     'Casa 4 quartos em condomínio em Barueri',
     'Casa em condomínio fechado, 4 quartos sendo 2 suítes, quintal amplo, 3 vagas. Segurança 24h, área de lazer completa.',
     'rent','house','pt-BR','BRL', 720000::bigint,
     4, 3.0, 1, 6, 2, 3,
     260.00, 220.00, 400.00, 0, 2,
     2013, 12, 's', NULL, 'very_good',
     'Barueri','SP','BR','Alphaville Residencial 5','06474', -46.8520, -23.4990,
     false, false, false, 16),

    ('b2222222-2222-2222-2222-222222222208'::uuid,
     'Quarto e sala em Copacabana próximo à praia',
     'Quarto e sala reformado, a 2 quadras da praia de Copacabana. Mobiliado, ideal para temporada ou moradia. Aceita pet pequeno.',
     'rent','apartment','pt-BR','BRL', 480000::bigint,
     1, 1.0, 0, 2, 0, 0,
     48.00, 44.00, NULL, 7, 10,
     1980, 45, 'e', 'frente', 'good',
     'Rio de Janeiro','RJ','BR','Rua Barata Ribeiro 500','22040', -43.1880, -22.9710,
     true, false, false, 7)
  )
  SELECT * FROM spec
LOOP
  -- ---- properties ----
  INSERT INTO public.properties (
    id, owner_id, title, description, listing_type, property_kind, status,
    price_cents, currency, bedrooms, bathrooms, half_bathrooms, rooms, suites, parking_spaces,
    area_sqm, area_total_sqm, area_covered_sqm, area_land_sqm,
    floor_number, total_floors, year_built, age_years,
    orientation, disposition, condition,
    city, region, country, address_line, postal_code, location,
    metro_nearby, apt_credit, is_new_construction, locale,
    published_at, created_at
  ) VALUES (
    r.id, NULL, r.title, r.descr, r.listing_type::public.listing_type, r.kind::public.property_kind, 'active',
    r.price_cents, r.currency, r.bedrooms, r.bathrooms, r.half_baths, r.rooms, r.suites, r.parking,
    r.area_total, r.area_total, r.area_covered, r.area_land,
    r.floor_no, r.total_floors, r.year_built, r.age_years,
    r.orientation::public.orientation, r.disposition::public.disposition, r.cond::public.property_condition,
    r.city, r.region, r.country, r.addr, r.postal,
    extensions.ST_SetSRID(extensions.ST_MakePoint(r.lon, r.lat), 4326)::extensions.geography,
    r.metro_nearby, r.apt_credit, r.is_new, r.locale,
    now() - (r.days_ago || ' days')::interval,
    now() - (r.days_ago || ' days')::interval
  )
  ON CONFLICT (id) DO NOTHING;

  -- ---- PRIMARY video reel (the feed unit) ----
  v_reel_id := extensions.gen_random_uuid();
  INSERT INTO public.property_reels (
    id, property_id, media_type, video_path, poster_path,
    thumbnail_blurhash, duration_ms, aspect_ratio, caption,
    position, is_primary, status
  ) VALUES (
    v_reel_id, r.id, 'video',
    r.id || '/' || v_reel_id || '/source.mp4',
    r.id || '/' || v_reel_id || '/poster.webp',
    'LKO2:N%2Tw=w]~RBVZRi};RPxuwH', 18000, 0.5625,
    CASE WHEN r.locale = 'pt-BR' THEN 'Tour completo pelo imóvel' ELSE 'Recorrido completo por la propiedad' END,
    0, true, 'ready'
  );

  -- ---- a non-primary image_set reel (themed secondary, ficha-only) ----
  v_reel2_id := extensions.gen_random_uuid();
  INSERT INTO public.property_reels (
    id, property_id, media_type, image_paths, poster_path,
    thumbnail_blurhash, aspect_ratio, caption, position, is_primary, status
  ) VALUES (
    v_reel2_id, r.id, 'image_set',
    ARRAY[
      r.id || '/' || v_reel2_id || '/0.webp',
      r.id || '/' || v_reel2_id || '/1.webp',
      r.id || '/' || v_reel2_id || '/2.webp'
    ],
    r.id || '/' || v_reel2_id || '/poster.webp',
    'L6PZfSi_.AyE_3t7t7R**0o#DgR4', 0.5625,
    CASE WHEN r.locale = 'pt-BR' THEN 'Destaques' ELSE 'Destacados' END,
    1, false, 'ready'
  );

  -- ---- photo gallery (property_images) — 6 stills ----
  FOR v_n IN 0..5 LOOP
    INSERT INTO public.property_images (property_id, storage_path, position, width, height, blurhash, alt_text)
    VALUES (
      r.id, r.id || '/photo_' || v_n || '.webp', v_n, 1600, 1067,
      'LEHV6nWB2yk8pyo0adR*.7kCMdnj',
      CASE WHEN r.locale = 'pt-BR' THEN 'Foto ' || (v_n + 1) ELSE 'Foto ' || (v_n + 1) END
    )
    ON CONFLICT (property_id, storage_path) DO NOTHING;
  END LOOP;

  -- ---- property_costs (price mirror + recurring + one-time) ----
  -- Headline price mirror (properties.price_cents is authoritative).
  INSERT INTO public.property_costs (property_id, cost_type, amount_cents, currency, period, display_order)
  VALUES (
    r.id,
    CASE WHEN r.listing_type = 'buy' THEN 'sale_price' ELSE 'rent' END::public.cost_type,
    r.price_cents, r.currency,
    CASE WHEN r.listing_type = 'buy' THEN 'once' ELSE 'monthly' END::public.cost_period,
    0
  );

  IF r.listing_type = 'rent' THEN
    IF r.locale = 'pt-BR' THEN
      -- BR: decomposed monthly breakdown that SUMs to TOTAL
      INSERT INTO public.property_costs (property_id, cost_type, amount_cents, currency, period, display_order) VALUES
        (r.id, 'condominio',      (r.price_cents * 0.20)::bigint, r.currency, 'monthly', 1),
        (r.id, 'iptu',            (r.price_cents * 0.08)::bigint, r.currency, 'monthly', 2),
        (r.id, 'seguro_incendio', 4500::bigint,                  r.currency, 'monthly', 3),
        (r.id, 'taxa_servico',    2500::bigint,                  r.currency, 'monthly', 4);
    ELSE
      -- AR: rent + expensas (flat extras)
      INSERT INTO public.property_costs (property_id, cost_type, amount_cents, currency, period, display_order) VALUES
        (r.id, 'expensas', (r.price_cents * 0.25)::bigint, r.currency, 'monthly', 1);
    END IF;
  ELSE  -- buy: one-time estimated buyer costs
    IF r.locale = 'pt-BR' THEN
      INSERT INTO public.property_costs (property_id, cost_type, amount_cents, currency, period, is_estimate, display_order) VALUES
        (r.id, 'itbi',     (r.price_cents * 0.03)::bigint, r.currency, 'once', true, 1),
        (r.id, 'notary',   (r.price_cents * 0.01)::bigint, r.currency, 'once', true, 2),
        (r.id, 'registry', (r.price_cents * 0.005)::bigint, r.currency, 'once', true, 3);
      -- BR buy also has recurring condominio + iptu
      INSERT INTO public.property_costs (property_id, cost_type, amount_cents, currency, period, display_order) VALUES
        (r.id, 'condominio', (r.price_cents * 0.0015)::bigint, r.currency, 'monthly', 4),
        (r.id, 'iptu',       (r.price_cents * 0.0008)::bigint, r.currency, 'monthly', 5);
    ELSE
      INSERT INTO public.property_costs (property_id, cost_type, amount_cents, currency, period, is_estimate, display_order) VALUES
        (r.id, 'notary',     (r.price_cents * 0.02)::bigint,  r.currency, 'once', true, 1),  -- escritura ~2%
        (r.id, 'agency_fee', (r.price_cents * 0.04)::bigint,  r.currency, 'once', true, 2);
      -- AR buy recurring expensas (in ARS even when venta is USD — separate currency row)
      INSERT INTO public.property_costs (property_id, cost_type, amount_cents, currency, period, display_order) VALUES
        (r.id, 'expensas', 8000000::bigint, 'ARS', 'monthly', 3);
    END IF;
  END IF;

  -- ---- property_terms (1:1, rent OR buy set) ----
  IF r.listing_type = 'rent' THEN
    IF r.locale = 'pt-BR' THEN
      INSERT INTO public.property_terms (
        property_id, deposit_months, guarantee_types, min_income_cents, min_income_note,
        credit_check_required, is_furnished, pets_allowed, available_from, utilities_included
      ) VALUES (
        r.id, 0, ARRAY['institutional_none','seguro_fianca']::public.guarantee_type[],
        (r.price_cents * 3)::bigint, 'A partir de 3x o valor do aluguel',
        true,
        CASE WHEN r.title ILIKE '%mobiliad%' THEN 'furnished' WHEN r.title ILIKE '%sem mob%' THEN 'unfurnished' ELSE 'semi' END::public.furnished_state,
        true, (now() + interval '15 days')::date, false
      )
      ON CONFLICT (property_id) DO NOTHING;
    ELSE
      INSERT INTO public.property_terms (
        property_id, deposit_months, advance_months, guarantee_types, min_term_months,
        is_furnished, pets_allowed, available_from, utilities_included
      ) VALUES (
        r.id, 1, 1,
        ARRAY['garantia_propietaria','seguro_caucion','recibo_sueldo']::public.guarantee_type[],
        36,
        CASE WHEN r.title ILIKE '%amoblad%' THEN 'furnished' WHEN r.title ILIKE '%semi%' THEN 'semi' ELSE 'unfurnished' END::public.furnished_state,
        (r.title ILIKE '%mascota%'),
        (now() + interval '7 days')::date, false
      )
      ON CONFLICT (property_id) DO NOTHING;
    END IF;
  ELSE  -- buy
    IF r.locale = 'pt-BR' THEN
      INSERT INTO public.property_terms (
        property_id, accepts_financing, accepts_fgts, title_status,
        transfer_tax_estimate_cents, notary_estimate_cents
      ) VALUES (
        r.id, true, (r.kind <> 'commercial'), 'Escritura/Matrícula regular',
        (r.price_cents * 0.03)::bigint, (r.price_cents * 0.01)::bigint
      )
      ON CONFLICT (property_id) DO NOTHING;
    ELSE
      INSERT INTO public.property_terms (
        property_id, apt_credit, apt_professional, title_status,
        transfer_tax_estimate_cents, notary_estimate_cents
      ) VALUES (
        r.id, r.apt_credit, (r.kind IN ('apartment','commercial')), 'Escritura traslativa de dominio',
        (r.price_cents * 0.015)::bigint, (r.price_cents * 0.02)::bigint
      )
      ON CONFLICT (property_id) DO NOTHING;
    END IF;
  END IF;

  -- ---- property_amenities (a mix of present + absent) ----
  -- Common building amenities present
  INSERT INTO public.property_amenities (property_id, amenity_id, available, value) VALUES
    (r.id, 14, true, NULL),                               -- elevator
    (r.id, 10, true, NULL)                                -- security_24h
  ON CONFLICT (property_id, amenity_id) DO NOTHING;

  -- parking present iff property has parking
  IF r.parking > 0 THEN
    INSERT INTO public.property_amenities (property_id, amenity_id, available, value)
    VALUES (r.id, 12, true, r.parking || (CASE WHEN r.locale='pt-BR' THEN ' vaga(s)' ELSE ' cochera(s)' END))
    ON CONFLICT (property_id, amenity_id) DO NOTHING;
  END IF;

  -- leisure amenities present for higher-end / larger units
  IF r.area_total >= 70 THEN
    INSERT INTO public.property_amenities (property_id, amenity_id, available, value) VALUES
      (r.id, 1, true, NULL),                              -- pool
      (r.id, 4, true, NULL),                              -- gym
      (r.id, 6, true, NULL)                               -- grill
    ON CONFLICT (property_id, amenity_id) DO NOTHING;
  ELSE
    -- explicitly mark them absent (greyed 'indisponível')
    INSERT INTO public.property_amenities (property_id, amenity_id, available) VALUES
      (r.id, 1, false),
      (r.id, 4, false)
    ON CONFLICT (property_id, amenity_id) DO NOTHING;
  END IF;

  -- unit amenities
  INSERT INTO public.property_amenities (property_id, amenity_id, available) VALUES
    (r.id, 21, true),                                     -- ac_split
    (r.id, 23, (r.floor_no IS NULL OR r.floor_no > 0))    -- balcony (false for PB/térreo)
  ON CONFLICT (property_id, amenity_id) DO NOTHING;

  -- pet-friendly building flag from title
  IF r.title ILIKE '%pet%' OR r.title ILIKE '%mascota%' THEN
    INSERT INTO public.property_amenities (property_id, amenity_id, available)
    VALUES (r.id, 26, true)
    ON CONFLICT (property_id, amenity_id) DO NOTHING;
  END IF;

  -- ---- property_attributes (long tail typed-EAV) ----
  INSERT INTO public.property_attributes (property_id, attr_key, value_text) VALUES
    (r.id, 'flooring', CASE WHEN r.locale='pt-BR' THEN 'Porcelanato' ELSE 'Porcelanato' END),
    (r.id, 'heating',  CASE WHEN r.locale='pt-BR' THEN 'Split quente/frio' ELSE 'Losa radiante' END),
    (r.id, 'luminosity', CASE WHEN r.locale='pt-BR' THEN 'Muito iluminado' ELSE 'Muy luminoso' END)
  ON CONFLICT (property_id, attr_key) DO NOTHING;
  INSERT INTO public.property_attributes (property_id, attr_key, value_num, unit)
  VALUES (r.id, 'ceiling_height_m', 2.6, 'm')
  ON CONFLICT (property_id, attr_key) DO NOTHING;

  -- ---- property_pois (transit / education / health / park) ----
  IF r.metro_nearby THEN
    INSERT INTO public.property_pois (property_id, poi_type, name, distance_m, walk_minutes, display_order)
    VALUES (r.id, 'transit_subway',
      CASE WHEN r.locale='pt-BR' THEN 'Estação de metrô' ELSE 'Estación de subte' END,
      350, 5, 0);
  END IF;
  INSERT INTO public.property_pois (property_id, poi_type, name, distance_m, walk_minutes, display_order) VALUES
    (r.id, 'education',
      CASE WHEN r.locale='pt-BR' THEN 'Escola Municipal' ELSE 'Escuela primaria' END, 600, 8, 1),
    (r.id, 'health',
      CASE WHEN r.locale='pt-BR' THEN 'Hospital / UBS' ELSE 'Hospital / Salita' END, 1200, 15, 2),
    (r.id, 'park',
      CASE WHEN r.locale='pt-BR' THEN 'Parque' ELSE 'Plaza / Parque' END, 450, 6, 3);

  -- ---- listing_details (public identity) ----
  INSERT INTO public.listing_details (
    property_id, listing_code, advertiser_type, agency_name, agency_logo_path,
    broker_name, broker_license, broker_license_authority, source,
    published_at, listed_updated_at, other_listings_count
  ) VALUES (
    r.id,
    'RE-' || upper(substr(replace(r.id::text, '-', ''), 1, 8)),
    'agency',
    CASE WHEN r.locale='pt-BR' THEN 'Imobiliária Horizonte' ELSE 'Inmobiliaria Horizonte' END,
    'agencies/horizonte/logo.webp',
    CASE WHEN r.locale='pt-BR' THEN 'Mariana Oliveira' ELSE 'Martín Gómez' END,
    CASE WHEN r.locale='pt-BR' THEN 'CRECI 123456-F' ELSE 'CUCICBA 7890' END,
    CASE WHEN r.locale='pt-BR' THEN 'CRECI' ELSE 'CUCICBA' END,
    'seed',
    now() - (r.days_ago || ' days')::interval,
    now() - ((r.days_ago / 2) || ' days')::interval,
    7
  )
  ON CONFLICT (property_id) DO NOTHING;

  -- ---- listing_contacts (gated; revealed only via get_listing_contact RPC) ----
  INSERT INTO public.listing_contacts (
    property_id, contact_whatsapp, contact_phone, contact_email, contact_form_enabled, agent_perf_summary
  ) VALUES (
    r.id,
    CASE WHEN r.locale='pt-BR' THEN '+5511998877665' ELSE '+5491155667788' END,
    CASE WHEN r.locale='pt-BR' THEN '+551133224455'  ELSE '+541143218765' END,
    CASE WHEN r.locale='pt-BR' THEN 'contato@horizonte.com.br' ELSE 'contacto@horizonte.com.ar' END,
    true,
    jsonb_build_object(
      'days_on_market', r.days_ago,
      'price_cuts', 0,
      'comps_count', 5,
      'avg_response_minutes', 22
    )
  )
  ON CONFLICT (property_id) DO NOTHING;

  -- ---- property_price_events (initial 'listed') ----
  INSERT INTO public.property_price_events (property_id, event_type, price_cents, currency, status, occurred_at)
  VALUES (r.id, 'listed', r.price_cents, r.currency, 'active', now() - (r.days_ago || ' days')::interval);

END LOOP;

-- ---- One property_media (ficha-only 3D tour) on a flagship listing ----
INSERT INTO public.property_media (property_id, media_type, external_url, thumbnail_path, blurhash, position, alt_text)
VALUES (
  'b2222222-2222-2222-2222-222222222204'::uuid, 'virtual_tour_3d',
  'https://my.matterport.com/show/?m=SEEDEXAMPLE',
  'b2222222-2222-2222-2222-222222222204/media/3d_thumb.webp',
  'L6PZfSi_.AyE_3t7t7R**0o#DgR4', 0, 'Tour virtual 3D'
)
ON CONFLICT DO NOTHING;

INSERT INTO public.property_media (property_id, media_type, storage_path, thumbnail_path, position, alt_text)
VALUES (
  'a1111111-1111-1111-1111-111111111102'::uuid, 'floor_plan',
  'a1111111-1111-1111-1111-111111111102/media/floorplan.webp',
  'a1111111-1111-1111-1111-111111111102/media/floorplan_thumb.webp',
  1, 'Plano de la casa'
)
ON CONFLICT DO NOTHING;

-- ---- A price reduction event on one BR listing (drives "price reduced" badge) ----
INSERT INTO public.property_price_events (property_id, event_type, price_cents, currency, status, note, occurred_at)
VALUES (
  'b2222222-2222-2222-2222-222222222202'::uuid, 'price_changed',
  158000000::bigint, 'BRL', 'active', 'Reduzido para venda rápida', now() - interval '5 days'
);
-- keep properties.price_cents authoritative (sync to the reduced price)
UPDATE public.properties SET price_cents = 158000000
  WHERE id = 'b2222222-2222-2222-2222-222222222202'::uuid;
UPDATE public.property_costs SET amount_cents = 158000000
  WHERE property_id = 'b2222222-2222-2222-2222-222222222202'::uuid AND cost_type = 'sale_price';

END $seed$;
