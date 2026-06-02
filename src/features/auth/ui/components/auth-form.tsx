import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/shared/ui/primitives/button';
import { Input } from '@/shared/ui/primitives/input';
import { Text } from '@/shared/ui/primitives/text';

interface Props {
  mode: 'signin' | 'signup';
  busy?: boolean;
  error?: string | null;
  onSubmit: (email: string, password: string) => void;
}

/** Presentational email/password form shared by sign-in and sign-up. */
export function AuthForm({ mode, busy, error, onSubmit }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const label = mode === 'signin' ? 'Ingresar' : 'Crear cuenta';

  return (
    <View className="w-full gap-3">
      <Input
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        value={email}
        onChangeText={setEmail}
      />
      <Input
        placeholder="Contraseña"
        secureTextEntry
        autoComplete="password"
        value={password}
        onChangeText={setPassword}
      />
      {error ? <Text className="text-sm text-destructive">{error}</Text> : null}
      <Button
        label={busy ? 'Un momento…' : label}
        disabled={busy}
        onPress={() => onSubmit(email.trim(), password)}
      />
    </View>
  );
}
