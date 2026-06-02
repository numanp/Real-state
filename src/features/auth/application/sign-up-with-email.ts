import { z } from 'zod';

import type { Session } from '@/features/auth/domain/entities/auth-user';
import { AuthError, type AuthRepository } from '@/features/auth/domain/ports/auth-repository';

// Boundary validation (OWASP A03). Password floor kept here so the rule is
// testable and enforced before any repository/network call.
const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export class SignUpWithEmail {
  constructor(private readonly auth: AuthRepository) {}

  async execute(email: string, password: string): Promise<Session> {
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      throw new AuthError('invalid_input', 'Revisá el email y que la contraseña tenga 8+ caracteres');
    }
    return this.auth.signUpWithEmail(parsed.data.email, parsed.data.password);
  }
}
