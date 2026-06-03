import type { Session as SbSession } from '@supabase/supabase-js';

import { supabase } from '@/core/supabase/client';
import type { AuthUser, Session } from '@/features/auth/domain/entities/auth-user';
import {
  AuthError,
  type AuthRepository,
  type OAuthProvider,
} from '@/features/auth/domain/ports/auth-repository';

function toSession(s: SbSession | null): Session | null {
  if (!s) return null;
  const user: AuthUser = {
    id: s.user.id,
    email: s.user.email ?? null,
    isAnonymous: Boolean(s.user.is_anonymous),
  };
  return { user, accessToken: s.access_token };
}

export class SupabaseAuthRepository implements AuthRepository {
  async signUpWithEmail(email: string, password: string): Promise<Session> {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      const taken = /registered|already/i.test(error.message);
      throw new AuthError(taken ? 'email_taken' : 'invalid_input', error.message);
    }
    const session = toSession(data.session);
    if (!session) {
      throw new AuthError('invalid_input', 'Revisá tu email para confirmar la cuenta.');
    }
    return session;
  }

  async signInWithEmail(email: string, password: string): Promise<Session> {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    // Generic on purpose (no user enumeration).
    if (error || !data.session) {
      throw new AuthError('invalid_credentials', 'Email o contraseña incorrectos');
    }
    return toSession(data.session)!;
  }

  async signInWithOAuth(_provider: OAuthProvider): Promise<Session> {
    throw new AuthError('invalid_input', 'OAuth todavía no está disponible.');
  }

  async signOut(): Promise<void> {
    await supabase.auth.signOut();
  }

  async getSession(): Promise<Session | null> {
    const { data } = await supabase.auth.getSession();
    return toSession(data.session);
  }
}
