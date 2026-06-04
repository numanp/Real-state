import { create } from 'zustand';

import {
  type EntitlementSnapshot,
  FREE_ENTITLEMENTS,
} from '@/features/membership/domain/entities/entitlements';

/** Client snapshot of the user's server-resolved entitlements. Gates read this
 *  via getState() (imperative) so cards don't re-render on changes. */
interface EntitlementsState {
  entitlements: EntitlementSnapshot;
  setEntitlements: (e: EntitlementSnapshot) => void;
  reset: () => void;
}

export const useEntitlementsStore = create<EntitlementsState>((set) => ({
  entitlements: FREE_ENTITLEMENTS,
  setEntitlements: (entitlements) => set({ entitlements }),
  reset: () => set({ entitlements: FREE_ENTITLEMENTS }),
}));
