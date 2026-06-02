import { useEffect, useState } from 'react';

import { container } from '@/core/di/container';
import { useSessionStore } from '@/core/store/session-store';
import type { Folder } from '@/features/folders/domain/entities/folder';

export function useFolders() {
  const session = useSessionStore((s) => s.session);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) {
      setFolders([]);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    void container.folders.list(session.user.id).then((list) => {
      if (!active) return;
      setFolders(list);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [session]);

  return { folders, loading };
}
