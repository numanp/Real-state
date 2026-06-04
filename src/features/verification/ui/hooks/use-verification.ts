import { useCallback, useEffect } from 'react';

import { container } from '@/core/di/container';
import { useSessionStore } from '@/core/store/session-store';
import { useVerificationStore } from '@/core/store/verification-store';
import type { AccountKind, BadgeType } from '@/features/verification/domain/entities/badge';

/** Loads the user's verification state on sign-in and exposes the request action.
 *  A client can only REQUEST — granting is server-only. */
export function useVerification() {
  const session = useSessionStore((s) => s.session);
  const state = useVerificationStore((s) => s.state);
  const setState = useVerificationStore((s) => s.setState);
  const reset = useVerificationStore((s) => s.reset);

  const refresh = useCallback(async () => {
    if (!session) {
      reset();
      return;
    }
    setState(await container.verification.getMyState(session.user.id));
  }, [session, setState, reset]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const requestVerification = useCallback(
    async (accountKind: AccountKind, badgeType?: BadgeType) => {
      if (!session) return;
      await container.verification.requestVerification(accountKind, badgeType);
      await refresh();
    },
    [session, refresh],
  );

  return { state, refresh, requestVerification, isSignedIn: Boolean(session) };
}
