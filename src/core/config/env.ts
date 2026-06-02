import { z } from 'zod';

/*
  Public runtime config. Only EXPO_PUBLIC_* variables are inlined into the app
  bundle, and they are PUBLIC by design — NEVER put a secret here.

  The Supabase anon key is safe to ship: authorization is enforced by Postgres
  RLS, not by this client. The service_role key must NEVER appear in env, code,
  or any client artifact.
*/
const schema = z.object({
  EXPO_PUBLIC_SUPABASE_URL: z.string().url(),
  EXPO_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

const parsed = schema.safeParse({
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
});

if (!parsed.success) {
  // Fail fast and loud: a half-configured client must not boot silently.
  const detail = parsed.error.issues
    .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  throw new Error(`Invalid environment configuration:\n${detail}`);
}

export const env = parsed.data;
