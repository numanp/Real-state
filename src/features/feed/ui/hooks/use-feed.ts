import { useCallback, useEffect, useRef, useState } from 'react';

import { container } from '@/core/di/container';
import { useFiltersStore } from '@/core/store/filters-store';
import type { FeedItem } from '@/features/feed/domain/entities/feed-item';
import type { FeedCursor } from '@/features/feed/domain/ports/feed-repository';

/**
 * Drives the feed: loads the first page on mount, appends pages on demand, and
 * RESETS + reloads whenever the active filters change. A generation guard drops
 * any in-flight page whose filters are already stale.
 */
export function useFeed() {
  const filters = useFiltersStore((s) => s.filters);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const cursor = useRef<FeedCursor | null>(null);
  const exhausted = useRef(false);
  const inFlight = useRef(false);
  const generation = useRef(0);

  const loadMore = useCallback(async () => {
    if (inFlight.current || exhausted.current) return;
    const gen = generation.current;
    inFlight.current = true;
    setIsLoading(true);
    try {
      const page = await container.getFeedPage.execute({ cursor: cursor.current, filters });
      if (generation.current !== gen) return; // filters changed mid-flight
      setItems((prev) => [...prev, ...page.items]);
      cursor.current = page.nextCursor;
      exhausted.current = page.nextCursor === null;
    } finally {
      if (generation.current === gen) {
        inFlight.current = false;
        setIsLoading(false);
      }
    }
  }, [filters]);

  useEffect(() => {
    generation.current += 1;
    cursor.current = null;
    exhausted.current = false;
    inFlight.current = false;
    setItems([]);
    void loadMore();
  }, [filters, loadMore]);

  return { items, isLoading, loadMore };
}
