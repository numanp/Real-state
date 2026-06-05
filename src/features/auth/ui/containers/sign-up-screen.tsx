import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthError } from '@/features/auth/domain/ports/auth-repository';
import { AuthForm } from '@/features/auth/ui/components/auth-form';
import { useAuth } from '@/features/auth/ui/hooks/use-auth';
import { Text } from '@/shared/ui/primitives/text';

export function SignUpScreen() {
  const router = useRouter();
  const { signUp } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(email: string, password: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await signUp(email, password);
      router.replace('/');
    } catch (e) {
      // Email confirmation pending is a SUCCESS path (account created), not an
      // error — show it as a friendly notice instead of a red error.
      if (e instanceof AuthError && e.code === 'confirmation_required') {
        setNotice(e.message);
      } else {
        setError(e instanceof AuthError ? e.message : 'Algo salió mal. Probá de nuevo.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View className="flex-1 justify-center gap-6 bg-background px-6">
        <View className="gap-1">
          <Text className="text-3xl font-bold">Creá tu cuenta</Text>
          <Text className="text-muted-foreground">Gratis. Empezá a guardar lo que te gusta.</Text>
        </View>
        <AuthForm mode="signup" busy={busy} error={error} onSubmit={onSubmit} />
        {notice ? <Text className="text-sm font-medium text-primary">{notice}</Text> : null}
        <View className="flex-row gap-1">
          <Text className="text-muted-foreground">¿Ya tenés cuenta?</Text>
          <Link href="/sign-in">
            <Text className="font-semibold text-foreground">Ingresá</Text>
          </Link>
        </View>
      </View>
    </SafeAreaView>
  );
}
