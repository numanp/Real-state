import type { AuthUser, Session } from '@/features/auth/domain/entities/auth-user';
import {
  AuthError,
  type AuthRepository,
  type OAuthProvider,
} from '@/features/auth/domain/ports/auth-repository';

interface StoredUser {
  id: string;
  email: string;
  password: string;
}

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

/**
 * Fake AuthRepository — runs the whole auth UX with NO backend. Mirrors the
 * contract (generic login errors, case-insensitive email) so the real
 * SupabaseAuthRepository drops in via DI without UI changes.
 */
export class InMemoryAuthRepository implements AuthRepository {
  private readonly users = new Map<string, StoredUser>();
  private session: Session | null = null;

  async signUpWithEmail(email: string, password: string): Promise<Session> {
    const key = email.toLowerCase();
    if (this.users.has(key)) {
      throw new AuthError('email_taken', 'Ese email ya está registrado');
    }
    const user: StoredUser = { id: nextId('user'), email, password };
    this.users.set(key, user);
    return this.openSession(user);
  }

  async signInWithEmail(email: string, password: string): Promise<Session> {
    const stored = this.users.get(email.toLowerCase());
    // SAME error whether the email is unknown or the password is wrong.
    if (!stored || stored.password !== password) {
      throw new AuthError('invalid_credentials', 'Email o contraseña incorrectos');
    }
    return this.openSession(stored);
  }

  async signInWithOAuth(provider: OAuthProvider): Promise<Session> {
    const email = `${provider}@example.com`;
    const key = email.toLowerCase();
    let stored = this.users.get(key);
    if (!stored) {
      stored = { id: nextId('user'), email, password: '' };
      this.users.set(key, stored);
    }
    return this.openSession(stored);
  }

  async signOut(): Promise<void> {
    this.session = null;
  }

  async getSession(): Promise<Session | null> {
    return this.session;
  }

  private openSession(stored: StoredUser): Session {
    const user: AuthUser = { id: stored.id, email: stored.email, isAnonymous: false };
    this.session = { user, accessToken: nextId('token') };
    return this.session;
  }
}
