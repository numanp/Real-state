import { create } from 'zustand';

/**
 * Client snapshot of the current user's likes/saves so feed cards can reflect
 * state without each one fetching. Loaded on sign-in, cleared on sign-out.
 */
interface InteractionsState {
  likedIds: string[];
  savedIds: string[];
  setLikedIds: (ids: string[]) => void;
  setLiked: (id: string, liked: boolean) => void;
  setSaved: (id: string, saved: boolean) => void;
  reset: () => void;
}

export const useInteractionsStore = create<InteractionsState>((set) => ({
  likedIds: [],
  savedIds: [],
  setLikedIds: (likedIds) => set({ likedIds }),
  setLiked: (id, liked) =>
    set((s) => ({
      likedIds: liked
        ? Array.from(new Set([...s.likedIds, id]))
        : s.likedIds.filter((x) => x !== id),
    })),
  setSaved: (id, saved) =>
    set((s) => ({
      savedIds: saved
        ? Array.from(new Set([...s.savedIds, id]))
        : s.savedIds.filter((x) => x !== id),
    })),
  reset: () => set({ likedIds: [], savedIds: [] }),
}));
