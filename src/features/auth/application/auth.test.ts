import { describe, expect, it } from 'vitest';

import { SignInWithEmail } from '@/features/auth/application/sign-in-with-email';
import { SignOut } from '@/features/auth/application/sign-out';
import { SignUpWithEmail } from '@/features/auth/application/sign-up-with-email';
import { InMemoryAuthRepository } from '@/features/auth/infrastructure/in-memory-auth-repository';

function setup() {
  const repo = new InMemoryAuthRepository();
  return {
    repo,
    signUp: new SignUpWithEmail(repo),
    signIn: new SignInWithEmail(repo),
    signOut: new SignOut(repo),
  };
}

describe('auth (email)', () => {
  it('signs up and opens a session', async () => {
    const { repo, signUp } = setup();
    const session = await signUp.execute('a@b.com', 'password1');
    expect(session.user.email).toBe('a@b.com');
    expect(session.user.isAnonymous).toBe(false);
    expect(await repo.getSession()).toEqual(session);
  });

  it('rejects a weak password before touching the repository', async () => {
    const { signUp } = setup();
    await expect(signUp.execute('a@b.com', 'short')).rejects.toMatchObject({ code: 'invalid_input' });
  });

  it('rejects a duplicate email (case-insensitive)', async () => {
    const { signUp } = setup();
    await signUp.execute('a@b.com', 'password1');
    await expect(signUp.execute('A@B.com', 'password2')).rejects.toMatchObject({
      code: 'email_taken',
    });
  });

  it('signs in with correct credentials', async () => {
    const { signUp, signIn } = setup();
    await signUp.execute('a@b.com', 'password1');
    const session = await signIn.execute('a@b.com', 'password1');
    expect(session.user.email).toBe('a@b.com');
  });

  it('returns a GENERIC error for wrong password AND unknown email (no enumeration)', async () => {
    const { signUp, signIn } = setup();
    await signUp.execute('a@b.com', 'password1');
    await expect(signIn.execute('a@b.com', 'wrong')).rejects.toMatchObject({
      code: 'invalid_credentials',
    });
    await expect(signIn.execute('nobody@b.com', 'password1')).rejects.toMatchObject({
      code: 'invalid_credentials',
    });
  });

  it('signs out and clears the session', async () => {
    const { repo, signUp, signOut } = setup();
    await signUp.execute('a@b.com', 'password1');
    await signOut.execute();
    expect(await repo.getSession()).toBeNull();
  });
});
