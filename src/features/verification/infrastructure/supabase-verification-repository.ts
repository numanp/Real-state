import { supabase } from '@/core/supabase/client';
import type {
  BadgeRequest,
  BadgeState,
  BadgeType,
  RequestStatus,
} from '@/features/verification/domain/entities/badge';
import type { VerificationRepository } from '@/features/verification/domain/ports/verification-repository';

interface RawRequest {
  badge_type: BadgeType;
  status: RequestStatus;
  created_at: string;
  decided_at: string | null;
  reason: string | null;
}

function mapRequest(r: RawRequest | null | undefined): BadgeRequest | null {
  if (!r) return null;
  return {
    badgeType: r.badge_type,
    status: r.status,
    createdAt: r.created_at,
    decidedAt: r.decided_at ?? null,
    reason: r.reason ?? null,
  };
}

/**
 * Production verification adapter. Every write is a SECURITY DEFINER RPC — the
 * client has no table write path (see 0016). Reads use the self-scoped
 * get_my_badges and the public verified-only get_badges_for.
 */
export class SupabaseVerificationRepository implements VerificationRepository {
  async getMyState(): Promise<BadgeState> {
    const { data, error } = await supabase.rpc('get_my_badges');
    if (error) throw new Error(`verification.getMyState: ${error.message}`);
    const obj = (data ?? {}) as { badges?: BadgeType[]; request?: RawRequest | null };
    return { badges: obj.badges ?? [], request: mapRequest(obj.request) };
  }

  async getFor(subjectId: string): Promise<BadgeType[]> {
    const { data, error } = await supabase.rpc('get_badges_for', { p_subject: subjectId });
    if (error) throw new Error(`verification.getFor: ${error.message}`);
    return ((data ?? []) as { badge_type: BadgeType }[]).map((r) => r.badge_type);
  }

  async startKyc(badgeType: BadgeType): Promise<{ providerRef: string }> {
    const { data, error } = await supabase.rpc('start_kyc_verification', { p_badge_type: badgeType });
    if (error) throw new Error(`verification.startKyc: ${error.message}`);
    return { providerRef: (data as string) ?? '' };
  }

  async requestBadge(badgeType: BadgeType, providerRef?: string): Promise<BadgeRequest> {
    const { data, error } = await supabase.rpc('request_badge', {
      p_badge_type: badgeType,
      p_provider_ref: providerRef ?? null,
    });
    if (error) throw new Error(`verification.requestBadge: ${error.message}`);
    const row = Array.isArray(data) ? data[0] : data;
    const mapped = mapRequest(row as RawRequest);
    if (!mapped) throw new Error('verification.requestBadge: empty response');
    return mapped;
  }
}
