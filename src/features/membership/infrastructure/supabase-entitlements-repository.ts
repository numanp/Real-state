import { supabase } from '@/core/supabase/client';
import {
  type EntitlementSnapshot,
  FREE_ENTITLEMENTS,
  type Tier,
  type TrialResult,
} from '@/features/membership/domain/entities/entitlements';
import type { EntitlementsRepository } from '@/features/membership/domain/ports/entitlements-repository';

interface EntRow {
  key: string;
  kind: string;
  enabled: boolean;
  limit_int: number | null;
  is_unlimited: boolean;
  level_value: string | null;
}

function mapRows(rows: EntRow[], tier: Tier): EntitlementSnapshot {
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const quota = (k: string): number | null => {
    const r = byKey.get(k);
    if (!r) return 0;
    return r.is_unlimited ? null : (r.limit_int ?? 0);
  };
  const bool = (k: string) => byKey.get(k)?.enabled ?? false;
  const level = (k: string) => byKey.get(k)?.level_value ?? 'none';
  return {
    tier,
    swipesPerDay: quota('swipes_per_day'),
    maxFavorites: quota('max_favorites'),
    maxFolders: quota('max_folders'),
    maxSavedSearches: quota('max_saved_searches'),
    rewind: bool('rewind'),
    noAds: bool('no_ads'),
    savedSearchAlerts: bool('saved_search_alerts'),
    prioritySupport: bool('priority_support'),
    filtersGeoAmenity: level('filters_geo_amenity'),
  };
}

export class SupabaseEntitlementsRepository implements EntitlementsRepository {
  async getMine(_userId: string): Promise<EntitlementSnapshot> {
    const [{ data: rows, error }, { data: sub }] = await Promise.all([
      supabase.rpc('get_my_entitlements'),
      supabase.from('subscriptions').select('tier').maybeSingle(),
    ]);
    if (error) throw new Error(`entitlements.getMine: ${error.message}`);
    const tier = (sub?.tier as Tier) ?? 'free';
    return rows ? mapRows(rows as EntRow[], tier) : { ...FREE_ENTITLEMENTS, tier };
  }

  async startUltimateTrial(fingerprint: string): Promise<TrialResult> {
    const { data, error } = await supabase.rpc('start_ultimate_trial', {
      p_identity_fingerprint: fingerprint,
      p_device_fingerprint: fingerprint,
    });
    if (error) throw new Error(`entitlements.trial: ${error.message}`);
    const row = Array.isArray(data) ? data[0] : data;
    return {
      eligible: Boolean(row?.eligible),
      trialEndsAt: row?.trial_ends_at ?? null,
      reason: row?.reason ?? null,
    };
  }
}
