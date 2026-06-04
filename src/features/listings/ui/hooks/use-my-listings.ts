import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { container } from '@/core/di/container';
import { useSessionStore } from '@/core/store/session-store';
import type { ListingSummary } from '@/features/listings/domain/entities/listing';

export function useMyListings() {
  const session = useSessionStore((s) => s.session);
  const [listings, setListings] = useState<ListingSummary[]>([]);

  useFocusEffect(
    useCallback(() => {
      if (!session) {
        setListings([]);
        return;
      }
      let active = true;
      void container.listings.listMine(session.user.id).then((l) => {
        if (active) setListings(l);
      });
      return () => {
        active = false;
      };
    }, [session]),
  );

  return { listings };
}
