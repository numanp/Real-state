import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSessionStore } from '@/core/store/session-store';
import { useLeadThread } from '@/features/leads/ui/hooks/use-lead-thread';
import { cn } from '@/shared/ui/lib/cn';
import { Button } from '@/shared/ui/primitives/button';
import { Input } from '@/shared/ui/primitives/input';
import { Text } from '@/shared/ui/primitives/text';

/** A lead's message thread (Phase 2). Bubbles align by isMine; the reply box
 *  sits at the bottom. Opening the thread marks the lead read (owner-side). */
export function LeadThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const session = useSessionStore((s) => s.session);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { messages, loading, sending, error, replyError, load, reply, markRead, close } =
    useLeadThread(id);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (!id) return;
    void load();
    void markRead();
  }, [id, load, markRead]);

  async function onArchive() {
    if (await close()) router.back();
  }

  if (!session) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-background px-6">
        <Text className="text-lg font-bold">Ingresá para ver la conversación</Text>
        <Button label="Ingresar" onPress={() => router.push('/sign-in')} />
      </View>
    );
  }

  async function onSend() {
    const text = draft.trim();
    if (!text) return;
    if (await reply(text)) setDraft('');
  }

  return (
    <View className="flex-1 bg-background">
      <View
        className="flex-row items-center justify-between px-5 pb-2"
        style={{ paddingTop: insets.top + 12 }}
      >
        <Text className="text-2xl font-bold">Conversación</Text>
        <View className="flex-row gap-2">
          <Button label="Archivar" variant="secondary" size="sm" onPress={onArchive} />
          <Button label="‹ Volver" variant="secondary" size="sm" onPress={() => router.back()} />
        </View>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, gap: 8 }}>
        {loading && messages.length === 0 ? (
          <Text className="text-muted-foreground">Cargando…</Text>
        ) : error && messages.length === 0 ? (
          <Text className="text-sm text-destructive">No pudimos cargar la conversación.</Text>
        ) : (
          messages.map((m) => (
            <View
              key={m.id}
              className={cn(
                'max-w-[80%] rounded-2xl px-4 py-2',
                m.isMine ? 'self-end bg-primary' : 'self-start bg-card',
              )}
            >
              <Text className={cn('text-sm', m.isMine ? 'text-primary-foreground' : 'text-foreground')}>
                {m.body}
              </Text>
            </View>
          ))
        )}
      </ScrollView>

      <View
        className="gap-1 border-t border-border bg-background px-3 pt-2"
        style={{ paddingBottom: insets.bottom + 8 }}
      >
        {replyError ? (
          <Text className="px-1 text-sm text-destructive">No se pudo completar la acción. Probá de nuevo.</Text>
        ) : null}
        <View className="flex-row items-end gap-2">
          <Input
            className="h-12 flex-1"
            placeholder="Escribí un mensaje…"
            value={draft}
            onChangeText={setDraft}
            maxLength={1000}
            multiline
          />
          <Button
            label={sending ? '…' : 'Enviar'}
            disabled={sending || draft.trim().length === 0}
            onPress={onSend}
          />
        </View>
      </View>
    </View>
  );
}
