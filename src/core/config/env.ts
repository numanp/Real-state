import { z } from 'zod';

/*
  Public runtime config. Only EXPO_PUBLIC_* variables are inlined into the app
  bundle, and they are PUBLIC by design — NEVER put a secret here.

  The Supabase anon key is safe to ship: authorization is enforced by Postgres
  RLS, not by this client. The service_role key must NEVER appear in env, code,
  or any client artifact.

  Tolerant on purpose: when credentials are absent we DON'T crash — the app runs
  on the in-memory mock repositories (see core/di/container). `isSupabaseConfigured`
  flips the app onto the real backend once a real .env is present.
*/
const PLACEHOLDER_URL = 'https://placeholder.supabase.co';

const schema = z.object({
  EXPO_PUBLIC_SUPABASE_URL: z.string().url(),
  EXPO_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

const parsed = schema.safeParse({
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
});

export const env = parsed.success
  ? parsed.data
  : { EXPO_PUBLIC_SUPABASE_URL: PLACEHOLDER_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY: 'anon-placeholder' };

/** True only when real Supabase credentials are present (not the placeholder). */
export const isSupabaseConfigured =
  parsed.success && parsed.data.EXPO_PUBLIC_SUPABASE_URL !== PLACEHOLDER_URL;
