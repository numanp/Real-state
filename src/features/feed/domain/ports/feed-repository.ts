import type { FeedItem } from '@/features/feed/domain/entities/feed-item';

/**
 * Keyset cursor = the last row's (publishedAt, id). The feed is ordered by
 * publishedAt DESC, id DESC. We NEVER use OFFSET (it scans all prior rows under
 * RLS); the Supabase adapter resumes with a `(published_at, id) < (..)` compare.
 */
export interface FeedCursor {
  publishedAt: string;
  id: string;
}

export interface FeedPage {
  items: FeedItem[];
  /** Null when there are no more items after this page. */
  nextCursor: FeedCursor | null;
}

export interface FeedQuery {
  cursor?: FeedCursor | null;
  pageSize?: number;
}

/**
 * Domain PORT. The UI/application depend on this interface, never on Supabase.
 * Implementations: InMemoryFeedRepository (now, runs without a DB) and
 * SupabaseFeedRepository (swapped in via DI when the database is ready).
 */
export interface FeedRepository {
  getPage(query: FeedQuery): Promise<FeedPage>;
}
