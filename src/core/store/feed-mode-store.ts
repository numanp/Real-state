import { create } from 'zustand';

export type FeedMode = 'recent' | 'forYou';

interface FeedModeState {
  mode: FeedMode;
  setMode: (mode: FeedMode) => void;
}

export const useFeedModeStore = create<FeedModeState>((set) => ({
  mode: 'recent',
  setMode: (mode) => set({ mode }),
}));
