import { container } from '@/core/di/container';
import { useAsync } from '@/core/hooks/use-async';
import { useSessionStore } from '@/core/store/session-store';
import type { PropertyDetail } from '@/features/properties/domain/entities/property-detail';

/** Resolves the properties saved in a folder. */
export function useFolderProperties(folderId: string | undefined) {
  const session = useSessionStore((s) => s.session);
  const { data, loading, error } = useAsync<PropertyDetail[]>(
    async () => {
      if (!session || !folderId) return [];
      const ids = await container.folders.listItems(session.user.id, folderId);
      return container.getProperty.executeMany(ids);
    },
    [session, folderId],
    { initial: [], enabled: Boolean(session && folderId) },
  );
  return { properties: data ?? [], loading, error };
}
