import { useCallback, useEffect, useRef, useState } from 'react';

import { container } from '@/core/di/container';
import type { FeedItem } from '@/features/feed/domain/entities/feed-item';
import type { FeedCursor } from '@/features/feed/domain/ports/feed-repository';

/**
 * Drives the feed: loads the first page on mount and appends pages on demand.
 * A small cursor-paginated hook — swappable for TanStack `useInfiniteQuery`
 * once the Supabase adapter (real network + caching) lands.
 */
export function useFeed() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const cursor = useRef<FeedCursor | null>(null);
  const exhausted = useRef(false);
  const inFlight = useRef(false);

  const loadMore = useCallback(async () => {
    if (inFlight.current || exhausted.current) return;
    inFlight.current = true;
    setIsLoading(true);
    try {
      const page = await container.getFeedPage.execute({ cursor: cursor.current });
      setItems((prev) => [...prev, ...page.items]);
      cursor.current = page.nextCursor;
      exhausted.current = page.nextCursor === null;
    } finally {
      inFlight.current = false;
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMore();
  }, [loadMore]);

  return { items, isLoading, loadMore };
}
