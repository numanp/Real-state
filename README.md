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

## Estado

🏗️ **Génesis.** Diseño de fundaciones en curso (data model + RLS, threat model OWASP, arquitectura Expo, performance del feed). El documento `FOUNDATION.md` se genera a partir de ese diseño.

## Convenciones

- Commits convencionales (`feat:`, `fix:`, `chore:`, `docs:`…), un paso reviewable por commit.
- TypeScript estricto. Validación con `zod` en cada borde (input del usuario, respuestas de red).
