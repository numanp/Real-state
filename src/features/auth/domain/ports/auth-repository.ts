import type { Session } from '@/features/auth/domain/entities/auth-user';

export type OAuthProvider = 'google' | 'apple';

export type AuthErrorCode =
  | 'invalid_input'
  | 'invalid_credentials'
  | 'email_taken'
  | 'confirmation_required';

/** Domain error. Login failures use the generic `invalid_credentials` for BOTH
 *  wrong password and unknown email, so the API can't be used to enumerate
 *  registered users (OWASP A07). */
export class AuthError extends Error {
  constructor(
    public readonly code: AuthErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'AuthError';
  }
}

/**
 * Domain PORT for identity. Implementations: InMemoryAuthRepository (fake, runs
 * the auth UX with no backend) and SupabaseAuthRepository (real, swapped via DI).
 */
export interface AuthRepository {
  signUpWithEmail(email: string, password: string): Promise<Session>;
  signInWithEmail(email: string, password: string): Promise<Session>;
  signInWithOAuth(provider: OAuthProvider): Promise<Session>;
  signOut(): Promise<void>;
  getSession(): Promise<Session | null>;
}
