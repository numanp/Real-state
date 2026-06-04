import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { container } from '@/core/di/container';
import { useSessionStore } from '@/core/store/session-store';

/**
 * On sign-in (native only), asks for notification permission, resolves the Expo
 * push token and registers it server-side (register_push_token RPC). Everything
 * is best-effort: web, denied permission, Expo Go (no token) or a missing EAS
 * projectId all no-op. A real token needs a native dev build + an Expo project.
 */
export function usePushRegistration(): void {
  const session = useSessionStore((s) => s.session);

  useEffect(() => {
    if (!session || Platform.OS === 'web') return;
    let active = true;

    void (async () => {
      try {
        let { status } = await Notifications.getPermissionsAsync();
        if (status !== 'granted') {
          status = (await Notifications.requestPermissionsAsync()).status;
        }
        if (!active || status !== 'granted') return;

        const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
        const { data: token } = await Notifications.getExpoPushTokenAsync(
          projectId ? { projectId } : undefined,
        );
        if (!active || !token) return;

        await container.push.register(token, Platform.OS === 'ios' ? 'ios' : 'android');
      } catch {
        // No token in Expo Go / missing projectId / permission denied → skip.
      }
    })();

    return () => {
      active = false;
    };
  }, [session]);
}
