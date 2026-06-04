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
  // Short-lived dedup: screens that each call getMine() on mount (feed,
  // membership) share one in-flight/recent result instead of refetching the
  // same entitlements. Caches the PROMISE so concurrent callers also coalesce.
  // Invalidated on writes (startUltimateTrial).
  private static readonly TTL_MS = 10_000;
  private cache: { userId: string; at: number; value: Promise<EntitlementSnapshot> } | null = null;

  async getMine(userId: string): Promise<EntitlementSnapshot> {
    const c = this.cache;
    if (c && c.userId === userId && Date.now() - c.at < SupabaseEntitlementsRepository.TTL_MS) {
      return c.value;
    }
    const value = this.fetchMine();
    this.cache = { userId, at: Date.now(), value };
    // Don't cache a rejection — drop it so the next call retries.
    void value.catch(() => {
      if (this.cache?.value === value) this.cache = null;
    });
    return value;
  }

  private async fetchMine(): Promise<EntitlementSnapshot> {
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
    // Invalidate AFTER the trial commits, so a getMine() that raced the RPC and
    // cached pre-trial data can't be served stale by the follow-up refresh().
    this.cache = null;
    const row = Array.isArray(data) ? data[0] : data;
    return {
      eligible: Boolean(row?.eligible),
      trialEndsAt: row?.trial_ends_at ?? null,
      reason: row?.reason ?? null,
    };
  }
}
