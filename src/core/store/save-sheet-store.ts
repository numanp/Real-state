import { create } from 'zustand';

/**
 * Which property's SaveSheet is open. The sheet itself is hoisted to a SINGLE
 * instance at the feed screen (SaveSheetHost) instead of one Modal per card —
 * cards just call open(propertyId). null = closed.
 */
interface SaveSheetState {
  propertyId: string | null;
  open: (propertyId: string) => void;
  close: () => void;
}

export const useSaveSheetStore = create<SaveSheetState>((set) => ({
  propertyId: null,
  open: (propertyId) => set({ propertyId }),
  close: () => set({ propertyId: null }),
}));
