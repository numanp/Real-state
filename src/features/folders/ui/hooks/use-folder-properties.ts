import { useEffect, useState } from 'react';

import { container } from '@/core/di/container';
import { useSessionStore } from '@/core/store/session-store';
import type { PropertyDetail } from '@/features/properties/domain/entities/property-detail';

/** Resolves the properties saved in a folder. */
export function useFolderProperties(folderId: string | undefined) {
  const session = useSessionStore((s) => s.session);
  const [properties, setProperties] = useState<PropertyDetail[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session || !folderId) {
      setProperties([]);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    void (async () => {
      try {
        const ids = await container.folders.listItems(session.user.id, folderId);
        const resolved = await Promise.all(ids.map((id) => container.getProperty.execute(id)));
        if (active) setProperties(resolved.filter((p): p is PropertyDetail => p !== null));
      } catch {
        if (active) setProperties([]);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [session, folderId]);

  return { properties, loading };
}
