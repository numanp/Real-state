import { useRouter } from 'expo-router';
import { Check } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useEntitlements } from '@/features/membership/ui/hooks/use-entitlements';
import { cn } from '@/shared/ui/lib/cn';
import { Button } from '@/shared/ui/primitives/button';
import { Text } from '@/shared/ui/primitives/text';

interface TierCard {
  tier: string;
  name: string;
  price: string;
  perks: string[];
  highlight?: boolean;
}

const TIERS: TierCard[] = [
  { tier: 'free', name: 'Free', price: 'Gratis', perks: ['30 swipes por día', '10 favoritos', '1 carpeta', 'Filtros básicos'] },
  { tier: 'pro', name: 'Pro', price: 'mensual', perks: ['150 swipes/día', '100 favoritos', '5 carpetas', 'Rewind', 'Sin publicidad', 'Alertas de búsqueda'] },
  { tier: 'ultimate', name: 'Ultimate', price: 'mensual', highlight: true, perks: ['Todo ilimitado', 'Rewind + Super-like', 'Filtros avanzados', 'Datos premium del agente', 'Soporte prioritario'] },
  { tier: 'top', name: 'Top', price: 'pago único', perks: ['Todo lo de Ultimate', 'Para siempre (lifetime)', 'Badge exclusivo'] },
];

export function MembershipScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { entitlements, startTrial } = useEntitlements();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onTrial() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await startTrial();
      setMessage(
        result.eligible
          ? '🎉 ¡Trial de Ultimate activado por 15 días!'
          : `No disponible: ${result.reason ?? 'ya usaste el trial'}`,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }}
    >
      <View className="flex-row items-center justify-between px-5 pb-2">
        <Text className="text-2xl font-bold">Membresías</Text>
        <Button label="‹ Volver" variant="secondary" size="sm" onPress={() => router.back()} />
      </View>
      <Text className="px-5 pb-3 text-sm text-muted-foreground">
        Tu plan actual:{' '}
        <Text className="font-bold text-foreground">{entitlements.tier.toUpperCase()}</Text>
      </Text>

      <View className="gap-3 px-5">
        {TIERS.map((t) => (
          <View
            key={t.tier}
            className={cn(
              'gap-2 rounded-2xl border p-4',
              t.highlight ? 'border-primary' : 'border-border',
              entitlements.tier === t.tier && 'bg-secondary',
            )}
          >
            <View className="flex-row items-center justify-between">
              <Text className="text-lg font-bold">{t.name}</Text>
              <Text className="text-sm text-muted-foreground">{t.price}</Text>
            </View>
            {t.perks.map((p) => (
              <View key={p} className="flex-row items-center gap-2">
                <Check size={16} color="#16a34a" />
                <Text className="text-sm">{p}</Text>
              </View>
            ))}
            {entitlements.tier === t.tier ? (
              <View className="self-start rounded-full bg-primary px-3 py-1">
                <Text className="text-xs font-semibold text-primary-foreground">Tu plan</Text>
              </View>
            ) : null}
          </View>
        ))}
      </View>

      <View className="gap-2 px-5 pt-5">
        <Button
          label={busy ? 'Activando…' : 'Probar Ultimate 15 días gratis'}
          disabled={busy}
          onPress={onTrial}
        />
        {message ? <Text className="text-center text-sm">{message}</Text> : null}
        <Text className="pt-2 text-center text-xs text-muted-foreground">
          El cobro real (RevenueCat: App Store / Google Play / web) se activa en el build nativo. Las
          cuotas ya se aplican server-side por tier en la DB.
        </Text>
      </View>
    </ScrollView>
  );
}
