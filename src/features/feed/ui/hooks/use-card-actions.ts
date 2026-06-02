import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import { container } from '@/core/di/container';
import { useInteractionsStore } from '@/core/store/interactions-store';
import { useSessionStore } from '@/core/store/session-store';

/**
 * Per-card like/save actions, gated by auth. Reads the session snapshot
 * directly (no fetch) so every card is cheap. Saving/liking while signed out
 * routes to /sign-in instead of failing — "saving requires an account".
 */
export function useCardActions(propertyId: string) {
  const router = useRouter();
  const session = useSessionStore((s) => s.session);
  const isLiked = useInteractionsStore((s) => s.likedIds.includes(propertyId));
  const isSaved = useInteractionsStore((s) => s.savedIds.includes(propertyId));
  const setLiked = useInteractionsStore((s) => s.setLiked);
  const setSaved = useInteractionsStore((s) => s.setSaved);

  const requireAuth = useCallback(() => {
    if (session) return true;
    router.push('/sign-in');
    return false;
  }, [session, router]);

  const toggleLike = useCallback(async () => {
    if (!requireAuth() || !session) return;
    const liked = await container.favorites.toggle(session.user.id, propertyId);
    setLiked(propertyId, liked);
  }, [requireAuth, session, propertyId, setLiked]);

  const markSaved = useCallback(() => setSaved(propertyId, true), [setSaved, propertyId]);

  return { isLiked, isSaved, requireAuth, toggleLike, markSaved };
}
