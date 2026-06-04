import { create } from 'zustand';

export const MAX_COMPARE = 3;

/** Selection of properties to compare (cap 3). Lives in a store so the pick
 *  persists across the Saved grid and the Compare screen. */
interface CompareState {
  selectedIds: string[];
  toggle: (id: string) => void;
  clear: () => void;
}

export const useCompareStore = create<CompareState>((set) => ({
  selectedIds: [],
  toggle: (id) =>
    set((s) => {
      if (s.selectedIds.includes(id)) {
        return { selectedIds: s.selectedIds.filter((x) => x !== id) };
      }
      if (s.selectedIds.length >= MAX_COMPARE) return s; // cap — ignore extra picks
      return { selectedIds: [...s.selectedIds, id] };
    }),
  clear: () => set({ selectedIds: [] }),
}));
