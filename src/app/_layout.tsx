import '@/global.css';

import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { ActivityIndicator, useColorScheme, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useAuth } from '@/features/auth/ui/hooks/use-auth';
import { PushRegistrar } from '@/features/push/ui/components/push-registrar';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  // Bootstrap the session at the TRUE root so session/isReady resolve regardless
  // of the entry route — including a cold deep link straight to a guarded screen
  // (which would otherwise never run getSession()). Until the first getSession()
  // settles we render a neutral splash instead of any screen, so a guarded screen
  // can never flash "Ingresá" to a logged-in user.
  const { isReady } = useAuth();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          {isReady ? (
            <Stack screenOptions={{ headerShown: false }} />
          ) : (
            <View className="flex-1 items-center justify-center bg-background">
              <ActivityIndicator />
            </View>
          )}
          <PushRegistrar />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
