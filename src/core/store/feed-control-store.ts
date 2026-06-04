import { create } from 'zustand';

/**
 * Imperative feed navigation shared between the list (which owns the FlashList
 * ref) and the action rail (pass/super-like/rewind advance or rewind the feed).
 * Read via getState() inside callbacks — NOT as a reactive selector — so cards
 * don't re-render on every scroll.
 */
interface FeedControlState {
  activeIndex: number;
  count: number;
  scrollToIndex: ((index: number) => void) | null;
  setActiveIndex: (index: number) => void;
  setCount: (count: number) => void;
  setScroller: (fn: ((index: number) => void) | null) => void;
}

export const useFeedControlStore = create<FeedControlState>((set) => ({
  activeIndex: 0,
  count: 0,
  scrollToIndex: null,
  setActiveIndex: (activeIndex) => set({ activeIndex }),
  setCount: (count) => set({ count }),
  setScroller: (scrollToIndex) => set({ scrollToIndex }),
}));
