# FEATURES-IDEAS.md — Reel Estate Feature Catalog

A build-ready catalog synthesized from 10 product lenses, deduped and organized by theme. Grounded in what leading players (Zillow, Redfin, QuintoAndar, Zonaprop, Argenprop, Idealista, Rightmove, VivaReal, Tinder, Hinge, TikTok, Pinterest, Airbnb) actually ship, mapped to our **Expo + Supabase hexagonal** stack and LATAM-first thesis.

> **Stack baseline:** Expo 56 / RN 0.85 / react-native-web, Supabase (Postgres + Auth + Storage + RLS + Realtime + Edge Functions), hexagonal feature slices (`domain/application/infrastructure/ui`) behind a DI container, Zustand + Zod + NativeWind 4 + Reanimated 4 + FlashList 2 + expo-image, Vitest (strict TDD). RevenueCat planned for billing. **Already built:** swipe feed + filters, ficha detail, email auth, like + save-to-folders, Saved hub. **Designed, not built:** membership tiers + entitlements/quotas, verified badges (KYC), video reels schema.
>
> **Known gotcha:** Hermes ships only PARTIAL Intl — formatters are hand-rolled in `src/shared/ui/lib/format.ts`. Any i18n/FX/date work must NOT assume `Intl.NumberFormat`/`DateTimeFormat` on native.

---

## ★ Recommended next 5 (highest impact/effort given what's built)

These maximize leverage on top of the existing feed + ficha + auth + save + designed-membership, and each unlocks downstream features.

| # | Feature | Why now | Stack mapping |
|---|---------|---------|---------------|
| **1** | **Implicit-signal capture + swipe-signal ranking** | The feed is `publishedAt DESC` with ZERO personalization and ZERO negative signal — the single biggest gap for a product literally called "Reel Estate". Capturing dwell/like/skip/save is cheap NOW and impossible to backfill later; it's the substrate every other AI feature (daily picks, similar, NL search, alerts) consumes. | New `feed_events` table written from the feed client; extend `interactions-store` to emit timed events. New `recommendations` slice mirroring `feed` (`rank-feed.ts` use-case, repo port, wired in `core/di/container.ts`). Start content-based (pgvector already on Supabase), order keyset by score. Phase 1 = capture (S), Phase 2 = ranking (M/L). |
| **2** | **Swipe gestures: like / pass / super-like / rewind** | Turns the scroll into the discovery game and generates the missing **negative signal** the ranker needs. Super-like + rewind are proven Tinder premium hooks — they monetize directly via the planned RevenueCat tiers/quotas. | react-native-gesture-handler + Reanimated over the existing feed card. Right=like (exists), left=pass (new negative → `feed_events`), up=super-like (capped per tier via entitlements), rewind button (gated). All writes go to `feed_events`, feeding #1. |
| **3** | **WhatsApp-first share with rich OG ficha card** | WhatsApp IS the LATAM social graph; house-hunting is a group activity. Every share is a free acquisition surface and must work for anonymous (no-login) viewers. Lowest-effort viral loop, and it underpins shared folders, referrals, and SEO pages. | Expo Linking + expo-sharing + a Supabase Edge Function rendering dynamic OG images (satori/@vercel/og-style) per property. Universal/app links resolve to the ficha route. New public share route only. |
| **4** | **Cold-start taste onboarding (swipe quiz) + Daily Picks** | Today a brand-new user hits a generic mock feed. A 30s warm-up swipe deck seeds the taste vector by card ~5 (reuses #1's embedding space + the swipe UI). Daily Picks (a capped finite deck + push) manufactures the daily-open habit and fixes infinite-scroll fatigue — the #1 DAU lever. | Onboarding screens persist early swipes to `user_preferences`. `pg_cron` nightly materializes `daily_picks(user_id, date, item_ids)`; Expo push at a good per-user hour. Deck size scales by tier. Reuses feed ranking + swipe UI. |
| **5** | **Saved searches + price-drop / new-match alerts (push + WhatsApp)** | The #1 reason real-estate users return, and we already have the like/save graph + filter schema to power it. Converts one-time browsers into a retention loop and gives membership tiers a reason to exist (alert frequency/quotas). | New `saved_searches` table (filter JSON, frequency, channels) under RLS — the stored predicate is literally the existing feed-filter schema. Edge Function / pg trigger matches new+price-changed listings, fans out via Expo Push + WhatsApp Cloud API. |

**Sequencing note:** 1 → 2 are intertwined (gestures produce the events ranking consumes); build capture first. 3 and 5 share the Edge-Function + WhatsApp plumbing. 4 depends on 1's embedding space.

---

## Quick wins (S effort)

Low cost, high perceived value — mostly client-only or reusing existing data/infra.

| Feature | Value | Impact | Stack note |
|---------|-------|--------|------------|
| **Implicit-signal capture** | Log dwell/swipe-velocity/photo-taps — strongest preference signal | High | Extend `interactions-store`; batch-flush to `feed_events`. Data substrate, no ML yet. |
| **Price-drop / back-on-market alerts on liked/saved** | Ping on price drop or relisting of saved properties | High | Postgres trigger → notifications outbox → push/email/WhatsApp; joins existing like/save tables. |
| **Tour Mode (autoplay playlist)** | Hands-free Stories-style auto-advance through a folder/zone | Med | Pure client playback controller over the feed list (`durationMs` already in `ReelMedia`). |
| **Split-screen compare tray** | Compare 2–3 listings on price/m²/expensas/commute | Med | Client-only column table from existing `FeedItem` + ficha data. Surfaces the LATAM cost stack. |
| **Dislike-to-train "why not" chips** | Reason chips on pass (too caro / wrong zona / few rooms) | Med | Tiny chips writing structured negatives to `feed_events`. |
| **"Explain this ficha" AI TL;DR** | One-tap pros/cons + hidden-cost summary | Med | Edge Function summarizes ficha entity; cache per property. Surfaces "cheap rent, brutal expensas" trap. |
| **Social-proof badges** | "Saved 12× this week", "trending in Palermo" | Med | Materialized view / counter table over existing likes/saves. Aggregate = privacy-safe. |
| **Report & block flow** | One-tap report/block feeds moderation + scam model | High | `reports` + `blocks` tables with RLS; reports increment risk score. Trivial on Supabase. |
| **Tiered trust badges + "why trust this" panel** | Composite trust state (identity/listing/location/visited) | Med | Derive from existing/new boolean flags; render on card + ficha. |
| **Pre-payment scam-warning interstitial** | Interrupt "seña before visiting" at the moment of risk | Med | Client interstitial triggered by chat intent / low-trust listing. Highest impact/effort in safety. |
| **Refer-a-property nudge** | "Send to a friend" with recent-recipient suggestions | Med | `referrals` table + existing WhatsApp/OG share. |
| **Response-time SLA + agent quality score** | "Responde rápido" badge from lead timestamps | Med | Compute from `lead_events`; cache in existing `agent_perf_summary` Json. |
| **A-la-carte consumables (super-like / who-saved-this / priority intro)** | Micro-purchases to stand out or jump the queue | Med | RevenueCat consumables + `consumable_grants` ledger over existing likes. ~60% of Tinder revenue. |
| **Verified-badge fee** | Charge for the KYC-backed verified badge + ranking lift | Med | Reuses designed verified-badge + entitlements; attach a price. |
| **Dark mode** | System-aware + manual toggle for the night-in-bed feed | Med | NativeWind `dark:` + expo-system-ui (both already wired). |
| **Low-data / Data-Saver mode** | Cap to 480p, disable autoplay, pause prefetch on metered | High | netinfo + a preferences-store flag read by player/prefetch. LATAM prepaid goodwill. |
| **Crash + error monitoring** | Sentry traces across the long low-end Android tail | Med | sentry-expo with source maps in EAS; core monitoring wrapper. |
| **Feature flags + remote config** | Dark-launch, kill bad ranking, gate paid tiers | Med | `feature_flags` table → Zustand config-store; `useFlag()` hook. Pairs with entitlements. |
| **Weekly email digest** | Recover push-muted users with matches + market pulse | Med | `pg_cron` Edge Function + Resend/Postmark + React Email. |
| **Neighborhood waitlists** | "Avisame cuando haya en este barrio" captures intent in thin inventory | Med | Specialization of saved_searches scoped to geo; doubles as supply-side demand signal. |
| **"N new matches" badge + inbox** | Aggregate alerts into one dopamine counter | Med | Materialized count + Expo push badge + "Novedades" tab. |
| **Historial de precio & días en mercado** | Price drops + days-listed = negotiation gold | High | `price_events` + `first_listed_at` columns; sparkline on ficha. "Lleva 180 días" is LATAM gold. |
| **Floor plan layer** | Read the real layout, not just photos | Med | `floor_plan` asset in media schema → Supabase Storage → gallery tab. |
| **Listing freshness / expiry nudge** | Auto-prompt stale listings; drop dead ones | Med | `pg_cron` flags stale `updated_at`; auto-hide logged in `price_events`. |
| **Localized formatting library** | Locale-correct dates/m²/counts without full Intl | Low | Extend `format.ts`; pure functions, trivially Vitest-able. Foundation for i18n + FX. |
| **Image optimization (AVIF/WebP, signed URLs, blurhash)** | Fast right-sized photos with placeholders | Med | Supabase image transforms / CDN proxy; replace the picsum TODO in `media.ts`. |
| **CI quality gates (Vitest / tsc / Lighthouse / bundle)** | Block regressions before merge | Med | GitHub Actions enforcing the existing TDD discipline. |
| **Native share + deep links** | Rich WhatsApp unfurl that deep-links into the ficha | Med | expo-router typed deep links + OG meta on web route. |

---

## Big bets (L effort, transformative)

High investment, category-defining or moat-building.

| Feature | Value | Impact | Stack note |
|---------|-------|--------|------------|
| **Map-based discovery mode** | Flip the filtered set between swipe feed and interactive pin map | High | react-native-maps / MapLibre; PostGIS `geography(Point)` + bbox; client supercluster. Table-stakes credibility + unlocks geo features below. |
| **Commute-time search** | "Homes ≤30 min from work" by car/transit/walk | High | Isochrone provider (Google/Mapbox/TravelTime) via Edge Function + cache; PostGIS `ST_Within`. Zillow's most-loved filter; CABA/São Paulo commute pain. |
| **AVM "¿es un buen precio?"** | Green/amber/red price-vs-market verdict | High | Per-zone price/m² model in Postgres comps table; gate precise estimate behind Pro. Zestimate/Qpreço — the #1 reason users open portals; LATAM portals DON'T do it. |
| **Platform-backed rent guarantee (garantía/fiador replacement)** | Replace fiador + deposit with a platform-backed guarantee | High | Insurer/fintech partner (seguro de caución AR / seguro-fiança BR) behind a `GuaranteePort`; RevenueCat/Stripe premium. **THE Argentine rental blocker** — QuintoAndar's killer moat. Category-defining trust + revenue. |
| **Swipe-together live room** | Two+ people swipe the SAME feed; mutual right-swipe → shared folder ("it's a match") | High | Supabase Realtime presence/broadcast keyed to a room id; deterministic feed ordering; reuses feed + like use-cases. The killer Tinder × Zillow mashup; uniquely shareable. |
| **Building & neighborhood reviews (Openigloo-style)** | Verified-resident ratings: noise, security, expensas fairness, water, management | High | New `buildings` entity (PostGIS de-dupe by address) + `building_reviews`; ties to verified badges. Durable data moat; near-untapped in LATAM. |
| **Reel/ficha listing creation wizard** | Agents/owners self-publish a vertical reel + ficha into the feed | High | New `listings` slice writing to existing properties/reels/costs/amenities tables; Expo Camera + expo-video → Storage; RLS by `owner_id`. The missing write-path to real inventory. |
| **Lead inbox + lightweight agent CRM** | Every like/save/contact becomes a triageable lead | High | `leads` + `lead_events` tables; trigger materializes leads from likes/folder_items; Realtime + push. A "like" is a warm signal portals never had — Zillow Premier Agent core. |
| **Bulk import (XML/CSV feed)** | Onboard an agency's whole inventory in one step | High | Edge Function parses RESO/RETS-style XML/CSV; idempotent upsert on `(source, listing_code)` (fields already exist). Biggest unlock for seeding REAL inventory fast. |
| **Network-aware video transcoding (HLS/ABR)** | Reels stream at a bitrate matched to the live connection | High | Storage trigger → Mux/Cloudflare Stream/MediaConvert → HLS ladder back to private bucket; expo-video signed URLs behind CDN. Biggest infra unlock: photo-feed → true reel feed. |
| **Instant visit booking + agent calendar** | Calendly-style swipe-to-tour from the ficha | High→Med | `visits` + `availability_slots` with RLS + Realtime slot-locking; `VisitScheduler` port; push + WhatsApp confirmation. Zillow Instant Book — cleanest like→real-world lead. |
| **Make-an-offer / negotiate in-app** | Structured offer + counter-offer thread | High | `offers` table (status machine + parent_offer_id); capture currency + FX snapshot at offer time. LATAM prices are negotiable + dual-currency. |
| **Digital lease + e-signature** | Generate, review, legally e-sign the lease in-app | High | `ContractPort` adapter (Clicksign BR / DocuSign / local); signed PDF to private Storage. The moment journey → transaction. |
| **Reserva / seña with escrow** | Lock a property with a refundable deposit held in escrow | High | Mercado Pago (AR) / Pix (BR) behind a `PaymentPort` (NOT RevenueCat); strict status machine + ledger; idempotent webhooks. Codifies the AR seña mechanic. |
| **Monthly rent collection** | Pay rent in-app; landlords get guaranteed payouts + history | Med | Recurring Pix/MP/card via `PaymentPort`; `rent_ledger` per lease. On-time history → portable creditworthiness. QuintoAndar's recurring flywheel. |
| **Reusable renter screening passport** | Verify income/credit once, reuse across listings | Med | Local bureaus (Nosis/Veraz AR, Serasa/SPC BR) via Edge Function; store pass/fail, not raw report; alt-income (monotributo/recibos) for informal economy. Zillow portable application. |
| **Alternative-data affordability check** | Pre-qualify on telco/utility/payment signals, not just bureau score | Med | `AffordabilityPort` adapter; store band only. Lifts approval ~25% for informal/thin-file LATAM renters. |
| **Agency SaaS tier (CRM + seats + bulk publishing)** | Recurring B2B: seats, lead inbox, bulk import, branded profile, analytics | High | `organizations` + `org_members` + per-seat entitlements on the existing tier engine; Stripe per-seat. Idealista/Rightmove are fundamentally agency-subscription businesses. |
| **Pay-per-lead auction by zone (barrio exclusivity)** | Agents bid for exclusive/priority leads in a barrio | High | Extends contact-unlock with `zone_bids` keyed by PostGIS polygon + lead-routing use-case. Zillow's biggest pricing-power lever. |
| **Visual search ("find homes like this photo")** | Tap/upload a photo → similar listings | Med | CLIP-style embedding via Edge Function → pgvector ANN; embeddings pipeline at ingest. Pinterest Lens (~1B searches). Build after pgvector exists. |
| **3D / Matterport virtual tour** | Walk the property remotely — top decision factor | High | Extend media schema with 3D-tour URL/embed (stay provider-agnostic post CoStar/Matterport churn); gate behind Pro/Ultimate. 62% rank tours #1; 71% would offer on a tour alone. |
| **SEO landing pages per listing & neighborhood** | Server-rendered Expo Web pages Google indexes | High | expo-router web routes + SSR/SSG + schema.org `RealEstateListing` + sitemaps. Portals' largest top-of-funnel. **Defer until real inventory exists.** |
| **B2B demand-data licensing** | Sell anonymized revealed-demand datasets to developers/banks/funds | Med | `pg_cron` rollups by geo/price/type from event tables; strict anonymization + RLS. Swipe data is revealed intent no portal has. |
| **Group housing-hunt rooms (roommates)** | 3+ roommates co-hunt with shared budget + voting | Low | Generalizes shared folders to N-member rooms + Realtime chat/voting. Sequence AFTER couple-focused folders. |

---

## Theme 1 — Discovery, Feed & Swipe UX

The core vertical scroll/swipe experience. (Cross-refs: ranking + gestures + capture are in the ★ shortlist.)

| Feature | Value | Impact | Effort | Stack note |
|---------|-------|--------|--------|------------|
| **Implicit-signal ranking feed** | Replace `publishedAt DESC` with a learned per-user relevance score | High | M/L | `feed_events` + scoring view/Edge Function; affinity vector (price band, zona, bedrooms, amenities); keep keyset pagination ordered by score. |
| **Swipe gestures (like/pass/super-like/rewind)** | Directional intent trains the model + monetizes via tiers | High | M | Gesture-handler + Reanimated over feed card; pass = missing negative signal; super-like/rewind gated by entitlements. |
| **Short-form video reels (autoplay + mute)** | Real 7–30s vertical video autoplaying muted in viewport | High | M | `primaryReel.mediaType='video'` already modeled; expo-video + `onViewableItemsChanged`; single-active-player pool; HLS in Storage. ~403% more inquiries. |
| **Map mode / draw-on-map / commute-time** | Browse by barrio polygon and travel-time, not just a list | High | L | PostGIS foundation (see Big Bets). Draw = `ST_Within(point, polygon)`; barrio boundaries are emotional + precise in LATAM. |
| **Daily Picks (capped "deck of the day")** | Finite curated deck + push builds the daily habit | High | M | `pg_cron` ranker → `daily_picks`; Expo push; size scales by tier. QuintoAndar daily suggestions + Tinder Top Picks. |
| **Similar properties ("more like this")** | Rail of structurally/visually similar listings | Med | M | Tier 1: SQL (same op, ±price, ±bedrooms, same zona). Tier 2: pgvector ANN over photo+text embeddings. Native to Supabase. |
| **Conversational / NL search** | "PH luminoso 2 amb con patio en Villa Crespo hasta USD 120k" → filters | High | M | Edge Function LLM maps free text → `FeedFilters` + fuzzy attrs via pgvector; voice via expo-speech. Zillow + Redfin shipped this in 2025; now table-stakes. |
| **Collections / moodboards** | Upgrade folders into shareable, auto-themed, taste-signal boards | Med | M | Extend folder entity with cover + public share token (RLS read-by-token + `/b/[token]` route). Contents feed the affinity model. |
| **Tour Mode (autoplay playlist)** | Lean-back Stories-style auto-advance | Med | S | Client playback controller; `durationMs` already present. |
| **Split-screen compare** | Head-to-head on price/m²/expensas/commute/amenities | Med | S | Client-only compare tray from existing data. |
| **Dislike-to-train "why not" chips** | Labeled negatives sharpen the model fast | Med | S | Reason chips → structured negatives in `feed_events`. |
| **Cold-start taste onboarding** | 30s swipe quiz bootstraps personalization before any history | Med | S | Pre-feed swipe deck seeds taste vector (same embedding space). Reuses swipe UI. |
| **Visual search ("like this photo")** | Photo → similar-looking listings | Med | L | pgvector ANN + ingest embeddings pipeline. Build after similar-properties. |
| **Blind / anonymized browse mode** | Hide advertiser identity to react to the home, not the agent | Low | S | UI toggle suppressing identity/counts. Cleaner taste signal; novel framing. |
| **AR "view from window" / neighborhood overlay** | Preview real view, sun, nearby POIs in AR | Low | L | expo-camera + ViroReact/native AR; sun path from lat/lng + `orientación`. Flagship Ultimate/Top showcase only — native-only, expensive. |

---

## Theme 2 — Property Intelligence & Ficha Enrichment

Discrete read-only "intelligence cards" that stack onto the ficha. Ship UI + compute now on mock inputs, swap real APIs later. Heavy logic lives in Edge Functions + Postgres so entitlements can gate premium cards.

| Feature | Value | Impact | Effort | Stack note |
|---------|-------|--------|--------|------------|
| **Cuota hipotecaria UVA calculator** | Turn price → a real monthly cuota in the user's currency/salary terms | High | M | Edge Function holds formula; daily-refreshed UVA/CER table via cron. AR cuotas update DAILY with inflation; show "cuota hoy" + income-needed line. BR uses SAC/Price. |
| **Costo total de propiedad (TCO)** | One honest number: price + escritura/ITBI + comisión + expensas + IPTU/ABL + seguro + mudanza | High | M | Pure compute over stored fields + per-country constants config table. VivaReal "Custo Total"; AR escribano+sellos+comisión = 6–10%. |
| **AVM price verdict** | Green/amber/red over/fair/under-priced for zone + m² | High | L | Per-zone price/m² model in comps table; gate precise estimate behind Pro. Always frame "estimate, not appraisal". |
| **Comparables rail** | 3–6 nearby comparable listings with price/m² delta | High | M | Postgres query (same barrio, ±1 ambiente, ±20% m²) rendered as a swipe-able mini-feed → boosts session depth + explains the AVM. |
| **Historial de precio & días en mercado** | Price drops, relistings, days-on-market — negotiation gold | High | S | `price_events` + `first_listed_at`; sparkline on ficha. |
| **Walk/Transit score + nearby POIs** | Livability + groceries/subte/pharmacies pins | High | M | OSM/Overpass (free) or Google Places via Edge Function; cache per geohash. LATAM: cuadras al subte/SUBE, feria, hospital público. |
| **Riesgo climático & ambiental** | Flag flood/heat/noise before falling in love with a photo | Med | M | Open flood/elevation + city noise datasets keyed by lat/lng, cached per geohash. Redfin/First Street; La Plata/SP enchentes. |
| **Score de seguridad del barrio** | The #1 LATAM question, framed responsibly | High | M | Aggregate open crime data + verified-account community perception. Frame as "percepción + datos disponibles"; NEVER auto-redline. |
| **Tendencia de expensas / condomínio** | The silent killer's trend vs similar buildings | Med | M | Time-series table + per-building aggregate over stored expensas. No portal surfaces the TREND. |
| **Reputación del edificio** | Per-building page: age, amenities, complaints, expensas band, units | Med | M | New `building` entity FK'd by listings; aggregates + verified-resident UGC. Data moat. |
| **Estado legal / título checklist** | Plain-language: escritura, inhibiciones, deuda de expensas, occupancy | Med | M | Structured `legal_status` fields corroborated by KYC/verified-listing; never store raw docs. AR debt is propter rem — follows the property. |
| **Floor plan layer** | Read the real layout | Med | S | `floor_plan` asset in media schema → gallery tab. |
| **Simulación de orientación solar** | Natural light by hour/season from `orientación` + floor | Med | M | Solar-position math (Edge/client), no external API. Turns an existing field into a visual layer almost free. |
| **AI assistant del aviso** | Chat grounded in the ficha + intelligence cards ("¿acepta mascotas? ¿cuota? ¿es justo el precio?") | High | L | Edge Function LLM + RAG over the listing's structured data + computed cards; ES/PT; gate volume by tier. WhatsApp-native expectation. |
| **Virtual staging (labeled)** | Restage empty/dated rooms; boost engagement on bare listings | Med | M/L | Image-gen Edge Function → store original + variant with `ai_enhanced` flag. **Label as render** (CA AB-723 mandates labeling + keeping originals). |
| **Calificación energética / utility-cost hint** | Coarse efficiency + likely boleta de luz/gas | Low | M | Heuristic from antigüedad/m²/orientación/A-A. EPC on Rightmove/Idealista; AR IPREA rolling out. Low priority, cheap to stub. |

---

## Theme 3 — AI / ML

(Many cross-listed above — ranking, NL search, AI assistant, similar/visual search, virtual staging, "explain ficha".)

| Feature | Value | Impact | Effort | Stack note |
|---------|-------|--------|--------|------------|
| **Photo auto-tagging + room classification + quality scoring** | Auto-tag room/style/light/amenities; score quality | High | M | Storage upload trigger → vision model (or Restb.ai) → `photo_tags` table. Powers NL search, content embeddings, "low-quality cover" nudge. QuintoAndar reads flooring/light/style. |
| **Price prediction / fair-price AVM** | Above/below market badge per zone+building+specs | High | L | Regression/embedding on features + comps; `valuations` table refreshed by `pg_cron`. LATAM: USD-vs-local + cash markets make comps noisy — show ranges, segment by currency. |
| **Fraud & duplicate-listing detection** | Flag scams, reused photos, impossible prices before the feed | High | M | Perceptual-hash on ingest + LLM/rules anomaly layer; quarantine queue; ties to verified badges. 40%+ of portal listings are fraudulent/misused. |
| **Auto-generated listing descriptions** | ES/PT copy from specs+photos for the upload flow | Med | M | Edge Function + `ai_generated` flag. Region vocab: PT-BR quarto/suíte/vaga vs AR ambiente/dormitorio/cochera. Unblocks supply. |
| **Lifestyle / persona match** | Score vs "apto home-office", "familiar", "pet-friendly" | Med | M | Persona scores from photo tags + amenities + neighborhood data; ficha chips + feed inputs. Casa Blanca markets exactly this. |
| **Real-time ES ↔ PT translation** | Auto-translate listings + chat across AR/BR | Med | S | Edge Function translation cached per locale; "translated by AI" label. Core to the two-country cross-border thesis. |
| **Smart auto-foldering + saved-search alerts** | Suggest folder by embedding similarity; alert on new matches | Med | M | Cluster saved props by pgvector; persist taste vector as saved search; `pg_cron` nightly scan → push/WhatsApp. #1 retention loop. |
| **Voice interface for search** | "Mostrame 2 ambientes en Belgrano" hands-free | Low | M | expo-speech → NL-search parser. Sequence AFTER NL search exists. Accented-text typing on mobile is friction. |

---

## Theme 4 — Social, Sharing & Collaboration

Housing is a co-decision (86% shop with a partner). LATAM families decide over WhatsApp.

| Feature | Value | Impact | Effort | Stack note |
|---------|-------|--------|--------|------------|
| **WhatsApp-first share + OG ficha card** | Branded preview deep-linking into the ficha | High | S | Edge Function dynamic OG images; works anonymous. THE table-stakes viral loop. |
| **Collaborative shared folders** | Invite couple/family/roommates; everyone adds + sees in real time | High | M | `folder_members` join (owner/editor/viewer) + RLS; Realtime broadcasts. Reuses the whole folders feature. Zillow's Oct-2025 co-shopping bet. |
| **Reactions + threaded notes on saved props** | Emoji + comments per property inside a shared folder | High | M | `property_reactions` + `property_comments` scoped to folder, RLS + Realtime. Argenprop already does shared comment/evaluate. |
| **Swipe-together live room** | Mutual right-swipe → shared folder ("it's a match") | High | L | Realtime presence/broadcast room; deterministic feed. Killer Tinder × Zillow mashup. |
| **Matchmaker share-link** | Time-boxed link; friends swipe FOR you, you decide | Med | M | Edge Function mints short-lived token; anonymous swipe surface writes to a `recommendations` tray. Family co-signs garantías — fits the culture. |
| **Building & neighborhood reviews** | Verified-resident axis ratings | High | L | `buildings` (PostGIS de-dupe) + reviews; ties to verified badges. Openigloo-style; LATAM gap. |
| **Follow agents / barrios / creators** | Personalized activity feed + digests | Med | M | `follows` (polymorphic) + fan-out-on-read + scheduled push. TikTok: creators selling a lifestyle/neighborhood win. |
| **Public profiles & curated collections** | Publish shareable mini-feeds ("Best lofts San Telmo <USD 90k") | Med | M | `visibility` flag on folders + public read route (RLS anon read). SEO/share gold + creator-tier feature. |
| **Decision board: compare + vote shortlist** | Side-by-side grid where members vote/rank finalists | Med | M | Reuses shared-folder membership + a vote table + Realtime tallies. Closes discover → decide. |
| **Garantía/fiador social circle helper** | Loop a co-signer into one property + a requirements checklist | Med | M | Reuses invite mechanics scoped to a property; templated checklist per market. No competitor treats the guarantor as a social participant. |
| **Reactions-driven "taste match" between co-shoppers** | "You both love balconies; you disagree on barrios" | Low | M | Per-attribute agreement score over existing like data; nightly recompute. Screenshot-worthy. |
| **Agent/owner public reputation & response score** | Response time + listing accuracy + verified + ratings on every reel | Med | M | `advertiser_reviews` + computed metrics on the ficha identity block; RLS-gated; ties to verified badges. Trust is the #1 LATAM friction. |
| **Refer-a-property nudge** | "Send to a friend" with recent-recipient suggestions | Med | S | `referrals` table + existing WhatsApp/OG share. |
| **Group housing-hunt rooms (roommates)** | 3+ co-hunt: shared budget, must-haves, group voting | Low | L | Generalizes shared folders to N-member rooms. Sequence after couples. |

---

## Theme 5 — Supply Side (Agent / Owner / Seller Marketplace Tools)

Turn the mock-seeded feed into a real two-sided marketplace feeding fresh inventory.

| Feature | Value | Impact | Effort | Stack note |
|---------|-------|--------|--------|------------|
| **Listing creation wizard (record/upload)** | Self-publish a vertical reel + ficha into the feed | High | L | New `listings` slice → existing properties/reels/costs/amenities tables; Camera + expo-video; RLS by `owner_id`; status pending→active. The missing write-path. |
| **Listing management dashboard** | "My properties" hub: edit + lifecycle (active→sold/rented/hidden) | High | M | Reuses `listing_status` enum + `price_events` audit trail; `ListingRepository` port + RLS. |
| **Lead inbox + agent CRM** | Likes/saves/contacts → triageable leads with statuses/notes/reminders | High | L | `leads` + `lead_events`; trigger materializes from likes/folder_items; Realtime + push. A "like" is a warm signal portals never had. |
| **Per-listing analytics** | Impressions, swipe-through, likes, saves, ficha opens, contacts | High | M | `listing_events` → nightly `listing_daily_stats`. **Swipe-through rate is unique to a swipe app.** |
| **Cohort benchmarking** | "Your listing gets 40% fewer saves than similar nearby" | Med | M | Postgres view over stats grouped by city/kind/price band. Rightmove Showcase upsell mechanic. |
| **Boost / featured / promote** | Pay to push a listing higher in the swipe queue | High | M | `listing_boosts` (priority_weight, window) weighted in `get-feed-page`; RevenueCat consumables / tier-included. Zonaprop Super Destacado, but native to a feed. |
| **Pro subscription tiers** | Plans unlock listing quotas, boosts, analytics, CRM seats, badges | High | M | Extends the EXISTING entitlements engine with supply-side keys; reuses `enforce_quota`/`resolve_entitlement`. Low-risk reuse. |
| **Bulk import (XML/CSV)** | Onboard a whole agency inventory in one step | High | L | Edge Function parses RESO/RETS-style; idempotent upsert on `(source, listing_code)` (fields exist). Biggest real-inventory unlock. |
| **Agency / brokerage team accounts** | Multi-seat, roles, shared inventory, per-agent attribution | Med | L | `agencies` + `agency_members` + `properties.agency_id`; seats gated by `crm_seats`. LATAM = inmobiliarias, not solo agents. |
| **Lead routing & auto-qualification** | Route by zone/price; pre-qualify budget + guarantee type + move date | Med | M | `lead_routing_rules` + assign-on-insert; capture `guarantee_type` enum (garantia_propietaria/fiador/seguro_caucion/seguro_fianca) up front — LATAM gold. |
| **Visit scheduling + agent calendar** | Book a visit against real availability; both get reminders | Med | M | `agent_availability` + `visits`; push/email + .ics. No-show rate feeds quality scoring. QuintoAndar's brand. |
| **Response-time SLA + quality score** | "Responde rápido" badge influencing ranking | Med | S | From `lead_events` timestamps; cached in `agent_perf_summary`. Fixes the 4–6h LATAM response problem structurally. |
| **Agency storefront / agent profile** | Branded public page: active reels, badges, reviews, follow | Med | M | Profile route over active properties; `agency_logo_path`/`agency_name` exist. Expo Web = SEO-able + WhatsApp-shareable. |
| **Verified pro badges (identity + license + listing)** | KYC + broker license → "ownership-verified" on reel + ficha | High | M | Builds on designed verified badges; `broker_license` fields exist; `agent_verifications` (never raw docs). Apply to SUPPLY side first. |
| **FSBO concierge / managed-listing flow** | Owner opts into pro media/scheduling/matchmaking, or self-serves free | Med | L | `advertiser_type` enum ALREADY has `managed`; pending status flags for ops. QuintoAndar's signature free-photographer move. |
| **AI listing assist** | Auto-description, captions, amenity tags, price band from photos | Med | M | Edge Function vision+LLM; bilingual ES/PT; gated behind pro entitlement. Slashes the #1 supply drop-off. |
| **Listing freshness / expiry nudge** | Prompt stale listings to confirm/update; drop expired | Med | S | `pg_cron` flags stale `updated_at`; auto-hide logged in `price_events`. Feed quality is existential for a swipe app. |

---

## Theme 6 — Trust, Safety, Verification & Messaging

Trust is the #1 LATAM friction (scams, ghost listings, bait pricing).

| Feature | Value | Impact | Effort | Stack note |
|---------|-------|--------|--------|------------|
| **KYC identity verification (video-selfie + ID)** | Confirm a real human before listing/messaging → verified badge | High | L | Provider SDK (LATAM-native MetaMap/Truora handle DNI/CPF/RG/RENAPER) → Edge Function webhook flips flag. NEVER store raw docs (copy Tinder's delete-selfie pattern). |
| **Listing verification badge** | Marks a real, legitimately-advertised unit | High | L | `verification_status` enum; cross-check ownership doc / agent license (CUIT/CRECI/matrícula CUCICBA) via provider or manual queue; RLS down-ranks unverified. |
| **Address/location verification** | In-app geo-tagged photos + walkthrough clips prove the unit exists | High | M | Reuses video reels schema; Edge Function checks EXIF/GPS proximity. **The verification video doubles as feed content.** Airbnb's flow. |
| **Duplicate & clone detection** | Catch copied photos/text reposted with new contact | High | M | pHash + description embedding in pgvector; near-duplicate query at upload. Beats the 47%/10h industry detection gap. |
| **Scam-pattern scoring engine** | Auto-flag fraud signatures (price far below market, "owner abroad", upfront seña) | High | M | Price z-score over comps + keyword classifier + account features → `risk_score` → review queue / soft-hide / interstitial. Rules ship day-one value. |
| **In-app secure messaging** | Keep buyer-seller chat on-platform: moderated, masked, evidenced | High | M | Realtime + `messages` table (RLS to the two participants), thread per property, auth-gated; push. `MessagingPort` adapter. Zillow + Idealista shipped this. |
| **Masked phone / WhatsApp relay** | Call/WhatsApp without exposing real numbers | Med | M | Twilio (or LATAM provider) proxy per conversation; WhatsApp Business API relay. Respects local behavior while keeping the platform in the loop. |
| **Report & block flow** | One-tap report/block feeds moderation + trains the scam model | High | S | `reports` + `blocks` + reasons enum. Reports auto-feed scam-scoring + clone ground truth. |
| **Verified-visited (staff/community inspector)** | Physical visit confirms existence + availability — strongest tier | Med | L | Inspector app captures geo+timestamped media + checklist → flips `verified_visited`. Gate behind a paid tier. Capital-light community variant. |
| **Platform-backed rent guarantee** | Replace fiador/garantía + deposit | High | L | Insurer/fintech partner; eligibility + policy via Edge Function; RevenueCat/Stripe premium. QuintoAndar Fiança Garantida — category-defining. |
| **Reusable renter screening passport** | Verify once, signal quality across listings | Med | L | Local bureaus (Nosis/Veraz, Serasa/SPC) + alt-income for informal economy; store pass/fail, strict-RLS doc vault with expiry. Zillow portable application. |
| **Agent/landlord/building reviews** | Post-interaction reputation | Med | M | `reviews` (subject = agent/landlord/building); only verified-interaction users review; light moderation reusing reports. Building reviews near-untapped in LATAM. |
| **AI content moderation (media + text)** | Screen photos/video/chat for NSFW, off-listing, contact leakage | Med | M | Vision API + text classifier on upload; hybrid auto-block + human queue. Single-modality misses 20–30% — combine image+text+behavior. |
| **Secure document exchange vault** | Encrypted, expiring, access-logged doc sharing | Med | M | Private Storage bucket + RLS scoped to a deal; signed time-limited URLs; watermark with recipient identity. Replaces WhatsApp/email doc leakage. |
| **Tiered trust badges + "why trust this" panel** | One visible trust state users instantly understand | Med | S | Composite tier from boolean flags + tappable explainer (mirrors Airbnb/Tinder disclaimers). Makes heavier features visible/sellable. |
| **Pre-payment scam-warning interstitial** | Interrupt "seña before visiting" at the moment of risk | Med | S | Client interstitial from chat intent / low-trust listing. Prevents the single most common loss; near-zero effort. |

---

## Theme 7 — Transactions & End-to-End Journey (swipe to keys)

The connective tissue that turns isolated features into a swipe-to-keys product.

| Feature | Value | Impact | Effort | Stack note |
|---------|-------|--------|--------|------------|
| **Instant visit booking** | Calendly-style swipe-to-tour from the ficha | High | M | `visits` + `availability_slots`, Realtime slot-locking, `VisitScheduler` port; push + WhatsApp confirm. |
| **Video / self-guided 3D tour booking** | Request a live walkthrough or explore a 3D tour before visiting | Med | M | `tour_type` enum on visit; 3D URL on property → WebView; video call via Daily/Jitsi room link. Cross-border (AR↔BR) differentiator. |
| **Make an offer / negotiate** | Structured offer + counter thread, currency + FX snapshot | High | M | `offers` table + status machine + parent_offer_id; trigger-enforced. LATAM prices negotiable + dual-currency. |
| **Rental application + document vault** | Reusable profile submitted with one tap | High | L | Private Storage + RLS; reuse KYC for ID; support informal-income docs (monotributo/recibos). QuintoAndar's wedge. |
| **Garantía / fiador marketplace** | Instant seguro de caución quote + bind in-app | High | L | `GuaranteePort` to insurers; quote via Edge Function; policy → vault. THE Argentine rental blocker → conversion. |
| **Alternative-data affordability check** | Pre-qualify on alt income signals, soft check | Med | L | `AffordabilityPort`; "fits your budget" band on feed, BuyAbility-style. Includes the informal economy. |
| **Reserva / seña with escrow** | Refundable deposit held until the deal proceeds | High | L | Mercado Pago/Pix behind `PaymentPort` (NOT RevenueCat); status machine + ledger; idempotent webhooks. |
| **Digital lease & e-signature** | Generate, review, legally e-sign in-app | High | L | `ContractPort` (Clicksign/DocuSign/local); signed PDF to private Storage. Journey → transaction. |
| **Mortgage pre-approval & lender marketplace** | Affordability + pre-approval from competing lenders | Med | L | `LenderPort`; lenders pay per qualified contact. More BR than AR (low mortgage penetration). |
| **Monthly rent collection** | Pay rent in-app; landlords get guaranteed payouts + history | Med | L | Recurring Pix/MP/card via `PaymentPort`; `rent_ledger`. On-time history → portable creditworthiness. |
| **Deposit & move-in/out checklist** | Timestamped photos protect the deposit | Low | M | `condition_reports` + items; private Storage + EXIF; both acknowledge via e-sign. |
| **WhatsApp-first coordination layer** | Every visit/offer/doc-request also lands in WhatsApp | High | M | WhatsApp Business API behind `MessagingPort`; approved templates + webhook ingest; in-app thread is source of truth. |
| **Guided closing / operation tracker** | Live progress tracker through every step to keys | Med | M | `transactions` aggregate orchestrating sub-entities as a state machine; Realtime status UI. No new external infra. |
| **Post-move services hub** | Utilities, movers, insurance after signing | Low | M | Affiliate adapters behind `ServiceProviderPort`; deep-links + referral tracking. Extends LTV past the transaction. |

---

## Theme 8 — Monetization & Business Model

Beyond the planned free/pro/ultimate/top subscriptions.

| Feature | Value | Impact | Effort | Stack note |
|---------|-------|--------|--------|------------|
| **Featured / boosted reels** | Pay to inject a listing higher into more decks | High | M | `boosts` table + ranking blend in the use-case layer; `boost_impressions` events; RevenueCat/Stripe. Native "top of search" for a feed. |
| **Contact-unlock credits (pay-per-lead)** | Agents buy credits; each WhatsApp reveal consumes credits | High | M | `lead_credits` ledger + `lead_unlocks`; Edge Function debits atomically; RLS hides PII until unlocked. Zillow Premier Agent core (~50% of revenue). |
| **Pay-per-lead auction by zone** | Bid for exclusive/priority leads in a barrio | High | L | `zone_bids` keyed by PostGIS polygon + routing use-case. Zillow's biggest pricing lever. |
| **Success fee / closing commission share** | Referral cut when an app-originated deal closes | High | L | `deals` + attribution trail + Stripe Invoicing. Attribution leakage is the risk — start self-report + spot audits. QuintoAndar 5–6%; HomeLight 25%. |
| **Rental guarantee marketplace referral** | Match tenants to caución insurers; earn per policy | High | M | `guarantee_referrals` + provider APIs (Finaer/ACG/BBVA, BR fiança). Tenant premium ~3–5% — large fee pool. |
| **Mortgage / financing lead referral** | Pre-qual + offers in-app; per-lead from banks | Med | M | `mortgage_leads` + lender webhooks; currency-aware. Rightmove mortgage revenue >doubled. Scope BR-first. |
| **Verified-badge fee** | Charge for the KYC badge + ranking lift | Med | S | Reuses designed verified badge + entitlements; attach a price. Revenue + quality signal. |
| **Agency SaaS tier** | Recurring B2B: seats, CRM, bulk publishing, analytics | High | L | `organizations` + per-seat entitlements + Stripe. Idealista/Rightmove are agency-subscription businesses (~70–80% of turnover). |
| **A-la-carte consumables** | Super-like / priority intro / who-liked-me | Med | S | RevenueCat consumables + `consumable_grants`; reuses likes. ~60% of Tinder revenue; "pay to jump the queue to a scarce apartment". |
| **Sponsored placements / brand ads** | Native sponsored reels (pozo/lançamento, banks, movers) | Med | M | `ad_campaigns` + labeled "sponsored" variant + frequency cap. Keep density low (TikTok/Pinterest model). |
| **Premium data / AVM & analytics paywall** | Pro/agency unlock valuations, history, comps, demand heatmaps | Med | L | `market_metrics` materialized view; **swipe like/save/skip rates are a demand signal no portal has.** |
| **B2B demand-data licensing** | Sell anonymized revealed-demand datasets | Med | L | `pg_cron` rollups; strict anonymization + RLS. "Where is unmet demand" for developers. |
| **Relocation / concierge service** | Managed shortlist + paperwork + garantía for a fee/% | Med | L | `concierge_requests` workflow + Stripe Invoicing; reuses guarantee/mortgage/affiliate toolkit. Start humans-behind-the-curtain. |
| **Move-in affiliate marketplace** | Movers, furniture, utilities, internet, insurance | Low | S | `affiliate_offers` + clicks/conversions + postbacks. Near-zero marginal cost at save-time. |
| **Featured-agent profile subscription** | Enhanced reviewed storefront generating inbound | Med | M | `agent_profiles` + `reviews` tied to leads; subscription via tier engine. Reviews feed the quality flywheel. |

---

## Theme 9 — Growth, Retention, Notifications & Onboarding

| Feature | Value | Impact | Effort | Stack note |
|---------|-------|--------|--------|------------|
| **Saved searches + instant/daily alerts** | Persist a filter set; alert on match or price drop | High | M | `saved_searches` (filter JSON, frequency, channels) under RLS — predicate is the existing filter schema. Re-entering a saved search re-opens the swipe feed. Cap 15/day then bundle. |
| **Price-drop / back-on-market alerts** | Ping on liked/saved property changes | High | S | Trigger → outbox → push/email/WhatsApp. Frame USD-vs-local for AR. |
| **WhatsApp as a first-class channel** | Alerts + nudges over WhatsApp | High | M | WhatsApp Business Cloud API via Edge Function; opt-in under RLS; approved templates. Open rates dwarf email in LATAM. |
| **Gamified onboarding + taste quiz** | Teach the swipe + build a preference vector by card 5 | High | M | Persist early swipes to `user_preferences`; feed ranking reads it. Ask comprar-vs-alquilar, USD-vs-local, barrios, deal-breakers (cochera/mascotas/amoblado). |
| **Daily Picks + streak** | Fresh curated batch + return-streak | High | M | `pg_cron` per-user picks; streak in profile; scheduled push. Hinge intentional scarcity. |
| **Smart similar-to-liked re-engagement push** | "New 2-amb in Palermo like the ones you saved" | High | M | Edge Function scores new listings vs like history → Expo push; quiet hours + caps. Variable-reward loop. |
| **"N new matches" badge + inbox** | Aggregate alerts into one compelling open | Med | S | Materialized count + push badge + "Novedades" tab. |
| **Referral program** | Invite over WhatsApp; both unlock a perk | High | M | `referrals` + deep links; reward in membership-days (ties to tiers, avoids fraud). |
| **Shareable moodboard / folder** | Share a folder as a public link/image card | High | M | Public read-only view + OG-image Edge Function. Turns the Saved hub into a growth engine. |
| **Collaborative folders / co-shopping** | Invite a partner to like/comment/vote together | High | L | Folder membership + RLS + Realtime. Shared accounts churn far less; built-in second-user growth. |
| **Weekly email digest** | Recover push-muted users with matches + market pulse | Med | S | `pg_cron` + Resend/Postmark + React Email. LATAM angle: USD blue-rate trend. |
| **Neighborhood waitlists** | "Avisame cuando haya en este barrio" | Med | S | Specialization of saved_searches scoped to geo; count doubles as supply demand signal. |
| **Re-engagement / win-back campaigns** | Nudge dormant users with a concrete price drop | Med | M | `pg_cron` segments by `last_active`; channel-appropriate sends + caps + suppression. |
| **Share-to-unlock / invite-gated perks** | Unlock a premium action by sharing | Med | S | Referral deep links + temporary entitlement lift; teaches what Pro feels like. |
| **SEO landing pages per listing & barrio** | Server-rendered Expo Web pages Google indexes | High | L | expo-router web + SSR/SSG + schema.org + sitemaps. Portals' largest top-of-funnel. **Defer until real inventory.** |
| **Home-screen widget ("Property of the day")** | Daily-glance habit on the home screen | Low | L | Native WidgetKit / App Widget via config plugin / dev build. Build last; pays off only after Daily Picks + alerts. |

---

## Theme 10 — Platform, Localization, Accessibility, Infra & Quality

| Feature | Value | Impact | Effort | Stack note |
|---------|-------|--------|--------|------------|
| **Full i18n (es-AR / es-419 / pt-BR)** | Every string/number/date in the user's regional convention | High | M | i18next + react-i18next; locale from expo-localization, override in a store. **Hermes partial-Intl** — bundle @formatjs polyfills or keep manual formatters. Owning es-AR + pt-BR in ONE app is an unclaimed position. |
| **Multi-currency + live FX (USD vs ARS/BRL)** | Show listing currency + a toggle to view-in currency with rate source + date | High | M | `fx_rates` table via cron Edge Function; new `currency` slice (Money + FxRate); extend `format.ts`; integer minor units. THE defining LATAM money problem; never silently convert. |
| **Network-aware video transcoding (HLS/ABR)** | Bitrate matched to the live connection, instant start | High | L | Storage trigger → Mux/Cloudflare Stream/MediaConvert → HLS ladder → private bucket; expo-video signed URLs + CDN. Biggest infra unlock. |
| **Smart prefetch + feed media caching** | Next 1–2 reels warm just-in-time, no waste on skips | High | M | FlashList `onViewableItemsChanged` → prefetch controller warming expo-image + ~first 2s/500KB of next video; cancel on fast scroll. No new dep. |
| **Low-data / Data-Saver mode** | Cap 480p, disable autoplay, pause prefetch on metered | High | S | netinfo + preferences-store flag read by player/prefetch. LATAM prepaid goodwill. |
| **Installable PWA (manifest + service worker)** | Home-screen install, full-screen, no store | Med | M | Web manifest + Workbox precache over the expo-router web build + A2HS prompt. Android-dominant LATAM acquisition from a WhatsApp link. |
| **Offline mode / cached feed + saved props** | Recent reels, folders, fichas browsable offline | Med | M | Bounded cache (expo-sqlite/MMKV) via a **caching-decorator repo** over supabase repos in `core/di/container.ts` — domain/UI untouched. Queue offline likes/saves, replay on reconnect. |
| **Dark mode** | System-aware + manual toggle for the night feed | Med | S | NativeWind `dark:` + expo-system-ui (already wired). |
| **Accessibility (screen readers, dynamic type, contrast, captions)** | VoiceOver/TalkBack feed navigation; WCAG; reels captions | Med | M | accessibilityLabel/Role/Action on cards + buttons + filter sheet; respect font scaling + reduce-motion; VTT tracks alongside renditions. Gesture-only UIs are notoriously inaccessible; BR LBI tightening. |
| **Product analytics + server-side event pipeline** | Track swipe/dwell/like/save/ficha/filter + funnels + retention | High | M | Analytics port + adapters (PostHog/Amplitude); mirror high-value events to a Supabase `events` table (first-party recsys training). Emit from the application layer; no-op test adapter. **Prerequisite for ranking.** |
| **Feature flags + remote config** | Dark-launch, kill bad ranking, gate tiers | Med | S | `feature_flags` table → config-store; `useFlag()`. Pairs with entitlements. |
| **Server-driven A/B experimentation** | Experiments on ranking, paywall, layout, CTA | Med | M | Deterministic bucketing by user-id hash via remote config; exposure events → analytics. Built on flags + analytics. |
| **Push notification infrastructure** | Price drops, new matches, saved-search alerts | High | M | expo-notifications + `push_tokens` table; Edge Functions (cron + triggers) → Expo Push API; web push via service worker. **LGPD: granular, revocable opt-in, no dark patterns.** |
| **Crash + error monitoring + perf tracing** | Catch crashes/slow frames across the low-end Android tail | Med | S | sentry-expo with source maps in EAS; release-health gating; core monitoring wrapper. |
| **LGPD/GDPR compliance (consent, export, deletion)** | Granular consent + self-serve download/delete | Med | M | `user_consents` (versioned); export/delete Edge Functions honoring RLS + Auth + Storage. BR LGPD: 15-day access, immediate deletion, revocable consent. Apple/Google mandate in-app deletion. |
| **Image optimization (AVIF/WebP, signed URLs, blurhash)** | Fast right-sized photos with placeholders | Med | S | Supabase transforms / CDN proxy; generate blurhash at upload; replace the picsum TODO in `media.ts`. |
| **Performance budget + CI gates** | Block regressions in vitals/bundle/types/tests | Med | S | GitHub Actions: Vitest + `tsc --noEmit` + lint + Lighthouse-CI + bundle-size. Makes the existing TDD discipline enforceable. |
| **Native share + deep links + share extensions** | Rich WhatsApp unfurl deep-linking into the ficha | Med | S | expo-router typed deep links + OG meta on web route; optional native Share Extension. Powers push + PWA. |
| **Localized formatting library** | Locale-correct dates/m²/counts without full Intl | Low | S | Extend `format.ts` into a formatters module; pure, Vitest-able. Foundation for i18n + FX. |

---

## LATAM-Specific Opportunities (cross-cutting)

These recur across every lens and are the clearest differentiation vs Zillow/Zonaprop/QuintoAndar:

- **WhatsApp is the social graph + the funnel.** Make it first-class everywhere: rich OG ficha share (★3), WhatsApp alert channel (Theme 9), masked WhatsApp relay (Theme 6), WhatsApp coordination for visits/offers/docs (Theme 7), referral forwarding (Theme 9). Agents already run their whole funnel here — meet users where they are, don't force in-app-only.
- **USD vs ARS/BRL money problem.** Multi-currency + live FX with visible rate source/date (Theme 10) is foundational. AR lists in USD but expensas in ARS; official vs blue/MEP rates; triple-digit inflation. Never silently convert. Capture currency + FX snapshot at offer time. Frame price drops as "este dólar bajó 8%".
- **Garantía / fiador is THE rental blocker.** Three plays: platform-backed guarantee (Big Bet — QuintoAndar moat), caución marketplace referral (monetization), and the social garantía-circle helper (collaboration — loop in the family co-signer). Capture `guarantee_type` up front in lead qualification. Alternative-data affordability + informal-income docs (monotributo/recibos) include the large informal economy.
- **QuintoAndar-style guarantor-free, end-to-end rent.** The connective tissue: reusable renter passport → guarantee → seña/escrow → digital lease → rent collection → on-time history as portable creditworthiness (Theme 7). This converts a swipe into a transaction and a recurring flywheel.
- **Cost transparency LATAM under-serves.** TCO + expensas/condomínio trend + AVM verdict + price history (Theme 2) attack the "cheap rent, brutal expensas" trap and the soft, negotiable, months-stale USD pricing.
- **Barrios are emotional + precise.** Draw-on-map polygons + commute-time + neighborhood/building reviews + barrio waitlists beat US-style radius search. Palermo Soho ≠ Hollywood; Vila Madalena ≠ Pinheiros.
- **Trust on an informal market.** Verified badges (KYC + CRECI/matrícula), clone detection, scam-pattern scoring, pre-payment interstitial, building reviews — scam-proofing is a real differentiator where 40%+ of free-portal listings are fraudulent/misused.
- **Android-dominant, prepaid, patchy coverage.** PWA install from a WhatsApp link, ABR video, Data-Saver mode, offline cache, image optimization — respecting data and the low-end device tail builds retention with price-sensitive users.
- **Two-country, two-language thesis.** Full es-AR + pt-BR in ONE app + real-time ES↔PT translation enables cross-border discovery (Argentines buying in Brazil, expats) — an unclaimed position vs single-locale incumbents.