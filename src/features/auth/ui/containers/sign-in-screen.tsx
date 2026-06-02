import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthError } from '@/features/auth/domain/ports/auth-repository';
import { AuthForm } from '@/features/auth/ui/components/auth-form';
import { useAuth } from '@/features/auth/ui/hooks/use-auth';
import { Text } from '@/shared/ui/primitives/text';

export function SignInScreen() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(email: string, password: string) {
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
      router.replace('/');
    } catch (e) {
      setError(e instanceof AuthError ? e.message : 'Algo salió mal. Probá de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View className="flex-1 justify-center gap-6 bg-background px-6">
        <View className="gap-1">
          <Text className="text-3xl font-bold">Ingresá</Text>
          <Text className="text-muted-foreground">
            Para guardar propiedades y armar tus carpetas.
          </Text>
        </View>
        <AuthForm mode="signin" busy={busy} error={error} onSubmit={onSubmit} />
        <View className="flex-row gap-1">
          <Text className="text-muted-foreground">¿No tenés cuenta?</Text>
          <Link href="/sign-up">
            <Text className="font-semibold text-foreground">Creá una</Text>
          </Link>
        </View>
      </View>
    </SafeAreaView>
  );
}
