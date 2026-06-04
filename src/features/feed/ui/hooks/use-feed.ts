import { useCallback, useEffect, useRef, useState } from 'react';

import { container } from '@/core/di/container';
import { useFeedModeStore } from '@/core/store/feed-mode-store';
import { useFiltersStore } from '@/core/store/filters-store';
import { useInteractionsStore } from '@/core/store/interactions-store';
import type { FeedItem } from '@/features/feed/domain/entities/feed-item';
import type { FeedCursor } from '@/features/feed/domain/ports/feed-repository';
import { buildTasteProfile, rankFeed } from '@/features/personalization/domain/ranking';

const FOR_YOU_POOL = 60;

/**
 * Drives the feed. "Recientes" = keyset pagination over the repository.
 * "Para vos" = fetch a candidate pool once and rank it by the user's taste
 * profile (built from their likes/saves/passes). Resets and reloads whenever the
 * mode or active filters change; a generation guard drops stale in-flight pages.
 */
export function useFeed() {
  const filters = useFiltersStore((s) => s.filters);
  const mode = useFeedModeStore((s) => s.mode);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const cursor = useRef<FeedCursor | null>(null);
  const exhausted = useRef(false);
  const inFlight = useRef(false);
  const generation = useRef(0);

  const loadMore = useCallback(async () => {
    if (mode === 'forYou' || inFlight.current || exhausted.current) return;
    const gen = generation.current;
    inFlight.current = true;
    setIsLoading(true);
    try {
      const page = await container.getFeedPage.execute({ cursor: cursor.current, filters });
      if (generation.current !== gen) return;
      setItems((prev) => [...prev, ...page.items]);
      cursor.current = page.nextCursor;
      exhausted.current = page.nextCursor === null;
    } finally {
      if (generation.current === gen) {
        inFlight.current = false;
        setIsLoading(false);
      }
    }
  }, [mode, filters]);

  const loadForYou = useCallback(async () => {
    const gen = generation.current;
    inFlight.current = true;
    setIsLoading(true);
    try {
      // Personalized deck: server-ranked from full signal history on the live
      // backend (ranked_feed RPC); in-memory returns the raw pool. Either way we
      // re-rank by session signals and drop already-acted items as a refinement —
      // on the server path positives are already excluded, so this is a no-op
      // that preserves the server order.
      const pool = await container.getFeedPage.forYou(FOR_YOU_POOL);
      if (generation.current !== gen) return;
      const { likedIds, savedIds, passedIds } = useInteractionsStore.getState();
      const positives = new Set([...likedIds, ...savedIds]);
      const negatives = new Set(passedIds);
      const profile = buildTasteProfile(
        pool.filter((i) => positives.has(i.id)),
        pool.filter((i) => negatives.has(i.id)),
      );
      const candidates = pool.filter((i) => !positives.has(i.id) && !negatives.has(i.id));
      setItems(rankFeed(candidates, profile));
      cursor.current = null;
      exhausted.current = true; // finite ranked deck
    } finally {
      if (generation.current === gen) {
        inFlight.current = false;
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    generation.current += 1;
    cursor.current = null;
    exhausted.current = false;
    inFlight.current = false;
    setItems([]);
    if (mode === 'forYou') void loadForYou();
    else void loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, mode]);

  return { items, isLoading, loadMore };
}
