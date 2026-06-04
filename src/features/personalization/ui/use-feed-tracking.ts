import { useCallback } from 'react';

import { container } from '@/core/di/container';
import { useSessionStore } from '@/core/store/session-store';
import type { FeedEventType } from '@/features/personalization/domain/entities/feed-event';

/**
 * Emits feed signals for the signed-in user (anonymous browsing isn't tracked —
 * RLS requires an authenticated user). Every emit buffers in the FeedTracker, so
 * there is no per-event network call on the scroll path.
 */
export function useFeedTracking() {
  const session = useSessionStore((s) => s.session);

  const emit = useCallback(
    (
      type: FeedEventType,
      propertyId: string | null,
      extra?: { dwellMs?: number; position?: number },
    ) => {
      if (!session) return;
      container.feedTracker.track({
        userId: session.user.id,
        propertyId,
        type,
        dwellMs: extra?.dwellMs,
        position: extra?.position,
        at: new Date().toISOString(),
      });
    },
    [session],
  );

  return {
    flush: useCallback(() => container.feedTracker.flush(), []),
    trackLike: useCallback((id: string) => emit('like', id), [emit]),
    trackUnlike: useCallback((id: string) => emit('unlike', id), [emit]),
    trackSave: useCallback((id: string) => emit('save', id), [emit]),
    trackPass: useCallback((id: string) => emit('pass', id), [emit]),
    trackSuperLike: useCallback((id: string) => emit('super_like', id), [emit]),
    trackRewind: useCallback((id: string) => emit('rewind', id), [emit]),
    trackDetail: useCallback((id: string) => emit('detail', id), [emit]),
    emitView: useCallback(
      (id: string, dwellMs: number, position: number) => emit('view', id, { dwellMs, position }),
      [emit],
    ),
  };
}
