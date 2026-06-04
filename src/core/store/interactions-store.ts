import { create } from 'zustand';

/**
 * Client snapshot of the current user's likes/saves/passes so feed cards can
 * reflect state without each one fetching, and so the "For You" ranker has the
 * positive (like/save) and negative (pass) signals on hand. Loaded on sign-in,
 * cleared on sign-out.
 */
interface InteractionsState {
  likedIds: string[];
  savedIds: string[];
  passedIds: string[];
  setLikedIds: (ids: string[]) => void;
  setLiked: (id: string, liked: boolean) => void;
  setSaved: (id: string, saved: boolean) => void;
  setPassed: (id: string) => void;
  reset: () => void;
}

const union = (ids: string[], id: string) => Array.from(new Set([...ids, id]));

export const useInteractionsStore = create<InteractionsState>((set) => ({
  likedIds: [],
  savedIds: [],
  passedIds: [],
  setLikedIds: (likedIds) => set({ likedIds }),
  setLiked: (id, liked) =>
    set((s) => ({ likedIds: liked ? union(s.likedIds, id) : s.likedIds.filter((x) => x !== id) })),
  setSaved: (id, saved) =>
    set((s) => ({ savedIds: saved ? union(s.savedIds, id) : s.savedIds.filter((x) => x !== id) })),
  setPassed: (id) => set((s) => ({ passedIds: union(s.passedIds, id) })),
  reset: () => set({ likedIds: [], savedIds: [], passedIds: [] }),
}));
