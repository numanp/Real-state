import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import { container } from '@/core/di/container';
import { useFeedControlStore } from '@/core/store/feed-control-store';
import { useInteractionsStore } from '@/core/store/interactions-store';
import { useSessionStore } from '@/core/store/session-store';
import { useFeedTracking } from '@/features/personalization/ui/use-feed-tracking';

/**
 * Per-card actions, gated by auth. Like/save persist; pass/super-like/rewind
 * advance or rewind the feed and emit personalization signals. Reads the
 * session snapshot directly (no fetch) and the feed-control store imperatively
 * (no subscription) so every card stays cheap.
 */
export function useCardActions(propertyId: string) {
  const router = useRouter();
  const session = useSessionStore((s) => s.session);
  const isLiked = useInteractionsStore((s) => s.likedIds.includes(propertyId));
  const isSaved = useInteractionsStore((s) => s.savedIds.includes(propertyId));
  const setLiked = useInteractionsStore((s) => s.setLiked);
  const setSaved = useInteractionsStore((s) => s.setSaved);
  const { trackLike, trackUnlike, trackSave, trackPass, trackSuperLike, trackRewind } =
    useFeedTracking();

  const requireAuth = useCallback(() => {
    if (session) return true;
    router.push('/sign-in');
    return false;
  }, [session, router]);

  const advanceBy = useCallback((delta: number) => {
    const { activeIndex, count, scrollToIndex } = useFeedControlStore.getState();
    const next = activeIndex + delta;
    if (scrollToIndex && next >= 0 && next < count) scrollToIndex(next);
  }, []);

  const toggleLike = useCallback(async () => {
    if (!requireAuth() || !session) return;
    const liked = await container.favorites.toggle(session.user.id, propertyId);
    setLiked(propertyId, liked);
    (liked ? trackLike : trackUnlike)(propertyId);
  }, [requireAuth, session, propertyId, setLiked, trackLike, trackUnlike]);

  const markSaved = useCallback(() => {
    setSaved(propertyId, true);
    trackSave(propertyId);
  }, [setSaved, propertyId, trackSave]);

  const pass = useCallback(() => {
    trackPass(propertyId);
    advanceBy(1);
  }, [trackPass, propertyId, advanceBy]);

  const superLike = useCallback(async () => {
    if (!requireAuth() || !session) return;
    if (!useInteractionsStore.getState().likedIds.includes(propertyId)) {
      await container.favorites.toggle(session.user.id, propertyId);
      setLiked(propertyId, true);
    }
    trackSuperLike(propertyId);
    advanceBy(1);
  }, [requireAuth, session, propertyId, setLiked, trackSuperLike, advanceBy]);

  const rewind = useCallback(() => {
    trackRewind(propertyId);
    advanceBy(-1);
  }, [trackRewind, propertyId, advanceBy]);

  return { isLiked, isSaved, requireAuth, toggleLike, markSaved, pass, superLike, rewind };
}
