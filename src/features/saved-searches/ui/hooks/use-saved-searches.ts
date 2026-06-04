import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { container } from '@/core/di/container';
import { useSessionStore } from '@/core/store/session-store';
import type { FeedFilters } from '@/features/feed/domain/ports/feed-repository';
import type { SavedSearch } from '@/features/saved-searches/domain/entities/saved-search';

export interface SavedSearchWithCount extends SavedSearch {
  matchCount: number;
}

/** Loads the user's saved searches and a live match count for each (the count is
 *  just the current feed filtered by the stored predicate). Refreshes on focus. */
export function useSavedSearches() {
  const session = useSessionStore((s) => s.session);
  const [searches, setSearches] = useState<SavedSearchWithCount[]>([]);

  const load = useCallback(async () => {
    if (!session) {
      setSearches([]);
      return;
    }
    const list = await container.savedSearches.list(session.user.id);
    const withCounts = await Promise.all(
      list.map(async (s) => {
        const page = await container.getFeedPage.execute({ filters: s.filters, pageSize: 100 });
        return { ...s, matchCount: page.items.length };
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

  return { searches, create, remove };
}
