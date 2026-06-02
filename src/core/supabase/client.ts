import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { env } from '@/core/config/env';

/*
  Native session storage backed by the OS keychain/keystore (expo-secure-store).
  NEVER AsyncStorage for auth tokens — that stores them in plaintext.

  NOTE: SecureStore values are capped at ~2KB. A Supabase session can exceed that
  once issued, so M2 (auth) will swap this for a chunking adapter. Fine for now
  because no session is written until auth is wired.
*/
const SecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

const isWeb = Platform.OS === 'web';

/*
  The ONE place @supabase/supabase-js is imported. Every other layer talks to
  Supabase through repository adapters that depend on domain ports — never on
  this module directly.

  The anon key is public; authorization lives entirely in Postgres RLS.
*/
export const supabase = createClient(
  env.EXPO_PUBLIC_SUPABASE_URL,
  env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  {
    auth: {
      storage: isWeb ? undefined : SecureStoreAdapter,
      autoRefreshToken: true,
      persistSession: true,
      // Web OAuth redirects carry the session in the URL; native uses deep links.
      detectSessionInUrl: isWeb,
    },
  },
);
