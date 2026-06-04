import type { FeedPage, FeedQuery, FeedRepository } from '@/features/feed/domain/ports/feed-repository';

export const DEFAULT_FEED_PAGE_SIZE = 8;

/**
 * Fetch one keyset page of the feed. Thin orchestration over the repository
 * port so the domain stays free of Supabase/HTTP concerns. The UI calls this
 * (via DI) and never touches a repository implementation directly.
 */
export class GetFeedPage {
  constructor(private readonly feed: FeedRepository) {}

  execute(query: FeedQuery = {}): Promise<FeedPage> {
    const pageSize = query.pageSize ?? DEFAULT_FEED_PAGE_SIZE;
    return this.feed.getPage({
      cursor: query.cursor ?? null,
      pageSize,
      filters: query.filters,
    });
  }

  /** Personalized "Para vos" candidate deck. */
  forYou(pageSize: number) {
    return this.feed.getForYou(pageSize);
  }
}
