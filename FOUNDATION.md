# FOUNDATION.md — Reel Estate

> Build-ready architecture foundation reconciling the data model, security, architecture, and scope design outputs into one cohesive document. This is the single source of truth for the MVP build.

---

## Overview

**Reel Estate** is a TikTok/Tinder-style real-estate discovery app: a vertical, full-screen swipe feed of property listings where users like, favorite, and save properties into named folders.

**One codebase, three targets**: Expo (React Native + RN Web) in TypeScript → iOS, Android, Web.

### Two non-negotiable pillars

1. **Security first** — The app must resist a black-box penetration test and the OWASP Top 10 (2021). **Authorization lives 100% in the database via Postgres RLS, NEVER in the client.** The client ships only the `anon` key (public by design); the `service_role` key never touches any client artifact. RLS is the ONLY real authorization boundary — every client-side check is assumed bypassable.
2. **Performance first** — A 60fps vertical feed with aggressive preloading of upcoming items, driven on the UI thread (not React state), keyset-paginated, with denormalized counts so the hottest read path never aggregates.

### Architectural philosophy

Screaming/Hexagonal architecture with strict layer boundaries. Each feature shouts its domain (`feed`, `properties`, `favorites`, `folders`, `auth`, `profile`) and is split into `domain → application → infrastructure → ui`. The domain is pure TypeScript; only the infrastructure layer knows Supabase exists. Atomic Design + Container/Presentational governs the UI so the 60fps render path stays free of side effects.

### Verified stack baseline (mid-2026)

These version facts override any older assumptions and are locked for the build:

- **Expo SDK 56** (RN 0.85, React 19.2, New Architecture/Fabric default) — required by Reanimated 4 and FlashList v2.
- **FlashList v2** — auto-sizes; `estimatedItemSize` / `estimatedListSize` / `estimatedFirstItemOffset` were **REMOVED**. Do NOT pass them. Requires New Arch.
- **NativeWind 4.2.x** (production line) with **Tailwind v3**. NativeWind v5 / Tailwind v4 are pre-release — not for production.
- **Reanimated 4** — requires New Arch + babel `react-native-worklets/plugin` (NOT the old `react-native-reanimated/plugin`).
- **expo-video / expo-audio** — `expo-av` is deprecated.

---

## Data Model & RLS

### Strategy: OWASP A01 enforced in the database

1. **DEFAULT DENY** — RLS `ENABLE` + `FORCE` on every table in any API-exposed schema. No table is reachable without an explicit policy. The `service_role` key (which bypasses RLS) NEVER ships to the client — only the `anon` key — so all client requests are RLS-bound. This is the single most important A01 control.
2. **Identity via `(select auth.uid())`** — Every owner check wraps `auth.uid()` in a subselect so Postgres evaluates it ONCE as a cached initPlan (verified <5ms on indexed columns vs. hundreds of ms when re-invoked per row).
3. **Role + ownership on every policy** — Every policy scopes by BOTH role AND owner: `TO authenticated USING ((select auth.uid()) = user_id)`. The `authenticated` role clause is **mandatory** — `auth.uid() = user_id` alone still lets the `anon` role match when `user_id` is null.
4. **Per-command policies** — Separate `SELECT` / `INSERT` / `UPDATE` / `DELETE` policies (never `FOR ALL`). `UPDATE` carries both `USING` and `WITH CHECK` so a user cannot move a row to another owner.
5. **WITH CHECK on all writes** — Re-asserts ownership on `INSERT`/`UPDATE`; blocks mass-assignment of forged `user_id`/`folder_id`.
6. **UUID PKs everywhere** (`gen_random_uuid()`) — opaque IDs resist enumeration/IDOR. Join/edge tables use natural composite PKs.
7. **Anonymous browse** — `anon` reads the public feed; every write table requires a real authenticated `uid`. Saving requires an account, enforced in the DB, not the UI.

### Tables

#### `profiles` — public-facing user record, 1:1 with `auth.users`
Mirror of auth identity for safe RLS joins (never expose `auth.users` directly). Created via `SECURITY DEFINER handle_new_user()` trigger.

| Column | Type / Constraint |
|---|---|
| `id` | uuid PK REFERENCES `auth.users(id)` ON DELETE CASCADE |
| `username` | citext UNIQUE NULL (length/charset via CHECK) |
| `display_name` | text NULL |
| `avatar_path` | text NULL (storage object path, not a URL) |
| `is_anonymous` | boolean NOT NULL DEFAULT false |
| `created_at` | timestamptz NOT NULL DEFAULT now() |
| `updated_at` | timestamptz NOT NULL DEFAULT now() (trigger) |

**Indexes**: PK on `id`; partial UNIQUE on `username` WHERE `username IS NOT NULL`.
**RLS**: SELECT owner-only `id = (select auth.uid())` (optional public-safe view if usernames must be visible). INSERT blocked from client — only the definer trigger creates rows. UPDATE owner-only WITH CHECK + column guard so `is_anonymous`/`id` cannot change. DELETE blocked (cascades from `auth.users`).

#### `properties` — core listing entity (the swipe feed)
MVP = seeded mock data, publicly browsable including anon. `owner_id` reserved for later owner uploads.

Key columns: `id` uuid PK; `owner_id` uuid NULL → `profiles(id)` ON DELETE SET NULL; `title` text NOT NULL; `description` text; `listing_type` enum NOT NULL; `property_kind` enum NOT NULL; `status` enum NOT NULL DEFAULT 'active'; `price_cents` bigint NOT NULL CHECK ≥ 0; `currency` char(3) DEFAULT 'USD'; `bedrooms` smallint; `bathrooms` numeric(3,1); `area_sqm` numeric(10,2); address fields (`address_line`, `city`, `region`, `country` char(2), `postal_code`); `location` geography(Point,4326); `cover_image_path` text (denormalized first image); `like_count` / `save_count` integer (trigger-maintained); `search_tsv` tsvector GENERATED STORED; `published_at`; `created_at`; `updated_at` (trigger); `deleted_at` (soft-delete tombstone).

**Indexes**: PK; GIST on `location` (KNN); GIN on `search_tsv`; GIN trigram on `city`, `title`; btree `(listing_type, status, price_cents)`; btree/composite for bedroom+price; btree `(status, published_at DESC)`; **PARTIAL index** WHERE `deleted_at IS NULL AND status='active'` on the feed/order index; btree `(owner_id)` WHERE `owner_id IS NOT NULL`.
**RLS**: SELECT PUBLIC incl. anon `USING (deleted_at IS NULL AND status='active')` — visibility is an RLS predicate, not a client WHERE, so a pentester cannot select soft-deleted/hidden rows. No client write policy in MVP (seed/service_role only).

#### `property_images` — ordered gallery per property (1:N)
Stores storage object paths, not URLs. Columns: `id` uuid PK; `property_id` uuid NOT NULL → `properties(id)` ON DELETE CASCADE; `storage_path` text NOT NULL (`{property_id}/{uuid}.webp`); `position` smallint; `width`/`height` (avoid CLS); `blurhash` text; `alt_text` text; `created_at`.
**Indexes**: PK; btree `(property_id, position)`; UNIQUE `(property_id, storage_path)`.
**RLS**: SELECT PUBLIC but only for visible parents via `SECURITY DEFINER is_property_visible(property_id)`. Writes service_role/seed only in MVP.

#### `likes` — user↔property edge (swipe right)
One like per user/property. Columns: `user_id` uuid NOT NULL → `profiles(id)` CASCADE; `property_id` uuid NOT NULL → `properties(id)` CASCADE; `created_at`; **PK `(user_id, property_id)`** (idempotent).
**Indexes**: PK (serves "my likes", user_id leading); btree `(property_id)` for count maintenance.
**RLS**: authenticated-only. SELECT/INSERT/DELETE `user_id = (select auth.uid())`; INSERT WITH CHECK same. No UPDATE.

#### `folders` — user-owned named collections
Columns: `id` uuid PK; `user_id` uuid NOT NULL → `profiles(id)` CASCADE; `name` text NOT NULL CHECK length 1–60; `is_default` boolean (the implicit Favorites folder); `item_count` integer (trigger-maintained); `created_at`; `updated_at` (trigger); `deleted_at` (soft-delete).
**Indexes**: PK; btree `(user_id)`; UNIQUE `(user_id, lower(name))` WHERE `deleted_at IS NULL`; UNIQUE `(user_id)` WHERE `is_default` (one default per user).
**RLS**: authenticated-only. Full per-owner SELECT/INSERT/UPDATE/DELETE `user_id = (select auth.uid())` with WITH CHECK on writes.

#### `folder_items` — JOIN TABLE (property↔folder, the "save" action)
Columns: `folder_id` uuid NOT NULL → `folders(id)` CASCADE; `property_id` uuid NOT NULL → `properties(id)` CASCADE; **`user_id` uuid NOT NULL → `profiles(id)` CASCADE (DENORMALIZED owner for flat RLS, must equal `folders.user_id`)**; `note` text; `created_at`; **PK `(folder_id, property_id)`**.
**Indexes**: PK; btree `(user_id, property_id)` (drives "which of my folders" + distinct save_count logic); btree `(property_id)` for count maintenance.
**RLS**: authenticated-only. Uses denormalized `user_id` to avoid a per-row subquery: `USING (user_id = (select auth.uid()))`. **INSERT WITH CHECK `(user_id = (select auth.uid()) AND (select owns_folder(folder_id)))`** — `owns_folder` is a STABLE SECURITY DEFINER helper that rejects a guessed `folder_id` belonging to another user. **This is the critical IDOR defense on the join table.**

### Enums (native Postgres `CREATE TYPE`)
- `listing_type`: buy | rent
- `property_kind`: house | apartment | studio | land | commercial
- `listing_status`: active | pending | sold | rented | hidden (only `active` is feed-visible)

Stable, low-cardinality sets → true enums (type-safe, indexable, tiny). Adding a value later = `ALTER TYPE ... ADD VALUE` (cannot remove/reorder in a transaction — accepted tradeoff).

### SECURITY DEFINER helpers (STABLE, `SET search_path = ''`)
- `owns_folder(folder_id uuid) → boolean` — used in `folder_items` WITH CHECK (IDOR/A01/A03 defense). Wrapped in `(select ...)` so the planner caches it.
- `is_property_visible(property_id uuid) → boolean` — single source of truth for visibility, reused by `property_images` SELECT and storage policies.
- `handle_new_user()` — trigger on `auth.users` that inserts the `profiles` row (clients have no INSERT policy on profiles).
- `set_updated_at()` — shared BEFORE UPDATE trigger; never trust client timestamps.

Every definer function sets an empty `search_path`, qualifies all objects, and grants `EXECUTE` only to `authenticated` (and `anon` where read-public) — never broad.

### Denormalization (decisions)
- **Counters via trigger** (`properties.like_count`, `properties.save_count`, `folders.item_count`) — maintained by AFTER INSERT/DELETE triggers, transactional, run with table-owner rights. The feed renders counts on every card at 60fps; an O(1) integer read beats a `COUNT(*)` per card. `save_count` is distinct-property-per-user (trigger checks first/last `folder_item` for that property using the `(user_id, property_id)` index). Tradeoff: write amplification + hot-row contention on viral properties — mitigate later via sharded counters or rollup; not needed for MVP. Drift mitigated by a nightly `pg_cron` reconciliation job; counts are UI-only, never used for access control.
- **`properties.cover_image_path`** — first image path so the feed card needs zero join. Synced by trigger on `property_images` (position=0) or at seed.
- **`folder_items.user_id`** — flat RLS column compare instead of a subquery into folders. Integrity guaranteed by `owns_folder()` WITH CHECK.
- **`properties.search_tsv`** — GENERATED STORED, maintained by Postgres.

### Soft vs hard delete
- `properties`: **SOFT** (`deleted_at`) — RLS hides them; real purge via `pg_cron`. Likes/saves point at them.
- `folders`: **SOFT** by default (recoverable; name frees immediately via partial-unique WHERE `deleted_at IS NULL`). Hard DELETE acceptable for MVP if product accepts irreversible deletes — **flag to product** (see Milestones).
- `likes`, `folder_items`: **HARD** (they ARE the edge; composite PKs make re-creation idempotent).
- `profiles`: no app delete; flows from `auth.users` CASCADE (GDPR account-delete path).

### Extensions (enable in `extensions` schema, not `public`)
`postgis`, `pg_trgm`, `citext`, `pgcrypto`/`gen_random_uuid`, `pg_cron`.

### Feed query shape (perf-critical)
```
SELECT ... FROM properties
WHERE status='active' AND deleted_at IS NULL  [+ filters]
ORDER BY location <-> :point   -- when geo-sorted
   -- or  published_at DESC
-- keyset pagination, NEVER OFFSET:
AND (published_at, id) < (:last_at, :last_id)
```
Counts and `cover_image_path` read inline (no joins). Signed image URLs batch-generated for the preload window. **Index every column referenced by an RLS policy** — missing RLS indexes are the #1 perf killer (and tempt devs to weaken policies).

### Storage policies (`property-images` bucket)
- **PRIVATE bucket** (never public) so access is mediated/revocable.
- Bucket constraints: `file_size_limit = 5 MB`; `allowed_mime_types = ['image/webp','image/avif','image/jpeg','image/png']` — server-side content-type/size guard (A04/A08, don't trust client `contentType`).
- Path convention `{property_id}/{image_uuid}.webp` so policies key off the first path segment.
- **Read = signed URLs**, TTL 3600s. Batch-generate (`createSignedUrls`) for preloaded items to keep 60fps. SELECT policy on `storage.objects`: `USING (bucket_id='property-images' AND is_property_visible((split_part(name,'/',1))::uuid))` — reuses the same visibility rule, so hidden listings' images can't be signed.
- **Write = service_role/seed only** in MVP (no client INSERT/UPDATE/DELETE). Later owner uploads guarded by `owns_property((split_part(name,'/',1))::uuid)`.
- **Avatars**: separate private `avatars` bucket, 2 MB, same mime allow-list, RLS keyed on path prefix = `(select auth.uid())::text`. **Strip EXIF/GPS on upload.**
- **Later (S3/CloudFront)**: private S3 + Origin Access Control + signed URLs/cookies. Path convention and visibility rule carry over — keep image URLs CDN-swappable so the migration is not a rewrite.

---

## Security (OWASP mapping + pentest checklist)

> **The governing principle:** the `anon` key is PUBLIC by design, so RLS is the ONLY real authorization boundary. Every table in an exposed schema must have RLS enabled, forced, default-deny, scoped by BOTH the `authenticated` role AND ownership, with `WITH CHECK` on writes. The `service_role` key must never touch any client artifact (bundle, EAS Update, RN code). Treat the client as fully untrusted.

### OWASP Top 10 (2021) mapping

| ID | Risk | Controls | Where |
|---|---|---|---|
| **A01** Broken Access Control (PRIMARY) | Authorization fully delegated to Supabase; PostgREST auto-exposes every table; IDOR on folders/saves | RLS ENABLED + FORCED on every table; default-deny; policy scopes by role AND owner (`TO authenticated`); per-command policies; UPDATE has USING + WITH CHECK; `owns_folder()` IDOR guard on the junction; UUID PKs; never trust client `user_id` (set via DEFAULT/trigger + WITH CHECK); revoke table grants for roles that shouldn't touch them | Postgres RLS + GRANT/REVOKE. Client never enforces authz. |
| **A02** Cryptographic Failures | Session tokens cached in AsyncStorage (plaintext); web has no secure storage | TLS 1.2+ end-to-end + HSTS; tokens in `expo-secure-store` (Keychain/Keystore) NEVER AsyncStorage; bcrypt via GoTrue; Supabase Vault for sensitive PII; no secrets in logs/errors/analytics | SecureStore (device), TLS at Supabase + CDN, Vault |
| **A03** Injection | SQLi via SECURITY DEFINER RPCs that concat strings / mutable search_path; XSS via listing description on RN Web | PostgREST/supabase-js parametrize all queries; RPCs use `format(%I,%L)` + `SET search_path=''`; zod validation at EVERY boundary (forms, deep-link params, RPC args, filters); prefer typed `.eq()/.gte()` over raw `.filter()/.or()`; no `dangerouslySetInnerHTML`, sanitize rendered HTML; no `eval`/dynamic require | RPC parametrization, client zod, PostgREST builder |
| **A04** Insecure Design | Treating "saving requires account" as a UI gate only | Threat-model swipe/save flows — enforce in RLS not UI; rate-limit abusable actions at DB/edge; ownership invariants as FK + RLS constraints; fail closed everywhere; design signed-URL media path day one; pagination caps + per-IP throttles vs scraping | Architecture/RLS + constraints + edge design |
| **A05** Security Misconfiguration | Table created without RLS; public bucket; wildcard redirects; exposed source maps | Confirm RLS ON for every table (treat Advisor warnings as blockers); only intended objects in `public`, helpers in a private schema not exposed by PostgREST; storage buckets PRIVATE; explicit Site URL + redirect allow-list (no wildcards); prod disables debug/source maps; CORS allow-list to real origin; run Supabase production checklist + Security Advisor pre-launch | Supabase dashboard, schema exposure, web host, EAS config |
| **A06** Vulnerable & Outdated Components | Large RN dep tree; vulnerable transitive dep; out-of-support Expo SDK | Commit lockfile, CI `--frozen-lockfile`/`npm ci`; `npm audit` + Dependabot/Renovate, fail on high/critical; pin Expo SDK 56 + native modules; minimize transitive deps; watch Supabase/GoTrue/PostgREST advisories | package.json/lockfile, CI SCA, EAS pinning |
| **A07** Identification & Auth Failures | Credential stuffing/brute force; refresh-token theft; user enumeration | Supabase Auth (GoTrue), never hand-rolled; email verification before privileged actions; password min length ≥10 + HIBP leaked-password check; optional TOTP MFA; short access-token TTL (~1h) + rotating refresh tokens with reuse detection; SecureStore session; sign-out clears tokens; OAuth PKCE + strict redirect allow-list + state validation; CAPTCHA on signup/signin/reset; generic auth errors | Supabase Auth config + SecureStore adapter + PKCE |
| **A08** Software & Data Integrity Failures | OTA update channel is a supply-chain delivery vector | EAS Update code signing + pinned channel; lockfile integrity hashes; build from CI not laptops, protect EAS credentials; validate cached/remote config with zod; vet postinstall scripts; SRI on external web scripts | EAS Update, CI pipeline, lockfile, web SRI |
| **A09** Logging & Monitoring Failures | Black-box probing goes unnoticed; tokens logged in edge functions | Enable Supabase Auth + Postgres logs → log sink with retention; alert on 429 spikes, failed logins, signup bursts, RLS-denied spikes; structured edge logs WITHOUT secrets/PII; Sentry scrubbed of PII/tokens; monitor Storage egress + DB CPU; audit trail for sensitive mutations; incident runbook + key-rotation procedure | Log drains, Sentry, audit triggers, dashboard alerts |
| **A10** SSRF (low surface today, designed-in now) | Future image-import/geocoding edge functions fetch user URLs | Strict outbound host allow-list; reject internal/metadata IPs (169.254.169.254, 10.0.0.0/8, 127.0.0.1, ::1, link-local); zod-validate+normalize URLs before fetch; disable/re-validate redirects; no user-controlled host in server fetches; signed URLs from fixed bucket refs only; map/geocoding to fixed endpoints | Edge Functions / RPC outbound fetch |

### Auth design
Supabase Auth (GoTrue) as the single identity provider. Email/password + OAuth (Google/Apple) via **PKCE** (`flowType:'pkce'`). Anonymous browse allowed (no session or Supabase anonymous sign-in with `is_anonymous=true`); **all writes require an authenticated session, enforced in RLS via `TO authenticated`, not the UI.** Short access-token TTL (~1h) + rotating refresh tokens with reuse detection (verify enabled). Email confirmation required before privileged actions. Password ≥10 + HIBP. Optional TOTP MFA. CAPTCHA on signup/signin/reset. Strict redirect allow-list (no wildcards). Generic auth errors. Sign-out and refresh-failure clear SecureStore and force re-auth.

### Token storage
- **Native**: custom storage adapter → `expo-secure-store` (iOS Keychain, Android Keystore). NEVER AsyncStorage for tokens. `createClient` with `auth.storage` adapter, `autoRefreshToken:true`, `persistSession:true`, `detectSessionInUrl:false`. Mind SecureStore's ~2KB limit (chunk or store only the refresh token if exceeded).
- **Web** (the weak link — no SecureStore): prefer SSR auth with httpOnly + Secure + SameSite cookies so the bundle never holds the refresh token; if pure-client SPA, accept localStorage but shorten TTL and lean on RLS.

### Secrets management
Two keys, two trust levels. **`anon` key**: safe in the bundle because RLS is the real boundary — RLS must assume it is public. **`service_role` key**: bypasses RLS — MUST NEVER reach the client, bundle, EAS Update payload, or RN code. Lives only in Edge Functions (Function secret) / trusted backend / CI for seeding. Only `EXPO_PUBLIC_*` vars are bundled and must contain nothing sensitive (URL + anon key only). Rotate keys if leaked. CI scans repo + bundle for secrets (gitleaks/trufflehog).

### Rate limiting (layered)
1. **Supabase Auth** — built-in per-IP token bucket (default cap 30, 429). Tune DOWN for prod; pair with CAPTCHA.
2. **Data/PostgREST** — Supabase does NOT rate-limit the Data API. Front with Cloudflare/WAF for per-IP throttling + bot rules; use Edge Functions for per-user limits.
3. **Application** — cap like-spam, folder-creation rate, feed page size via RPC checks/triggers.
4. **Storage** — limit signed-URL issuance frequency. Always fail closed with 429 + alert on spikes.

### Web security headers / CSP
HSTS `max-age=63072000; includeSubDomains; preload`. CSP: `default-src 'self'; connect-src 'self' https://<project>.supabase.co https://*.supabase.co wss://<project>.supabase.co <captcha+map+sentry>; img-src 'self' data: https://<cdn/storage>; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; frame-src <captcha>; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'`. Plus `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` locked to map needs, `Cross-Origin-Opener-Policy: same-origin`. Strict CORS allow-list. NativeWind/RN-Web needs `'unsafe-inline'` for styles — prefer nonce/hash if the toolchain supports it; NEVER weaken `script-src`.

### Black-box pentest checklist (run in M7, smoke-test cross-user negative case from M1)
- **RLS bypass / IDOR**: with only the anon key, hit PostgREST directly (`curl https://<project>.supabase.co/rest/v1/<table>?apikey=<anon>`) for every table — saves, folders, likes, profiles — and attempt SELECT/INSERT/UPDATE/DELETE on another user's rows. Expect 401/403/empty.
- **Anonymous write bypass**: hit saves/folders/likes as anon (no JWT) — confirm "saving requires account" is RLS-enforced.
- **UPDATE ownership escape**: as user A, UPDATE your save/folder trying to set `user_id` to user B — WITH CHECK must block.
- **Enumerate hidden tables/schemas**: probe PostgREST for migrations/audit/internal helper tables — confirm not exposed.
- **RPC abuse**: enumerate `/rest/v1/rpc/<fn>`; fuzz typed-bad/malicious args; test SECURITY DEFINER fns for SQLi and search_path hijack.
- **JWT tampering**: `alg:none`, signature strip, role/sub modification, expired-token replay — all rejected.
- **Refresh-token theft & rotation**: use a captured refresh token twice — reuse detection revokes the session.
- **Auth brute force / rate limit**: script repeated sign-ins/signups — confirm 429 + CAPTCHA; check reset/OTP flooding limits.
- **User enumeration**: compare responses/timing for existing vs non-existing emails on signup/login/reset — confirm generic.
- **Email verification bypass**: privileged actions with unconfirmed account; forgeable confirm tokens.
- **OAuth/redirect abuse**: tamper redirect/state, attempt open-redirect — strict allow-list blocks.
- **Token storage on device**: rooted/jailbroken or simulator inspection + OS backup grep for JWT — must be in Keychain/Keystore, not AsyncStorage.
- **Secret exposure in bundle**: download published JS bundle + EAS Update payload, grep for `service_role`, JWT secret, private/AWS keys — only `EXPO_PUBLIC_` anon URL/key present.
- **Storage attacks**: list private buckets, guess object paths, replay expired signed URLs, upload oversized/non-image content, path-traversal into another prefix.
- **Injection**: fuzz feed filters (price, bedrooms, location) and zod boundaries with SQLi payloads; XSS via listing description/profile fields on web.
- **SSRF**: if any edge fn/RPC fetches a URL, feed internal IPs + redirect chains — allow-list blocks.
- **Web headers**: scan for HSTS/CSP/nosniff/frame-ancestors/Referrer-Policy; attempt clickjacking + inline-script injection.
- **CORS**: cross-origin from a rogue origin — allow-list rejects, no wildcard ACAO with credentials.
- **Deep-link/mobile**: fuzz custom-scheme + universal links with malicious params/unverified hosts — confirm zod validation + associated-domains/autoVerify.
- **Mass-assignment**: include `is_admin`/`role`/`user_id` on INSERT/UPDATE — API/RLS rejects client-set privileged fields.
- **Pagination/scraping**: oversized page sizes + rapid-fire feed — pagination caps + per-IP throttle/WAF.
- **Logging leakage**: trigger errors, inspect responses + edge logs for stack traces/tokens/PII — confirm generic bodies.
- **Cert pinning (optional)**: MITM with proxy + custom CA — if pinning implemented, confirm it blocks.

---

## Architecture & Folder Structure

### Layers (Hexagonal, enforced by tsconfig paths + `eslint-plugin-boundaries`)

| Layer | Path | Contents | May import |
|---|---|---|---|
| **DOMAIN** | `src/features/*/domain` | Pure TS: entities, value objects, **PORTS** (repository interfaces). ZERO React/RN/Supabase/Query imports. | nothing outward |
| **APPLICATION** | `src/features/*/application` | Use-cases orchestrating ports via DI. Framework-free. Business rules spanning entities. | domain only |
| **INFRASTRUCTURE** | `src/features/*/infrastructure` + `src/core` | ADAPTERS implementing ports via the Supabase client. The ONLY layer that knows Supabase exists. Swappable. | domain + core |
| **UI** | `src/features/*/ui` + `src/shared/ui` + `app/` | React/RN + NativeWind. Container/Presentational split. | application + domain types + shared/ui + core |

**Strict import rule**: NOTHING imports `infrastructure` except `core/di`. The single chokepoint importing `@supabase/supabase-js` is `core/supabase/client.ts` (anon key only). **Authorization is enforced by RLS in `supabase/migrations`, never in any TS layer** — repositories assume the DB rejects unauthorized rows; the client is fully untrusted.

### Ports & Adapters
Each feature declares a repository interface in `domain/ports` (e.g. `FeedRepository.getPage(cursor, pageSize): Promise<Page<FeedItem>>`). The concrete `SupabaseFeedRepository` in `infrastructure` implements it. Use-cases depend on the INTERFACE, never the class. Wiring happens in `core/di/container.ts` (composition root) — instantiates adapters once; UI containers resolve use-cases from there. Benefits: domain + application unit-testable with in-memory fakes (no network); the future S3/CloudFront migration touches only infrastructure + storage helper; Storybook/previews inject fakes.

### State management (two separated concerns)
- **SERVER STATE = TanStack Query v5** — everything from Supabase: feed (`useInfiniteQuery` + keyset cursor), property detail, favorites, folders. Query keys in `core/query/keys.ts` (typed factory). Mutations (like, save, folder CRUD) use optimistic `onMutate`/`onError` rollback then invalidate. `core/query/onlineManager.ts` bridges `expo-network` for refetch-on-reconnect + AppState focus refetch. **NEVER duplicate server data into Zustand.**
- **CLIENT/UI STATE = Zustand v5** — `feedUiStore` (active index, mute, autoplay), `filtersStore` (persisted), `sessionStore` (sync session snapshot for route guards). Zustand over Jotai because client state is mostly global/interconnected (active index drives preload, filters drive the feed query key). **Jotai RESERVED** only if a form (filters/rename) proves to re-render too widely — introduce then, not in the MVP baseline.

### Component strategy (Atomic Design + Container/Presentational)
- **ATOMS** = `shared/ui/primitives` (React Native Reusables output: button, text, input, card, sheet, dialog, skeleton, toast, slider, switch — owned/copy-pasted via the RNR CLI, themed with NativeWind tokens).
- **MOLECULES** = `FeedActionsBar`, `FeedCardMedia`, `OAuthButtons`, `SaveToFolderSheet`.
- **ORGANISMS** = `FeedCard`, `FeedList`, `PhotoGallery`, `FoldersList`.
- **TEMPLATES/PAGES** = `app/*` route files (routing glue only).
- **RULE**: every feature UI splits into `containers/` (smart: Query hooks + use-cases via DI + Zustand selectors + viewability/gesture wiring → plain props) and `components/` (dumb: `React.memo`, props-in→JSX-out, no fetching, no store access). Keep components SMALL and single-responsibility. `cn()` (clsx + tailwind-merge) for conditional classes.

### Navigation
Expo Router (file-based). Route GROUPS encode the security model: `(public)` allows anonymous feed + detail browse; `(auth)` is unauthenticated-only; `(protected)` wraps tabs (Feed · Favorites · Profile) + folders, with `_layout.tsx` redirecting to `/sign-in` when there's no session (read **synchronously from `sessionStore`** so the guard doesn't flash). `app/` files are THIN — each mounts the matching feature container. Deep links via custom scheme in `app.config.ts` (OAuth + shareable `property/[id]`). Web gets real, SEO-friendly URLs. Full-screen feed uses a headerless stack.

### Folder tree
```
reel-estate/
├── app/                                  # Expo Router — ROUTING ONLY
│   ├── _layout.tsx                       # Root providers (QueryClient, GestureHandlerRootView, SafeArea, theme, auth gate)
│   ├── (public)/                         # Anonymous-allowed
│   │   ├── _layout.tsx
│   │   ├── index.tsx                     # → <FeedScreen/>
│   │   └── property/[id].tsx             # → <PropertyDetailScreen/>
│   ├── (auth)/                           # Unauthenticated-only
│   │   ├── _layout.tsx
│   │   ├── sign-in.tsx
│   │   ├── sign-up.tsx
│   │   └── callback.tsx                  # OAuth redirect handler
│   └── (protected)/                      # Requires session
│       ├── _layout.tsx                   # Guard: !session → <Redirect href="/sign-in"/>
│       ├── (tabs)/
│       │   ├── _layout.tsx               # Tabs: Feed · Favorites · Profile
│       │   ├── favorites.tsx             # → <FavoritesScreen/>
│       │   └── profile.tsx               # → <ProfileScreen/>
│       └── folders/
│           ├── index.tsx                 # → <FoldersListScreen/>
│           └── [folderId].tsx            # → <FolderDetailScreen/>
│
├── src/
│   ├── features/                         # SCREAMING ARCHITECTURE
│   │   ├── feed/
│   │   │   ├── domain/                    # entities/FeedItem.ts, ports/FeedRepository.ts, services/feedRanking.ts
│   │   │   ├── application/use-cases/     # getFeedPage.ts(cursor) → Page<FeedItem>
│   │   │   ├── infrastructure/            # SupabaseFeedRepository.ts (keyset cursor)
│   │   │   └── ui/
│   │   │       ├── containers/            # FeedScreen.tsx, useFeedQuery.ts (useInfiniteQuery + preload)
│   │   │       ├── components/            # FeedList, FeedCard (memo), FeedCardMedia, FeedActionsBar
│   │   │       └── hooks/                 # useViewabilityPreload.ts, useFeedGestures.ts (Reanimated worklets)
│   │   ├── properties/                    # domain/application/infrastructure/ui — PropertyDetail, PhotoGallery, SpecsTable, LocationMap
│   │   ├── favorites/                     # Like/Favorite entities, toggleLike/listFavorites, optimistic LikeButton
│   │   ├── folders/                       # Folder entity, create/rename/delete/saveToFolders, FoldersList, SaveToFolderSheet
│   │   ├── auth/                          # Session/AuthUser, signIn(Email|OAuth)/signOut/refresh, AuthGate, OAuthButtons
│   │   └── profile/                       # getProfileSummary, ProfileScreen, MyLikesPreview, MyFoldersPreview
│   │
│   ├── shared/
│   │   └── ui/                            # RN Reusables ATOMS (owned, themed)
│   │       ├── primitives/               # button, text, input, card, sheet, avatar, dialog, skeleton, toast, switch, slider
│   │       ├── icons/                    # lucide-react-native wrappers
│   │       ├── theme/                    # tokens.ts, useColorScheme.ts, NAV_THEME
│   │       └── lib/                      # cn.ts (clsx + tailwind-merge), platform.ts
│   │
│   └── core/                             # CROSS-CUTTING infra (no feature domain knowledge)
│       ├── supabase/                     # client.ts (anon key ONLY — sole supabase-js import), database.types.ts, storage.ts
│       ├── query/                        # queryClient.ts, onlineManager.ts, keys.ts
│       ├── store/                        # feedUiStore.ts, filtersStore.ts (persisted), sessionStore.ts
│       ├── config/                       # env.ts (zod-validated), constants.ts
│       ├── errors/                       # AppError, Result<T,E>, toUserMessage.ts
│       ├── i18n/                         # (reserved) ES/EN
│       └── di/                           # container.ts — composition root wiring adapters → ports
│
├── supabase/                             # BACKEND as code (committed)
│   ├── migrations/                       # tables, indexes, RLS POLICIES (authorization lives HERE)
│   ├── seed.sql                          # realistic MOCK properties
│   └── config.toml
│
├── __tests__/ or *.test.ts colocated     # domain/application unit tests (pure, fast)
├── tailwind.config.js                    # NativeWind v4 preset (Tailwind v3)
├── global.css
├── metro.config.js                       # withNativeWind
├── babel.config.js                       # nativewind/babel + react-native-worklets/plugin (Reanimated 4)
├── app.config.ts                         # plugins, scheme for OAuth deep links
├── tsconfig.json                         # paths: @feature/*, @shared/*, @core/* (enforces layer imports)
└── package.json
```

---

## Feed Performance

> Target: 60fps vertical TikTok-style feed. The hottest read path never aggregates (denormalized counts), pagination is keyset (never OFFSET), and visible-index/play-pause is driven on the UI thread — NOT React state.

1. **List — `@shopify/flash-list` v2.** Auto-sizes; do NOT pass `estimatedItemSize`/`estimatedListSize`/`estimatedFirstItemOffset` (REMOVED in v2 — any tutorial citing them is stale). Config: `pagingEnabled` + `snapToInterval` = screen height (full-screen-snap), one item per viewport, `drawDistance` tuned to prefetch ~1.5 viewports, `horizontal={false}`, STABLE `keyExtractor` → `property.id`. Requires New Arch (default in SDK 56). Recycling is automatic — keep each `FeedCard` render cheap.

2. **Visible index on the UI thread (top risk mitigation).** FlashList v2 on New Arch has documented JS-thread stutters that bleed into the UI thread during fast scroll. **Drive visible-index and play/pause via `useAnimatedReaction` on the UI thread, NOT React state.** `onViewableItemsChanged` + `viewabilityConfig` (`itemVisiblePercentThreshold ~80`, `minimumViewTime`) feeds `useViewabilityPreload`. Profile on a low-end Android device EARLY in M3, not at the end.

3. **Preload.** When item `i` becomes active, warm the NEXT N=2–3 items: `expo-image` `prefetch()` for upcoming cover images; if videos, preload only `i+1` while playing only `i`. Pair with `useInfiniteQuery` — when the active index nears the end of the loaded page, `fetchNextPage()` against the keyset cursor so new data lands before the user arrives. Batch-generate signed image URLs for the preload window.

4. **Images — `expo-image`.** `priority='high'` for the active card / `'low'` for preloaded; `contentFit='cover'`; blurhash/thumbhash placeholder stored per property (card never shows blank); `cachePolicy='memory-disk'`; `recyclingKey=property.id` so recycled cells swap cleanly.

5. **Video (optional) — `expo-video`** (NOT deprecated `expo-av`). One `VideoPlayer` bound to the active index; play on viewable, pause+mute off-screen; preload next source.

6. **Re-render discipline.** `FeedCard` + `FeedCardMedia` are `React.memo`; all callbacks (`onLike`, `onSave`, `onViewable`) are `useCallback` with stable refs; NO inline closures/objects/styles in render; NativeWind `className` strings are static; heavy derivations use `useMemo`. Read `activeIndex` via a **Zustand selector** so only the card changing active/inactive re-renders, not the whole list.

7. **Gestures/animation.** `react-native-gesture-handler` + Reanimated 4 worklets run swipe/like animations on the UI thread — requires babel `react-native-worklets/plugin`.

8. **Pagination — keyset/cursor.** `ORDER BY (ranking_or_created_at, id)` with a `(created_at, id)` composite index AND an index on **every column referenced by RLS policies** (missing RLS indexes are the #1 perf killer). The repository encodes the cursor as the last row's `(sort_value, id)` tuple and resumes with a `(col, col, id) > tuple` comparison — O(1) page fetches at any depth. **NEVER limit/offset** (it scans all prior rows under RLS).

---

## Dependencies

| Package | Version | Purpose |
|---|---|---|
| `expo` | **SDK 56** | App framework + build for iOS/Android/Web. Bundles RN 0.85, React 19.2, New Arch default (required by Reanimated 4 + FlashList v2). |
| `expo-router` | (SDK 56) | File-based navigation, auth route groups, OAuth + shareable deep links, real Web URLs. |
| `typescript` | latest | End-to-end types; enables layer-boundary import rules via tsconfig paths. |
| `nativewind` | **4.2.x** | Tailwind for RN/Web. v4.2 is the production line; v5 is pre-release. Needs `nativewind/babel` + `withNativeWind`. |
| `tailwindcss` | **v3** (NativeWind 4.2-compatible) | Utility engine NativeWind compiles. Do NOT jump to Tailwind v4 until NativeWind v5 is stable. |
| `@react-native-reusables/cli` + primitives | latest | shadcn-for-RN: copy-paste OWNED UI atoms into `shared/ui/primitives`. No runtime lock-in. |
| `react-native-reanimated` | **v4** | UI-thread swipe/like animations. Requires New Arch + babel `react-native-worklets/plugin` (NOT the old plugin name). |
| `react-native-worklets` | latest | Worklet runtime + Babel plugin Reanimated 4 depends on. |
| `react-native-gesture-handler` | (Expo-supported) | Native gestures (vertical swipe, tap-to-like) feeding Reanimated worklets. |
| `@shopify/flash-list` | **v2** | Recycling feed list. AUTO-SIZES (no estimates). Requires New Arch. `pagingEnabled` + full-screen snap + stable keys + `drawDistance`. |
| `expo-image` | (SDK 56) | Fast images: priority, memory-disk cache, blurhash/thumbhash, `recyclingKey`, imperative `prefetch()`. |
| `expo-video` | (SDK 56) | Optional video cards; replaces DEPRECATED `expo-av`. |
| `@supabase/supabase-js` | **v2** | Postgres + Auth + Storage + Realtime. Imported in EXACTLY ONE file (`core/supabase/client.ts`) with the ANON key only. Authz via RLS. |
| `@tanstack/react-query` | **v5** | Server-state cache: `useInfiniteQuery` keyset pagination, optimistic mutations, dedup, background refetch. |
| `@tanstack/react-query-persist-client` | optional | Persist query cache (offline-first feel for seen cards/favorites). |
| `zustand` | **v5** | Client/UI state (~3KB): active index, mute/autoplay, persisted filters, sync session snapshot. Selectors avoid re-render storms. |
| `jotai` | RESERVED | Only if a form re-renders too widely; not in MVP baseline. |
| `zod` | v3/v4 | Runtime validation: env config, filter inputs, narrowing Supabase responses at the infrastructure boundary. Defense-in-depth. |
| `expo-network` | (SDK 56) | Bridges TanStack Query `onlineManager` for refetch-on-reconnect. |
| `expo-secure-store` | (SDK 56) | **Token storage on native** (Keychain/Keystore). The session storage adapter for `createClient`. NEVER AsyncStorage for tokens. |
| `@react-native-async-storage/async-storage` *or* `react-native-mmkv` | latest | Persistence for **Zustand persisted slices only** (NOT tokens). MMKV if you want sync/faster reads. |
| `expo-auth-session` / `expo-web-browser` | (SDK 56) | OAuth redirect flow (PKCE) with the app's custom scheme. |
| `react-native-maps` *or* `expo-maps` | latest | Property location map in detail. Pick one cross-platform approach up front; single marker only. |
| `lucide-react-native` | latest | Icon set used by RN Reusables primitives. |
| `clsx` + `tailwind-merge` | latest | The `cn()` helper for conditional/merged NativeWind classes. |
| `react-native-safe-area-context` + `react-native-screens` | (Expo deps) | Safe-area insets (edge-to-edge feed) + native screen optimization. |
| `eslint-plugin-boundaries` | dev | Statically enforces hexagonal import rules. |
| `supabase` CLI | dev | Migrations, RLS as code, `seed.sql`, `supabase gen types typescript` → `database.types.ts`. |

> **Reconciliation note:** the security plan specifies `expo-secure-store` for the Supabase session token (Keychain/Keystore). AsyncStorage/MMKV is used **only** for Zustand persisted slices and never for auth tokens — these two roles do not conflict.

---

## MVP Scope & Milestones

### In scope
- **Auth**: email/password + OAuth (Google/Apple) via Supabase Auth. Anonymous browse read-only; any save/like/folder action requires an authenticated account (contextual sign-in prompt).
- **Vertical full-screen swipe feed** (FlashList v2, one property/viewport) over seeded MOCK properties, with aggressive preload of the next N items.
- **Like / unlike** (per-user, server-authoritative via RLS).
- **Favorites + Folders**: create, rename, delete; save/unsave into one or more folders (M:N junction).
- **Property detail**: photo gallery, price, specs (beds/baths/area/type), location on a map.
- **Basic filters**: buy vs rent, price range, location, bedrooms — applied server-side.
- **Profile**: my likes + my folders (with counts).
- **Security baseline**: all authz in Postgres via RLS (anon key only; service_role never shipped); per-operation policies; indexed policy columns; input validation; secure session/token handling.
- **Seed pipeline**: realistic mock properties + images into Supabase (Storage + rows) for a demoable feed.

### Out of scope (later)
Real-listings/MLS integration · chat/messaging · agent/owner uploads & creator flows · ML/personalized ranking · video listings & transcoding (MediaConvert) · push notifications · social graph (follows/sharing/public profiles) · AWS S3 + CloudFront media offload (MVP serves from Supabase Storage) · map clustering/draw-search/commute-time · multi-currency, i18n, offline-first sync · saved-search alerts & email digests.

### Thinnest slice (proves the core loop end-to-end)
A signed-in user opens a vertical full-screen feed of seeded mock properties (next image preloaded), swipes, taps **Like**, and taps **Save** to add a property into one folder (auto-created 'Favorites' if none). Likes and folder-saves persist to Supabase, RLS-enforced so a user reads/writes only their own rows. Proves **feed → like → save to folder** with security and the feed-performance pattern already in place. No filters, no detail map, no OAuth, no rename/delete yet — those layer on.

### Milestones (each demoable)

**M0 — Foundation & screaming structure.** Bootable Expo app on all three targets with the locked stack wired; hexagonal/screaming folder layout; NativeWind + RN Reusables theme; Supabase client (anon key only) per platform.
- Expo Router shell on iOS/Android/Web; NativeWind + RNR base components (Button, Card, Sheet) copied and themed; Reanimated + gesture-handler smoke test; `src/features/<feature>/{domain,application,infrastructure,ui}` + `shared/` + `core/`; Supabase client factory with `EXPO_PUBLIC` anon key; env handling that keeps service_role out of the bundle; CI lint/typecheck/format gate.

**M1 — Data model, RLS & seed.** Postgres schema with airtight RLS and a reproducible mock-data seed. Security built in from the first table.
- Tables: profiles, properties (public-readable), property_images, likes, folders, folder_items (junction, cascading FKs); RLS enabled + forced on every table; per-operation policies (no `FOR ALL`); user-owned rows scoped by `(select auth.uid())`; indexes on all RLS-referenced columns (`user_id`, `folder_id`, `property_id`); junction queries use `IN (select ...)` to avoid correlated subqueries; SECURITY DEFINER helpers (`owns_folder`, `is_property_visible`, `handle_new_user`, `set_updated_at`); enums + extensions; seed script (mock properties + images into Storage + rows); migrations checked into repo; **explicit cross-user negative test (second token tries to read/write another user's rows)**; documented threat-model notes per table.
- **Product decision flagged**: folders soft-delete vs hard-delete — confirm with product before finalizing.

**M2 — Auth & session.** Email/password + OAuth with anonymous read-only browse and a clean gate that pushes auth only on a write attempt.
- Email/password sign-up + sign-in; OAuth Google + Apple (web fallback); anonymous browse session (read-only) with deferred sign-in prompt on first write; **token persistence via `expo-secure-store` adapter** + refresh; logout clears local state; profile row auto-provisioned via `handle_new_user()` trigger; auth state exposed via a single application-layer hook. **Decide early** whether to migrate anonymous-session likes into the account on sign-up.

**M3 — Performant vertical feed (THINNEST SLICE core).** 60fps full-screen feed with next-item preload, plus like and save-to-folder through RLS.
- FlashList v2 full-screen paged feed (no size estimates); **visible-index + play/pause driven by `useAnimatedReaction` on the UI thread, NOT React state**; `expo-image` prefetch of next N; like/unlike via RLS-protected optimistic mutation; save into a folder (auto-create default 'Favorites') — `folder_items` insert under RLS; empty/error/loading states. **Profile on a low-end Android device in this milestone.**

**M4 — Property detail.** Tap a feed item into a full detail view.
- Swipeable photo gallery (`expo-image`); price, specs, description; location on a map (single marker, **pick one cross-platform map approach up front** — iOS/Android/Web differ); smooth feed→detail transition; like + save from detail sharing the SAME application use-cases as the feed.

**M5 — Folders management & profile.** Full folder lifecycle + profile surfaces.
- Create/rename/delete folders (RLS-scoped; delete cascades `folder_items`); add/remove a property to/from multiple folders via the save sheet; profile: my likes + my folders with counts; folder detail grid/list; empty states + confirm-destructive delete flows.

**M6 — Filters.** Server-side feed filtering.
- Filter sheet (buy/rent toggle, price range, location, bedrooms); filters applied server-side (parameterized, RLS-safe); filter state persisted for the session and reflected in the feed query key; reset/clear; result-count feedback + empty-result state.

**M7 — Security hardening & demo polish.** Adversarial pass to resist a black-box pentest + OWASP Top 10.
- RLS bypass attempts via direct PostgREST with a second token (A01); confirm service_role absent from all client bundles + secrets audit (A02/A05); input validation + parameterized queries everywhere + SSRF/injection review (A03/A10); rate limiting / abuse controls on auth + write endpoints, brute-force lockout (A07); dependency/SCA scan + pinned versions (A06); security headers on web; logging/monitoring of auth failures without PII leakage (A09); run and sign off the full pentest checklist above.

### Tracked risks (mitigations baked into milestones)
- **Feed performance (top technical risk)** — UI-thread visible-index, prefetch, tiny memoized items, profile low-end Android EARLY (M3).
- **RLS correctness = the entire security model** — per-operation policies, RLS on every table incl. junction, indexed policy columns, cross-user negative test in M1, re-run in M7.
- **service_role / secret leakage to client** — only `EXPO_PUBLIC_` anon vars in the bundle, CI bundle grep/secret-scan, no admin SDK in the app package at all.
- **M:N query performance** — `IN (select ...)` + composite indexes from M1; denormalized `folder_items.user_id` for flat RLS.
- **Auth-gating UX** — gate only on write, prompt contextually, decide early on anonymous→account like migration.
- **Mock-data realism** — invest in believable, varied seed (good photos, plausible prices per location) in M1.
- **Map fragmentation across iOS/Android/Web** — pick one cross-platform map up front, single marker, no clustering (M4).
- **Cross-platform drift** — smoke-test all three targets each milestone (habit set in M0).
- **Scale cliff deferred** — keep image URLs CDN-swappable so the S3+CloudFront migration isn't a rewrite.

---

## Task Backlog

> Ordered by milestone (dependency-correct). Each item is build-ready. `[SEC]` = security-critical, `[PERF]` = performance-critical, `[PROD]` = needs a product decision.

### M0 — Foundation & screaming structure
1. Scaffold Expo SDK 56 app (New Arch default); verify boot on iOS, Android, Web.
2. Configure `babel.config.js` (`nativewind/babel` + `react-native-worklets/plugin`) and `metro.config.js` (`withNativeWind`).
3. Install + theme NativeWind 4.2.x on Tailwind v3; add `global.css`, `tailwind.config.js`, theme tokens, `cn()` helper.
4. RNR CLI init; copy + theme base atoms (Button, Card, Sheet, Text, Input) into `shared/ui/primitives`.
5. Create the screaming/hexagonal tree: `src/features/<feature>/{domain,application,infrastructure,ui}`, `src/shared`, `src/core`.
6. `tsconfig.json` paths (`@feature/*`, `@shared/*`, `@core/*`) + `eslint-plugin-boundaries` rules enforcing layer imports. `[SEC]`
7. `core/config/env.ts` — zod-validated env; ONLY `EXPO_PUBLIC_*` (URL + anon key) reach the bundle. `[SEC]`
8. `core/supabase/client.ts` — single `@supabase/supabase-js` import, anon key only, SecureStore session adapter, `autoRefreshToken/persistSession/detectSessionInUrl` per platform. `[SEC]`
9. Reanimated + gesture-handler smoke test (trivial UI-thread animation).
10. CI: lint + typecheck + format gate; `--frozen-lockfile`/`npm ci`; commit lockfile; gitleaks/trufflehog secret scan + bundle grep for `service_role`. `[SEC]`

### M1 — Data model, RLS & seed
11. Enable extensions in the `extensions` schema: postgis, pg_trgm, citext, pgcrypto, pg_cron.
12. Create enums: `listing_type`, `property_kind`, `listing_status`.
13. Migration: `profiles` + `handle_new_user()` SECURITY DEFINER trigger (`SET search_path=''`) + `set_updated_at()` trigger. `[SEC]`
14. Migration: `properties` (all columns, generated `search_tsv`, soft-delete) + indexes (GIST, GIN, trigram, btree filter/order, PARTIAL feed index). `[PERF]`
15. Migration: `property_images` + indexes; `is_property_visible()` SECURITY DEFINER helper. `[SEC]`
16. Migration: `likes` (composite PK) + reverse-lookup index.
17. Migration: `folders` (partial uniques for name + single default) + `user_id` index.
18. Migration: `folder_items` (denormalized `user_id`, composite PK) + indexes; `owns_folder()` SECURITY DEFINER helper. `[SEC]`
19. RLS ENABLE + FORCE on every table; per-operation policies scoped `TO authenticated USING ((select auth.uid()) = ...)` with WITH CHECK on writes; public-read policies on properties/property_images with visibility predicate. `[SEC]`
20. Counter triggers: `like_count`, `save_count` (distinct-per-user), `folders.item_count`; `cover_image_path` sync trigger. `[PERF]`
21. `pg_cron` jobs: nightly count reconciliation + soft-delete purge after retention.
22. Storage: create PRIVATE `property-images` bucket (5MB, mime allow-list) + `avatars` bucket (2MB); SELECT policy via `is_property_visible`; no client write policy in MVP. `[SEC]`
23. `seed.sql` + seeding script (service_role, CI/local only): realistic varied mock properties + images uploaded to Storage. `[PROD]` (content quality)
24. `supabase gen types typescript` → `core/supabase/database.types.ts`.
25. **Cross-user negative test**: second token attempts SELECT/INSERT/UPDATE/DELETE on another user's likes/folders/folder_items/profiles → expect denial. `[SEC]`
26. **Product decision**: folders soft-delete vs hard-delete — confirm and finalize. `[PROD]`

### M2 — Auth & session
27. `auth/domain` ports (`AuthRepository`) + entities (`Session`, `AuthUser`); `auth/application` use-cases (signInWithEmail, signInWithOAuth, signOut, refreshSession).
28. `SupabaseAuthRepository` wrapping `supabase.auth`; wire in `core/di/container.ts`.
29. Email/password sign-up + sign-in screens; generic auth errors (no user enumeration). `[SEC]`
30. OAuth Google + Apple via PKCE (`expo-auth-session`/`expo-web-browser`); `callback.tsx`; strict redirect allow-list, no wildcards; state validation. `[SEC]`
31. Anonymous browse session (read-only) + deferred contextual sign-in prompt on first write attempt.
32. `sessionStore` (sync snapshot) + `(protected)` route guard redirect; logout clears SecureStore + local state. `[SEC]`
33. Confirm Supabase Auth config: email confirmation required, password ≥10 + HIBP, rotating refresh tokens + reuse detection, CAPTCHA on signup/signin/reset, tuned rate limits. `[SEC]`
34. **Decision**: migrate anonymous-session likes/saves into the account on sign-up (yes/no + approach). `[PROD]`

### M3 — Performant vertical feed (thinnest slice)
35. `feed/domain` (`FeedItem`, `FeedRepository` port, `feedRanking`); `feed/application` (`getFeedPage`).
36. `SupabaseFeedRepository` — keyset cursor `(sort_value, id)`, NEVER offset; inline counts + `cover_image_path`. `[PERF]`
37. `useFeedQuery` — `useInfiniteQuery` + keyset cursor + `fetchNextPage` near end-of-page.
38. `FeedList` (FlashList v2: `pagingEnabled`, full-screen snap, `drawDistance`, stable `keyExtractor`, no estimates). `[PERF]`
39. `FeedCard` + `FeedCardMedia` (`React.memo`, `expo-image` priority/blurhash/`recyclingKey`, static classNames, no inline closures). `[PERF]`
40. `useViewabilityPreload` — visible-index + play/pause via `useAnimatedReaction` on the UI thread (NOT React state); `expo-image.prefetch()` next N=2–3; batch signed URLs. `[PERF]`
41. Read `activeIndex` via Zustand selector so only the changing card re-renders. `[PERF]`
42. `favorites` feature: `toggleLike` use-case + `SupabaseFavoritesRepository`; optimistic like mutation with rollback. `[SEC]`
43. `folders` minimal: auto-create default 'Favorites'; `saveToFolders` use-case; `folder_items` insert under RLS; optimistic save. `[SEC]`
44. Feed empty/error/loading states.
45. **Profile the feed on a low-end Android device**; fix any JS→UI jitter before moving on. `[PERF]`

### M4 — Property detail
46. `properties/domain` (`Property`, `PropertyRepository`) + `application` (`getPropertyById`); `SupabasePropertyRepository`.
47. `PropertyDetailScreen` container + thin `property/[id].tsx` route.
48. Swipeable `PhotoGallery` (`expo-image`), `SpecsTable`, price/description presentational components.
49. `LocationMap` single marker — **pick one cross-platform map approach** (`react-native-maps` vs `expo-maps`) up front. `[PROD]`
50. Like + save from detail reusing the SAME application use-cases as the feed.
51. Smooth feed→detail transition.

### M5 — Folders management & profile
52. `folders/application` full: `createFolder`, `renameFolder`, `deleteFolder` (respecting M1 soft/hard decision).
53. `FoldersListScreen`, `FolderDetailScreen`, `SaveToFolderSheet` (add/remove to/from multiple folders).
54. Optimistic folder CRUD mutations + invalidation; rename collision handled by partial-unique.
55. `profile/application` `getProfileSummary` (likes + folders counts); `ProfileScreen`, `MyLikesPreview`, `MyFoldersPreview`.
56. Empty states + confirm-destructive delete flows.

### M6 — Filters
57. `filtersStore` (buy/rent, price range, location, bedrooms) persisted via Zustand middleware (NOT tokens).
58. Filter sheet UI (RNR primitives: switch, slider); zod-validate filter inputs. `[SEC]`
59. Feed query key incorporates filters; `listProperties(filters)` applied server-side, parameterized, RLS-safe, using filter indexes. `[PERF]` `[SEC]`
60. Reset/clear filters; result-count feedback; empty-result state.

### M7 — Security hardening & demo polish
61. Run full black-box pentest checklist (RLS bypass/IDOR with second token, anon-write, UPDATE ownership escape, hidden-table enumeration, RPC abuse, JWT tampering, refresh reuse, mass-assignment). `[SEC]`
62. Bundle + EAS Update payload secrets audit: grep for service_role / JWT secret / private/AWS keys; confirm only `EXPO_PUBLIC_` anon present. `[SEC]`
63. Storage attack pass: private-bucket listing, guessed paths, expired signed-URL replay, oversized/non-image upload, path-traversal. `[SEC]`
64. Injection/XSS pass on filters, zod boundaries, listing description/profile on web. `[SEC]`
65. SSRF review of any URL-fetching edge fn/RPC + outbound allow-list/IP filtering (designed-in even if no feature yet). `[SEC]`
66. Rate limiting / abuse controls: tune Supabase Auth limits, front PostgREST with Cloudflare/WAF, application-level write caps + pagination caps. `[SEC]`
67. Web security headers (HSTS, CSP, nosniff, frame-ancestors, Referrer-Policy, Permissions-Policy, COOP) + strict CORS allow-list; clickjacking + inline-script-injection checks. `[SEC]`
68. Logging/monitoring: Supabase Auth + Postgres logs → sink with retention; alert on 401/403/429 spikes; Sentry scrubbed of PII/tokens; audit trail for sensitive mutations. `[SEC]`
69. Dependency/SCA scan (npm audit + Dependabot/Renovate), fail on high/critical; pin Expo SDK 56 + native modules. `[SEC]`
70. EAS Update code signing + pinned channel (OTA supply-chain). `[SEC]`
71. Run Supabase Security Advisor + production checklist; sign off the pentest checklist.