# Reel Estate (working name)

Swipe-first real estate discovery. Scrolleás propiedades como en TikTok: like, favoritos y carpetas. Pensado mobile-first, con foco en performance y seguridad desde el diseño.

> Nombre provisional — abierto a cambiarlo.

## Stack (decidido)

| Capa | Elección | Por qué |
| --- | --- | --- |
| App | **Expo** (React Native + RN Web), TypeScript | Un solo codebase → iOS / Android / Web. El producto **es** el swipe vertical: necesitamos feel nativo (Reanimated, Gesture Handler, FlashList). |
| UI | **NativeWind** (Tailwind para RN) + **React Native Reusables** | La filosofía shadcn/ui (componentes tuyos, copy-paste, accesibles) portada a RN. shadcn/ui literal es web-only (Radix + DOM), no corre en native. |
| Backend / DB | **Supabase** (Postgres + Auth + Storage + RLS + Realtime) | Datos relacionales (usuarios ↔ likes ↔ carpetas ↔ propiedades) + filtros (precio/geo/ambientes). **RLS = autorización en la base** → OWASP A01 cubierto desde el diseño. |
| Media a escala | **AWS** (S3 + CloudFront CDN, MediaConvert) — *reservado* | Se activa cuando duela (CDN de imágenes, transcodificación de video). |
| Datos MVP | **Seed mock realista** + pipeline de import | Validamos la UX (scroll/like/carpetas) ya, sin bloqueos legales ni integraciones. |

## Principios (no negociables)

- **Seguridad desde el diseño.** Autorización en la base (RLS), nunca en el cliente. El cliente usa sólo la `anon key`; la `service_role key` jamás llega al bundle. Objetivo: resistir pentest black-box + OWASP Top 10.
- **Performance primero.** Feed vertical a 60fps con preload agresivo de la próxima propiedad.
- **Código ordenado y muy componentizado.** Componentes chicos. Arquitectura screaming + hexagonal. El dominio no depende de Supabase (puertos y adaptadores).

## Alcance MVP (v1)

- Auth (email + OAuth). Browse anónimo; guardar requiere cuenta.
- Feed vertical full-screen con preload de la próxima propiedad.
- Like · favoritos · carpetas (crear/renombrar/borrar) · guardar propiedad en carpetas.
- Detalle de propiedad (fotos, precio, ubicación en mapa, specs).
- Filtros básicos (compra/alquiler, precio, ubicación, ambientes).
- Perfil: mis likes, mis carpetas.

**Fuera de alcance (después):** chat, uploads de agentes, recomendación ML, transcodificación de video, push, social/follows.

## Puesta en marcha

```bash
npm install
# Creá un .env (NO se commitea) con tus credenciales de Supabase:
#   EXPO_PUBLIC_SUPABASE_URL=https://TU-PROYECTO.supabase.co
#   EXPO_PUBLIC_SUPABASE_ANON_KEY=TU-ANON-KEY
npm run web      # o: npm run ios | npm run android
```

Solo las variables `EXPO_PUBLIC_*` entran al bundle (son **públicas** por diseño). La `anon key` es segura porque la autorización vive en RLS; la `service_role` **nunca** va al cliente.

## Estructura

```
src/
├── app/                  # Expo Router — rutas (thin)
├── core/                 # cross-cutting: supabase/ (cliente anon), config/ (env zod)
├── shared/ui/            # design system: primitives/ (átomos RNR), lib/ (cn)
└── features/<dominio>/   # screaming arch: domain → application → infrastructure → ui  (desde M1)
```

## Estado

- ✅ **M0** — Scaffold Expo SDK 56 + NativeWind 4.2 (tema shadcn por CSS vars) + cliente Supabase (anon + `expo-secure-store`) + base hexagonal. Bundle web verificado.
- 🏗️ **M1 (siguiente)** — schema Postgres + RLS + entitlements + seed mock.
- 📄 Diseño: [`FOUNDATION.md`](FOUNDATION.md) (core) · `MEMBERSHIP.md` (tiers/entitlements/billing).

## Convenciones

- Commits convencionales (`feat:`, `fix:`, `chore:`, `docs:`…), un paso reviewable por commit.
- TypeScript estricto. Validación con `zod` en cada borde (input del usuario, respuestas de red).
