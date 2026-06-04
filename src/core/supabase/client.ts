import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { env } from '@/core/config/env';
import { createChunkedStore } from '@/core/supabase/chunked-store';

/*
  Native session storage backed by the OS keychain/keystore (expo-secure-store).
  NEVER AsyncStorage for auth tokens — that stores them in plaintext.

  SecureStore caps a value at ~2KB and a Supabase JWT/session can exceed that
  (custom claims, long emails), so we wrap it in a chunking adapter that splits
  large values across keys and reassembles them on read — otherwise the write
  fails silently on iOS / crashes on Android.
*/
const SecureStoreAdapter = createChunkedStore({
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  removeItem: (key) => SecureStore.deleteItemAsync(key),
});

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
