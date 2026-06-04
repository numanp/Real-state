import { container } from '@/core/di/container';
import { useAsync } from '@/core/hooks/use-async';
import { useInteractionsStore } from '@/core/store/interactions-store';
import { useSessionStore } from '@/core/store/session-store';
import type { PropertyDetail } from '@/features/properties/domain/entities/property-detail';

/** Resolves the signed-in user's liked property ids into full properties.
 *  Re-runs when likes change so the list stays in sync. */
export function useLikedProperties() {
  const session = useSessionStore((s) => s.session);
  const likedIds = useInteractionsStore((s) => s.likedIds);
  const { data, loading, error } = useAsync<PropertyDetail[]>(
    async () => {
      if (!session) return [];
      const ids = await container.favorites.list(session.user.id);
      return container.getProperty.executeMany(ids);
    },
    [session, likedIds],
    { initial: [] },
  );
  return { properties: data ?? [], loading, error };
}
