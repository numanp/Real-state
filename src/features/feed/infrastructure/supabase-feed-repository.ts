import { supabase } from '@/core/supabase/client';
import { posterFor } from '@/core/supabase/media';
import type { FeedItem } from '@/features/feed/domain/entities/feed-item';
import type {
  FeedCursor,
  FeedFilters,
  FeedPage,
  FeedQuery,
  FeedRepository,
} from '@/features/feed/domain/ports/feed-repository';

interface Row {
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
}

const COLUMNS =
  'id,title,listing_type,price_cents,currency,bedrooms,bathrooms,area_sqm,city,like_count,save_count,published_at';

function toFeedItem(r: Row): FeedItem {
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
    primaryReel: {
      id: `${r.id}-reel`,
      mediaType: 'image_set',
      posterUrl: posterFor(r.id),
      sources: [posterFor(r.id)],
    },
    counts: { likes: r.like_count, saves: r.save_count },
    publishedAt: r.published_at,
  };
}

/**
 * Reads the feed from Postgres. RLS already restricts to active, non-deleted
 * rows, so no status/deleted_at filter is needed. Keyset pagination over
 * (published_at DESC, id DESC) — never OFFSET.
 */
export class SupabaseFeedRepository implements FeedRepository {
  async getForYou(pageSize: number): Promise<FeedItem[]> {
    // Server-side ranking from the user's full feed_events history (ranked_feed
    // RPC also excludes already-seen listings). Returns full property rows.
    const { data, error } = await supabase.rpc('ranked_feed', { p_limit: pageSize });
    if (error) throw new Error(`feed.getForYou: ${error.message}`);
    return ((data ?? []) as Row[]).map(toFeedItem);
  }

  async getPage({ cursor, pageSize, filters }: FeedQuery): Promise<FeedPage> {
    const size = pageSize ?? 8;
    let query = supabase.from('properties').select(COLUMNS);
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

    const rows = (data ?? []) as Row[];
    const hasMore = rows.length > size;
    const items = rows.slice(0, size).map(toFeedItem);
    const last = items[items.length - 1];
    const nextCursor: FeedCursor | null =
      hasMore && last ? { publishedAt: last.publishedAt, id: last.id } : null;

    return { items, nextCursor };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function withFilters(query: any, filters?: FeedFilters) {
  if (!filters) return query;
  if (filters.operation) query = query.eq('listing_type', filters.operation);
  if (filters.minBedrooms !== undefined) query = query.gte('bedrooms', filters.minBedrooms);
  if (filters.city) query = query.ilike('city', `%${filters.city}%`);
  if (filters.currency) query = query.eq('currency', filters.currency);
  if (filters.maxPriceCents !== undefined) query = query.lte('price_cents', filters.maxPriceCents);
  return query;
}
