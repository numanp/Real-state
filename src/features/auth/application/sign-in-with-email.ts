import { z } from 'zod';

import type { Session } from '@/features/auth/domain/entities/auth-user';
import { AuthError, type AuthRepository } from '@/features/auth/domain/ports/auth-repository';

// Login only checks presence — the GENERIC `invalid_credentials` is reused for
// empty input, wrong password, and unknown email so nothing leaks which part
// failed (no user enumeration, OWASP A07).
const schema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
});

export class SignInWithEmail {
  constructor(private readonly auth: AuthRepository) {}

  async execute(email: string, password: string): Promise<Session> {
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      throw new AuthError('invalid_credentials', 'Email o contraseña incorrectos');
    }
    return this.auth.signInWithEmail(parsed.data.email, parsed.data.password);
  }
}
