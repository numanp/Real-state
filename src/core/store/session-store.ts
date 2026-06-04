import { create } from 'zustand';

import type { Session } from '@/features/auth/domain/entities/auth-user';

interface SessionState {
  session: Session | null;
  /** False until the first getSession() resolves — route guards read this to
   *  avoid redirect flashes before auth state is known. */
  isReady: boolean;
  setSession: (session: Session | null) => void;
  setReady: (isReady: boolean) => void;
}

/** Value equality across every Session field, regardless of object identity —
 *  so a token refresh OR an anon→authenticated / email change still updates. */
function sameSession(a: Session | null, b: Session | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.user.id === b.user.id &&
    a.user.email === b.user.email &&
    a.user.isAnonymous === b.user.isAnonymous &&
    a.accessToken === b.accessToken
  );
}

/** Synchronous client snapshot of the auth session (the server source of truth
 *  stays in Supabase). Guards/UI select from here without re-fetching. */
export const useSessionStore = create<SessionState>((set) => ({
  session: null,
  isReady: false,
  // Idempotent: getSession() builds a NEW Session object on every screen mount,
  // so without this guard the reference churns and every useEffect([session])
  // (favorites/entitlements refetch) re-runs. Skip the update when equivalent.
  setSession: (session) => set((s) => (sameSession(s.session, session) ? {} : { session })),
  setReady: (isReady) => set({ isReady }),
}));
