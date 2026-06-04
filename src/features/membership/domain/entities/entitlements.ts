export type Tier = 'free' | 'pro' | 'ultimate' | 'top';

/** The resolved entitlement set for the current user. `null` on a quota = unlimited. */
export interface EntitlementSnapshot {
  tier: Tier;
  swipesPerDay: number | null;
  maxFavorites: number | null;
  maxFolders: number | null;
  maxSavedSearches: number | null;
  rewind: boolean;
  noAds: boolean;
  savedSearchAlerts: boolean;
  prioritySupport: boolean;
  filtersGeoAmenity: string;
}

export const FREE_ENTITLEMENTS: EntitlementSnapshot = {
  tier: 'free',
  swipesPerDay: 30,
  maxFavorites: 10,
  maxFolders: 1,
  maxSavedSearches: 0,
  rewind: false,
  noAds: false,
  savedSearchAlerts: false,
  prioritySupport: false,
  filtersGeoAmenity: 'none',
};

export const ULTIMATE_ENTITLEMENTS: EntitlementSnapshot = {
  tier: 'ultimate',
  swipesPerDay: null,
  maxFavorites: null,
  maxFolders: null,
  maxSavedSearches: null,
  rewind: true,
  noAds: true,
  savedSearchAlerts: true,
  prioritySupport: true,
  filtersGeoAmenity: 'all',
};

export interface TrialResult {
  eligible: boolean;
  trialEndsAt: string | null;
  reason: string | null;
}
