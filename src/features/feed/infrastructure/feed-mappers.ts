/**
 * Pure row → FeedItem mapping. No Supabase client, no async — unit-testable
 * without a live DB. Carries STORAGE PATHS (not signed URLs) in posterUrl /
 * sources; the repository resolves signed URLs in a separate async step.
 */
import type { FeedItem, ReelMedia, ReelMediaType } from '@/features/feed/domain/entities/feed-item';

/** The subset of DB columns that the mapper needs. */
export interface FeedRow {
  // Property columns
  id: string;
  title: string;
  listing_type: 'buy' | 'rent';
  price_cents: number;
  currency: string;
  bedrooms: number | null;
  bathrooms: number | null;
  area_sqm: number | null;
  city: string | null;
  like_count: number;
  save_count: number;
  published_at: string;
  // Reel columns (always present — INNER JOIN guarantees these)
  reel_id: string;
  media_type: ReelMediaType;
  video_path: string | null;
  poster_path: string | null;
  image_paths: string[] | null;
  thumbnail_blurhash: string | null;
  duration_ms: number | null;
  aspect_ratio: number;
  caption: string | null;
}

/**
 * Maps a DB row (property + reel fields) to a FeedItem whose ReelMedia carries
 * STORAGE PATHS. Call resolveReelSignedUrls() afterwards to swap paths for
 * signed URLs before handing items to the UI.
 */
export function rowToFeedItem(r: FeedRow): FeedItem {
  const reel: ReelMedia = {
    id: r.reel_id,
    mediaType: r.media_type,
    sources: r.media_type === 'video'
      ? (r.video_path != null ? [r.video_path] : [])
      : (r.image_paths ?? []),
    ...(r.poster_path != null && { posterUrl: r.poster_path }),
    ...(r.thumbnail_blurhash != null && { blurhash: r.thumbnail_blurhash }),
    ...(r.duration_ms != null && { durationMs: r.duration_ms }),
    aspectRatio: r.aspect_ratio,
  };

  return {
    id: r.id,
    title: r.title,
    operation: r.listing_type,
    price: {
      amountCents: Number(r.price_cents),
      currency: (r.currency ?? 'USD').trim(),
      period: r.listing_type === 'rent' ? 'monthly' : 'once',
    },
    location: { city: r.city ?? '' },
    specs: {
      bedrooms: r.bedrooms ?? 0,
      bathrooms: Number(r.bathrooms ?? 0),
      areaSqm: r.area_sqm != null ? Number(r.area_sqm) : undefined,
    },
    primaryReel: reel,
    counts: { likes: r.like_count, saves: r.save_count },
    publishedAt: r.published_at,
  };
}
