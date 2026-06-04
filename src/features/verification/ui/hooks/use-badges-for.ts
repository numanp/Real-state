import { useEffect, useState } from 'react';

import { container } from '@/core/di/container';
import { useVerificationStore } from '@/core/store/verification-store';
import type { BadgeType } from '@/features/verification/domain/entities/badge';

/** Verified badges for a given subject, for rendering a checkmark next to their
 *  name. Cached per subject in the verification store. */
export function useBadgesFor(subjectId: string | null | undefined): BadgeType[] {
  const cached = useVerificationStore((s) => (subjectId ? s.cache[subjectId] : undefined));
  const setFor = useVerificationStore((s) => s.setFor);
  const [badges, setBadges] = useState<BadgeType[]>(cached ?? []);

  useEffect(() => {
    let active = true;
    if (!subjectId) {
      setBadges([]);
      return;
    }
    if (cached) {
      setBadges(cached);
      return;
    }
    void container.verification
      .getFor(subjectId)
      .then((b) => {
        if (!active) return;
        setBadges(b);
        setFor(subjectId, b);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [subjectId, cached, setFor]);

  return badges;
}
