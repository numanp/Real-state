import { useCallback, useEffect } from 'react';

import { container } from '@/core/di/container';
import { useSessionStore } from '@/core/store/session-store';

/**
 * The UI's single entry point to auth. Calls the use-cases (via DI) and mirrors
 * the resulting session into the synchronous session store. Swapping the
 * in-memory repo for Supabase in the container changes nothing here.
 */
export function useAuth() {
  const session = useSessionStore((s) => s.session);
  const isReady = useSessionStore((s) => s.isReady);
  const setSession = useSessionStore((s) => s.setSession);
  const setReady = useSessionStore((s) => s.setReady);

  useEffect(() => {
    let active = true;
    void container.auth.repository.getSession().then((current) => {
      if (!active) return;
      setSession(current);
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, [setSession, setReady]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      setSession(await container.auth.signIn.execute(email, password));
    },
    [setSession],
  );

  const signUp = useCallback(
    async (email: string, password: string) => {
      setSession(await container.auth.signUp.execute(email, password));
    },
    [setSession],
  );

  const signOut = useCallback(async () => {
    await container.auth.signOut.execute();
    setSession(null);
  }, [setSession]);

  return {
    session,
    isReady,
    isAuthenticated: session !== null,
    signIn,
    signUp,
    signOut,
  };
}
