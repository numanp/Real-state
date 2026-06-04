import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { container } from '@/core/di/container';
import { useSessionStore } from '@/core/store/session-store';
import type { ListingSummary } from '@/features/listings/domain/entities/listing';

/** The signed-in user's own listings, refreshed on screen focus. Failures set
 *  error instead of silently leaving a stale list. */
export function useMyListings() {
  const session = useSessionStore((s) => s.session);
  const [listings, setListings] = useState<ListingSummary[]>([]);
  const [error, setError] = useState<Error | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!session) {
        setListings([]);
        return;
      }
      let active = true;
      setError(null);
      container.listings
        .listMine(session.user.id)
        .then((l) => {
          if (active) setListings(l);
        })
        .catch((e: unknown) => {
          if (active) setError(e instanceof Error ? e : new Error(String(e)));
        });
      return () => {
        active = false;
      };
    }, [session]),
  );

  return { listings, error };
}
