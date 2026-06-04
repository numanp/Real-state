import { BadgeCheck } from 'lucide-react-native';

import type { BadgeType } from '@/features/verification/domain/entities/badge';

// Single Meta/X-style checkmark. The KIND only changes the color + explainer
// copy, never a second visual or any capability gate (badge is trust-only).
const COLORS: Record<BadgeType, string> = {
  identity: '#1d9bf0', // identity-verified (X blue)
  agency: '#e2b340', // business / agency (gold)
};

/** The displayed badge when a subject holds several (agency outranks identity). */
export function pickBadge(badges: BadgeType[]): BadgeType | null {
  if (badges.includes('agency')) return 'agency';
  if (badges.includes('identity')) return 'identity';
  return null;
}

export function VerifiedBadge({ type, size = 16 }: { type: BadgeType; size?: number }) {
  return <BadgeCheck size={size} color={COLORS[type]} />;
}

/** Renders the best badge for a list, or nothing if unverified. */
export function VerifiedBadgeFor({ badges, size }: { badges: BadgeType[]; size?: number }) {
  const best = pickBadge(badges);
  return best ? <VerifiedBadge type={best} size={size} /> : null;
}
