import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { container } from '@/core/di/container';
import { useSessionStore } from '@/core/store/session-store';
import type { Folder } from '@/features/folders/domain/entities/folder';

/** Loads the user's folders, refreshing every time the screen regains focus so
 *  renames/deletes from the detail screen show up on return. On failure loading
 *  resolves to false and error is set (no infinite spinner). */
export function useFolders() {
  const session = useSessionStore((s) => s.session);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!session) {
        setFolders([]);
        setLoading(false);
        return;
      }
      let active = true;
      setLoading(true);
      setError(null);
      container.folders
        .list(session.user.id)
        .then((list) => {
          if (active) setFolders(list);
        })
        .catch((e: unknown) => {
          if (active) setError(e instanceof Error ? e : new Error(String(e)));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
      };
    }, [session]),
  );

  return { folders, loading, error };
}
