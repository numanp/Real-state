import { useRouter } from 'expo-router';
import { ShieldCheck } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { BadgeType } from '@/features/verification/domain/entities/badge';
import {
  VerifiedBadge,
  pickBadge,
} from '@/features/verification/ui/components/verified-badge';
import { useVerification } from '@/features/verification/ui/hooks/use-verification';
import { cn } from '@/shared/ui/lib/cn';
import { Button } from '@/shared/ui/primitives/button';
import { Text } from '@/shared/ui/primitives/text';

const BADGE_LABEL: Record<BadgeType, string> = {
  identity: 'Identidad verificada',
  agency: 'Inmobiliaria verificada',
};

export function VerificationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { state, requestVerification, isSignedIn } = useVerification();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const badge = pickBadge(state.badges);
  const request = state.request;

  async function onRequest() {
    setBusy(true);
    setMessage(null);
    try {
      // Identity path for the demo. Agency licence review runs out-of-band
      // (service_role) — the account-kind machinery is DB-verified.
      await requestVerification('person');
      setMessage('Listo: tu verificación quedó en revisión.');
    } catch (e) {
      setMessage(`No se pudo iniciar: ${(e as Error).message}`);
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
        <Text className="text-2xl font-bold">Verificación</Text>
        <Button label="‹ Volver" variant="secondary" size="sm" onPress={() => router.back()} />
      </View>

      {!isSignedIn ? (
        <View className="gap-3 px-5 pt-4">
          <Text className="text-sm text-muted-foreground">
            Iniciá sesión para verificar tu cuenta.
          </Text>
          <Button label="Iniciar sesión" onPress={() => router.push('/sign-in')} />
        </View>
      ) : (
        <View className="gap-4 px-5 pt-2">
          {/* Current status */}
          {badge ? (
            <View className="flex-row items-center gap-3 rounded-2xl border border-primary bg-secondary p-4">
              <VerifiedBadge type={badge} size={28} />
              <View className="flex-1">
                <Text className="text-lg font-bold">{BADGE_LABEL[badge]}</Text>
                <Text className="text-sm text-muted-foreground">
                  Tu cuenta muestra el badge junto a tu nombre.
                </Text>
              </View>
            </View>
          ) : request?.status === 'pending' ? (
            <StatusCard
              tone="pending"
              title="En revisión"
              body="Tu solicitud está siendo verificada. Te avisamos cuando esté lista."
            />
          ) : request?.status === 'rejected' ? (
            <StatusCard
              tone="rejected"
              title="No aprobada"
              body={request.reason ?? 'No pudimos verificar tu identidad. Podés volver a intentar.'}
            />
          ) : (
            <View className="flex-row items-center gap-3 rounded-2xl border border-border p-4">
              <ShieldCheck size={28} color="#1d9bf0" />
              <Text className="flex-1 text-sm text-muted-foreground">
                Verificá tu identidad para ganar confianza: tu nombre lleva un badge azul.
              </Text>
            </View>
          )}

          {/* How it works */}
          <View className="gap-2 rounded-2xl border border-border p-4">
            <Text className="font-semibold">Cómo funciona</Text>
            <Bullet text="Validás tu identidad con un proveedor de KYC." />
            <Bullet text="Nunca guardamos tus documentos: solo el resultado." />
            <Bullet text="El badge lo otorga el servidor; nadie puede auto-verificarse." />
          </View>

          {/* CTA */}
          {!badge && request?.status !== 'pending' ? (
            <Button
              label={busy ? 'Iniciando…' : request ? 'Volver a intentar' : 'Verificar mi identidad'}
              disabled={busy}
              onPress={onRequest}
            />
          ) : null}
          {message ? <Text className="text-center text-sm">{message}</Text> : null}

          <Text className="pt-1 text-center text-xs text-muted-foreground">
            La integración con el proveedor de KYC se conecta vía Edge Function (webhook firmado). El
            badge se otorga server-side.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

function StatusCard({
  tone,
  title,
  body,
}: {
  tone: 'pending' | 'rejected';
  title: string;
  body: string;
}) {
  return (
    <View
      className={cn(
        'gap-1 rounded-2xl border p-4',
        tone === 'pending' ? 'border-amber-500' : 'border-destructive',
      )}
    >
      <Text className="text-lg font-bold">{title}</Text>
      <Text className="text-sm text-muted-foreground">{body}</Text>
    </View>
  );
}

function Bullet({ text }: { text: string }) {
  return (
    <View className="flex-row items-start gap-2">
      <Text className="text-sm text-primary">•</Text>
      <Text className="flex-1 text-sm">{text}</Text>
    </View>
  );
}
