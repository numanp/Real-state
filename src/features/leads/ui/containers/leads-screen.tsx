import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSessionStore } from '@/core/store/session-store';
import type { LeadStatus } from '@/features/leads/domain/entities/lead';
import { useLeads } from '@/features/leads/ui/hooks/use-leads';
import { cn } from '@/shared/ui/lib/cn';
import { Button } from '@/shared/ui/primitives/button';
import { Text } from '@/shared/ui/primitives/text';

const STATUS_LABEL: Record<LeadStatus, string> = {
  new: 'Sin leer',
  read: 'Vista',
  replied: 'Respondida',
  closed: 'Cerrada',
};

/** Two-option toggle, mirroring the Chip in create-listing-screen. */
function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Text
      onPress={onPress}
      className={cn(
        'overflow-hidden rounded-full border px-4 py-2 text-sm',
        active ? 'border-primary bg-primary text-primary-foreground' : 'border-input text-foreground',
      )}
    >
      {label}
    </Text>
  );
}

/** The lead inbox — received (owner) + sent (buyer) tabs. User-scoped, so it
 *  guards on the session like SavedScreen. */
export function LeadsScreen() {
  const session = useSessionStore((s) => s.session);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { received, sent, loading, error, load, markRead } = useLeads();
  const [tab, setTab] = useState<'received' | 'sent'>('received');

  useEffect(() => {
    void load();
  }, [load]);

  if (!session) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-background px-6">
        <Text className="text-lg font-bold">Ingresá para ver tus consultas</Text>
        <Button label="Ingresar" onPress={() => router.push('/sign-in')} />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        className="flex-1 bg-background"
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }}
      >
        <View className="flex-row items-center justify-between px-5 pb-2">
          <Text className="text-2xl font-bold">Consultas</Text>
          <Button label="‹ Volver" variant="secondary" size="sm" onPress={() => router.back()} />
        </View>

        <View className="flex-row gap-2 px-5 pb-2">
          <Chip label="Recibidas" active={tab === 'received'} onPress={() => setTab('received')} />
          <Chip label="Enviadas" active={tab === 'sent'} onPress={() => setTab('sent')} />
        </View>

        {error ? (
          <Text className="px-5 pt-2 text-sm text-destructive">No pudimos cargar tus consultas.</Text>
        ) : loading ? (
          <Text className="px-5 pt-2 text-muted-foreground">Cargando…</Text>
        ) : tab === 'received' ? (
          received.length === 0 ? (
            <Text className="px-5 pt-2 text-muted-foreground">
              Todavía no recibiste consultas en tus avisos.
            </Text>
          ) : (
            <View className="gap-2 px-5 pt-1">
              {received.map((l) => (
                <Pressable
                  key={l.id}
                  onPress={() => (l.status === 'new' ? void markRead(l.id) : undefined)}
                  className="gap-1 rounded-xl bg-card p-4"
                >
                  <View className="flex-row items-center justify-between gap-2">
                    <Text className="flex-1 text-base font-medium" numberOfLines={1}>
                      {l.title}
                    </Text>
                    {l.status === 'new' ? (
                      <View className="rounded-full bg-primary px-2 py-0.5">
                        <Text className="text-[11px] font-semibold text-primary-foreground">Nueva</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text className="text-xs text-muted-foreground">
                    {l.buyerName ?? 'Alguien'}
                    {l.city ? ` · ${l.city}` : ''}
                  </Text>
                  <Text className="text-sm" numberOfLines={2}>
                    {l.message}
                  </Text>
                </Pressable>
              ))}
            </View>
          )
        ) : sent.length === 0 ? (
          <Text className="px-5 pt-2 text-muted-foreground">Todavía no enviaste consultas.</Text>
        ) : (
          <View className="gap-2 px-5 pt-1">
            {sent.map((l) => (
              <Pressable
                key={l.id}
                onPress={() => router.push(`/property/${l.propertyId}`)}
                className="gap-1 rounded-xl bg-card p-4"
              >
                <Text className="text-base font-medium" numberOfLines={1}>
                  {l.title}
                </Text>
                <Text className="text-sm" numberOfLines={2}>
                  {l.message}
                </Text>
                <Text className="text-xs text-muted-foreground">{STATUS_LABEL[l.status]}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
