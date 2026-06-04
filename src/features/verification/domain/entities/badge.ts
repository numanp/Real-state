/** Verification badge domain — pure data shapes + eligibility rules. Mirrors
 *  the server enums (0014) and badge_matches_kind (0015). No behavior beyond
 *  the two pure rule helpers. */

export type BadgeType = 'identity' | 'agency';
export type AccountKind = 'person' | 'agency';
export type BadgeStatus = 'pending' | 'verified' | 'revoked';
export type RequestStatus = 'pending' | 'approved' | 'rejected';
export type VerificationMethod = 'kyc' | 'license' | 'manual';

export interface BadgeRequest {
  badgeType: BadgeType;
  status: RequestStatus;
  createdAt: string;
  decidedAt: string | null;
  reason: string | null;
}

export interface BadgeState {
  badges: BadgeType[];
  request: BadgeRequest | null;
}

/** Empty snapshot — the default for a signed-out or unverified user. */
export const NO_BADGES: BadgeState = { badges: [], request: null };

/** The badge a given account kind is eligible to request. */
export function badgeForKind(kind: AccountKind): BadgeType {
  return kind === 'agency' ? 'agency' : 'identity';
}

/** Mirrors the server rule (identity↔person, agency↔agency). Re-enforced in
 *  request_badge() — this is a UX guard, not the security boundary. */
export function badgeMatchesKind(badge: BadgeType, kind: AccountKind): boolean {
  return (badge === 'identity' && kind === 'person') || (badge === 'agency' && kind === 'agency');
}
