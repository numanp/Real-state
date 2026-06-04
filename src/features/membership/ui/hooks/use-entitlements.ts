import { useCallback, useEffect } from 'react';

import { container } from '@/core/di/container';
import { useEntitlementsStore } from '@/core/store/entitlements-store';
import { useSessionStore } from '@/core/store/session-store';

/** Loads the user's entitlements into the store on sign-in, exposes a refresh,
 *  and the trial action. The trial fingerprint is the user id (per-user once)
 *  for this build; production would use a real device fingerprint. */
export function useEntitlements() {
  const session = useSessionStore((s) => s.session);
  const entitlements = useEntitlementsStore((s) => s.entitlements);
  const setEntitlements = useEntitlementsStore((s) => s.setEntitlements);
  const reset = useEntitlementsStore((s) => s.reset);

  const refresh = useCallback(async () => {
    if (!session) {
      reset();
      return;
    }
    setEntitlements(await container.entitlements.getMine(session.user.id));
  }, [session, setEntitlements, reset]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const startTrial = useCallback(async () => {
    if (!session) return { eligible: false, trialEndsAt: null, reason: 'no_session' };
    const result = await container.entitlements.startUltimateTrial(session.user.id);
    await refresh();
    return result;
  }, [session, refresh]);

  return { entitlements, refresh, startTrial };
}
