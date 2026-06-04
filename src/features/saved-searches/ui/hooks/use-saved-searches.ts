import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { container } from '@/core/di/container';
import { useSessionStore } from '@/core/store/session-store';
import type { FeedFilters } from '@/features/feed/domain/ports/feed-repository';
import type { SavedSearch } from '@/features/saved-searches/domain/entities/saved-search';

export interface SavedSearchWithCount extends SavedSearch {
  matchCount: number;
  /** New matches since the search was last opened (drives the "N nuevas" badge). */
  newCount: number;
}

/** Loads the user's saved searches with both a live total match count and the
 *  count of NEW matches since each was last seen (the in-app alert badge).
 *  Refreshes on focus. */
export function useSavedSearches() {
  const session = useSessionStore((s) => s.session);
  const [searches, setSearches] = useState<SavedSearchWithCount[]>([]);

  const load = useCallback(async () => {
    if (!session) {
      setSearches([]);
      return;
    }
    const userId = session.user.id;
    const [list, counts] = await Promise.all([
      container.savedSearches.list(userId),
      container.savedSearches.alertCounts(userId).catch(() => ({}) as Record<string, number>),
    ]);
    const withCounts = await Promise.all(
      list.map(async (s) => {
        const page = await container.getFeedPage.execute({ filters: s.filters, pageSize: 100 });
        return { ...s, matchCount: page.items.length, newCount: counts[s.id] ?? 0 };
      }),
    );
    setSearches(withCounts);
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const create = useCallback(
    async (name: string, filters: FeedFilters) => {
      if (!session) return;
      await container.savedSearches.create(session.user.id, name, filters);
      await load();
    },
    [session, load],
  );

  const remove = useCallback(
    async (id: string) => {
      if (!session) return;
      await container.savedSearches.remove(session.user.id, id);
      await load();
    },
    [session, load],
  );

  const markSeen = useCallback(
    async (id: string) => {
      if (!session) return;
      await container.savedSearches.markSeen(session.user.id, id);
      await load();
    },
    [session, load],
  );

  return { searches, create, remove, markSeen };
}
