import { create } from 'zustand';

/**
 * Presentational state for the reel feed. Holds the global mute toggle shared by
 * every card's video player: autoplay starts MUTED (platform autoplay policy +
 * least-surprise in a public space), and the mute control flips it for all cards
 * at once. Read via a selector (`useFeedUiStore((s) => s.muted)`) so toggling
 * doesn't re-render the whole list — only the players bound to `muted`.
 */
interface FeedUiState {
  muted: boolean;
  toggleMuted: () => void;
  setMuted: (muted: boolean) => void;
}

export const useFeedUiStore = create<FeedUiState>((set) => ({
  muted: true,
  toggleMuted: () => set((s) => ({ muted: !s.muted })),
  setMuted: (muted) => set({ muted }),
}));
