import { create } from 'zustand';

import type { FeedFilters } from '@/features/feed/domain/ports/feed-repository';

interface FiltersState {
  filters: FeedFilters;
  setFilters: (filters: FeedFilters) => void;
  reset: () => void;
}

const EMPTY: FeedFilters = {};

/** Active feed filters. A stable object reference (only replaced by setFilters)
 *  so the feed reloads exactly when filters actually change. */
export const useFiltersStore = create<FiltersState>((set) => ({
  filters: EMPTY,
  setFilters: (filters) => set({ filters }),
  reset: () => set({ filters: EMPTY }),
}));

export function countActiveFilters(filters: FeedFilters): number {
  return Object.values(filters).filter((v) => v !== undefined && v !== '').length;
}
