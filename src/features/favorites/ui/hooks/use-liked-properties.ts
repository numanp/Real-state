import { useEffect, useState } from 'react';

import { container } from '@/core/di/container';
import { useInteractionsStore } from '@/core/store/interactions-store';
import { useSessionStore } from '@/core/store/session-store';
import type { PropertyDetail } from '@/features/properties/domain/entities/property-detail';

/** Resolves the signed-in user's liked property ids into full properties.
 *  Re-runs when likes change so the list stays in sync. */
export function useLikedProperties() {
  const session = useSessionStore((s) => s.session);
  const likedIds = useInteractionsStore((s) => s.likedIds);
  const [properties, setProperties] = useState<PropertyDetail[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) {
      setProperties([]);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    void (async () => {
      const ids = await container.favorites.list(session.user.id);
      const resolved = await Promise.all(ids.map((id) => container.getProperty.execute(id)));
      if (!active) return;
      setProperties(resolved.filter((p): p is PropertyDetail => p !== null));
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [session, likedIds]);

  return { properties, loading };
}
