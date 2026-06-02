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

/** Synchronous client snapshot of the auth session (the server source of truth
 *  stays in Supabase). Guards/UI select from here without re-fetching. */
export const useSessionStore = create<SessionState>((set) => ({
  session: null,
  isReady: false,
  setSession: (session) => set({ session }),
  setReady: (isReady) => set({ isReady }),
}));
