import type { AuthRepository } from '@/features/auth/domain/ports/auth-repository';

export class SignOut {
  constructor(private readonly auth: AuthRepository) {}

  execute(): Promise<void> {
    return this.auth.signOut();
  }
}
