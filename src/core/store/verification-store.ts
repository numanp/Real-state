import { create } from 'zustand';

import {
  type BadgeState,
  type BadgeType,
  NO_BADGES,
} from '@/features/verification/domain/entities/badge';

/** Client snapshot of the user's own verification state, plus a small cache of
 *  other subjects' verified badges (for rendering a checkmark next to a name). */
interface VerificationStoreState {
  state: BadgeState;
  cache: Record<string, BadgeType[]>;
  setState: (s: BadgeState) => void;
  setFor: (subjectId: string, badges: BadgeType[]) => void;
  reset: () => void;
}

export const useVerificationStore = create<VerificationStoreState>((set) => ({
  state: NO_BADGES,
  cache: {},
  setState: (state) => set({ state }),
  setFor: (subjectId, badges) => set((s) => ({ cache: { ...s.cache, [subjectId]: badges } })),
  reset: () => set({ state: NO_BADGES, cache: {} }),
}));
