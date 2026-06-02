import type { FeedItem } from '@/features/feed/domain/entities/feed-item';
import type {
  FeedCursor,
  FeedPage,
  FeedQuery,
  FeedRepository,
} from '@/features/feed/domain/ports/feed-repository';

// Local fallback only; the use-case always passes a resolved pageSize, so this
// keeps infrastructure from importing the application layer's default.
const FALLBACK_PAGE_SIZE = 10;

type Key = Pick<FeedItem, 'publishedAt' | 'id'>;

/** True when `a` sorts AFTER `b` in (publishedAt DESC, id DESC) order. */
function isAfter(a: Key, b: Key): boolean {
  if (a.publishedAt !== b.publishedAt) return a.publishedAt < b.publishedAt;
  return a.id < b.id;
}

function byPublishedDesc(a: FeedItem, b: FeedItem): number {
  if (a.publishedAt !== b.publishedAt) return a.publishedAt < b.publishedAt ? 1 : -1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? 1 : -1;
}

/**
 * In-memory FeedRepository — lets the whole feed run with NO database. It
 * mirrors the Supabase keyset pagination (publishedAt DESC, id DESC, never
 * OFFSET) so swapping in SupabaseFeedRepository later changes nothing upstream.
 */
export class InMemoryFeedRepository implements FeedRepository {
  private readonly sorted: FeedItem[];

  constructor(items: FeedItem[]) {
    this.sorted = [...items].sort(byPublishedDesc);
  }

  async getPage({ cursor, pageSize }: FeedQuery): Promise<FeedPage> {
    const size = pageSize ?? FALLBACK_PAGE_SIZE;
    const after = cursor ? this.sorted.filter((item) => isAfter(item, cursor)) : this.sorted;
    const items = after.slice(0, size);

    const last = items[items.length - 1];
    const hasMore = after.length > items.length;
    const nextCursor: FeedCursor | null =
      hasMore && last ? { publishedAt: last.publishedAt, id: last.id } : null;

    return { items, nextCursor };
  }
}
