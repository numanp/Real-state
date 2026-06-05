import { supabase } from '@/core/supabase/client';
import type { FeedItem } from '@/features/feed/domain/entities/feed-item';
import type {
  FeedCursor,
  FeedFilters,
  FeedPage,
  FeedQuery,
  FeedRepository,
} from '@/features/feed/domain/ports/feed-repository';
import { type FeedRow, rowToFeedItem } from '@/features/feed/infrastructure/feed-mappers';

// Property columns returned by both query paths.
const PROPERTY_COLS =
  'id,title,listing_type,price_cents,currency,bedrooms,bathrooms,area_sqm,city,like_count,save_count,published_at';

// Reel columns for the PostgREST embedded join in getPage.
const REEL_COLS =
  'id,media_type,video_path,poster_path,image_paths,thumbnail_blurhash,duration_ms,aspect_ratio,caption';

const GETPAGE_SELECT = `${PROPERTY_COLS},property_reels!inner(${REEL_COLS})`;

const REELS_BUCKET = 'reels';
const SIGNED_URL_TTL = 3600; // 1 hour

/**
 * Collect every storage path that needs a signed URL from a set of feed items.
 * Returns a de-duped list of non-empty paths (poster + video/images).
 */
function collectReelPaths(items: FeedItem[]): string[] {
  const paths = new Set<string>();
  for (const item of items) {
    const r = item.primaryReel;
    if (r.posterUrl) paths.add(r.posterUrl);
    for (const s of r.sources) {
      if (s) paths.add(s);
    }
  }
  return Array.from(paths);
}

/**
 * Batch-sign all reel storage paths and return a path→signedUrl map.
 * Uses a SINGLE createSignedUrls call per page (one round-trip, one bucket).
 */
async function buildSignedUrlMap(paths: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (paths.length === 0) return map;

  const { data, error } = await supabase.storage
    .from(REELS_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL);

  if (error) {
    // Non-fatal: log and fall back to raw paths so the UI can still render
    // (poster will be missing, but the feed won't crash).
    console.warn(`feed.signReelUrls: ${error.message}`);
    return map;
  }

  for (const entry of data ?? []) {
    if (entry.path && entry.signedUrl) {
      map.set(entry.path, entry.signedUrl);
    }
  }
  return map;
}

/** Swap storage paths in a FeedItem's reel for signed URLs in-place (returns new item). */
function applySignedUrls(item: FeedItem, urlMap: Map<string, string>): FeedItem {
  const r = item.primaryReel;
  const hasSources = r.sources.length > 0;
  const hasPoster = r.posterUrl != null;

  if (!hasSources && !hasPoster) return item;

  return {
    ...item,
    primaryReel: {
      ...r,
      ...(hasPoster && r.posterUrl != null
        ? { posterUrl: urlMap.get(r.posterUrl) ?? r.posterUrl }
        : {}),
      sources: r.sources.map((s) => urlMap.get(s) ?? s),
    },
  };
}

/**
 * Map raw items through URL resolution. The batch covers ALL items in the page
 * (poster + video/image sources), one round-trip to Supabase Storage.
 */
async function resolveSignedUrls(items: FeedItem[]): Promise<FeedItem[]> {
  const paths = collectReelPaths(items);
  const urlMap = await buildSignedUrlMap(paths);
  return items.map((item) => applySignedUrls(item, urlMap));
}

/**
 * Convert a PostgREST embedded-join row (property + nested property_reels[0])
 * into the flat FeedRow shape that rowToFeedItem expects.
 */
function flattenEmbedRow(row: any): FeedRow {
  const reelEmbed = Array.isArray(row.property_reels)
    ? row.property_reels[0]
    : row.property_reels;
  return {
    id: row.id,
    title: row.title,
    listing_type: row.listing_type,
    price_cents: row.price_cents,
    currency: row.currency,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    area_sqm: row.area_sqm,
    city: row.city,
    like_count: row.like_count,
    save_count: row.save_count,
    published_at: row.published_at,
    // reel fields from the embedded join
    reel_id: reelEmbed?.id ?? '',
    media_type: reelEmbed?.media_type ?? 'image_set',
    video_path: reelEmbed?.video_path ?? null,
    poster_path: reelEmbed?.poster_path ?? null,
    image_paths: reelEmbed?.image_paths ?? null,
    thumbnail_blurhash: reelEmbed?.thumbnail_blurhash ?? null,
    duration_ms: reelEmbed?.duration_ms ?? null,
    aspect_ratio: reelEmbed?.aspect_ratio ?? 1,
    caption: reelEmbed?.caption ?? null,
  };
}

/**
 * Reads the feed from Postgres. RLS already restricts to active, non-deleted
 * rows, so no status/deleted_at filter is needed. Keyset pagination over
 * (published_at DESC, id DESC) — never OFFSET.
 *
 * Both query paths (getForYou + getPage) are INNER-JOINed on the primary ready
 * reel, so a property without one is fail-closed (never appears).
 */
export class SupabaseFeedRepository implements FeedRepository {
  async getForYou(pageSize: number): Promise<FeedItem[]> {
    // Server-side ranking from the user's full feed_events history.
    // ranked_feed now INNER-JOINs the primary ready reel and returns reel cols.
    const { data, error } = await supabase.rpc('ranked_feed', { p_limit: pageSize });
    if (error) throw new Error(`feed.getForYou: ${error.message}`);

    const items = ((data ?? []) as FeedRow[]).map(rowToFeedItem);
    return resolveSignedUrls(items);
  }

  async getPage({ cursor, pageSize, filters }: FeedQuery): Promise<FeedPage> {
    const size = pageSize ?? 8;

    let query = supabase
      .from('properties')
      .select(GETPAGE_SELECT)
      .eq('property_reels.is_primary', true)
      .eq('property_reels.status', 'ready');

    query = withFilters(query, filters);

    if (cursor) {
      query = query.or(
        `published_at.lt.${cursor.publishedAt},and(published_at.eq.${cursor.publishedAt},id.lt.${cursor.id})`,
      );
    }

    const { data, error } = await query
      .order('published_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(size + 1);

    if (error) throw new Error(`feed.getPage: ${error.message}`);

    const rows = (data ?? []) as any[];
    const hasMore = rows.length > size;
    const items = rows.slice(0, size).map((row) => rowToFeedItem(flattenEmbedRow(row)));
    const signedItems = await resolveSignedUrls(items);

    const last = signedItems[signedItems.length - 1];
    const nextCursor: FeedCursor | null =
      hasMore && last ? { publishedAt: last.publishedAt, id: last.id } : null;

    return { items: signedItems, nextCursor };
  }

  async countMatches(filters?: FeedFilters): Promise<number> {
    let query = supabase.from('properties').select('id', { count: 'exact', head: true });
    query = withFilters(query, filters);
    const { count, error } = await query;
    if (error) throw new Error(`feed.countMatches: ${error.message}`);
    return count ?? 0;
  }
}

function withFilters(query: any, filters?: FeedFilters) {
  if (!filters) return query;
  if (filters.operation) query = query.eq('listing_type', filters.operation);
  if (filters.minBedrooms !== undefined) query = query.gte('bedrooms', filters.minBedrooms);
  if (filters.city) query = query.ilike('city', `%${filters.city}%`);
  if (filters.currency) query = query.eq('currency', filters.currency);
  if (filters.maxPriceCents !== undefined) query = query.lte('price_cents', filters.maxPriceCents);
  return query;
}
