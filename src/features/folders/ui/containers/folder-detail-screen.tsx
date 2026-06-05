import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pencil } from 'lucide-react-native';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { container } from '@/core/di/container';
import { useSessionStore } from '@/core/store/session-store';
import { FolderError } from '@/features/folders/domain/ports/folders-repository';
import { useFolderProperties } from '@/features/folders/ui/hooks/use-folder-properties';
import { useFolders } from '@/features/folders/ui/hooks/use-folders';
import { PropertyMiniCard } from '@/features/properties/ui/components/property-mini-card';
import { Button } from '@/shared/ui/primitives/button';
import { Input } from '@/shared/ui/primitives/input';
import { Text } from '@/shared/ui/primitives/text';

export function FolderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const session = useSessionStore((s) => s.session);
  const { properties } = useFolderProperties(id);
  const { folders } = useFolders();
  const folder = folders.find((f) => f.id === id);

  const [manageOpen, setManageOpen] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canManage = !!folder && !folder.isDefault;

  // Folders are per-user (RLS-protected). Without this an unauthenticated deep
  // link to /folders/[id] showed an empty folder instead of an auth prompt.
  if (!session) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-background px-6">
        <Text className="text-lg font-bold">Ingresá para ver tus carpetas</Text>
        <Button label="Ingresar" onPress={() => router.push('/sign-in')} />
      </View>
    );
  }

  function openManage() {
    setName(folder?.name ?? '');
    setError(null);
    setManageOpen(true);
  }

  async function rename() {
    if (!session || !folder) return;
    setBusy(true);
    setError(null);
    try {
      await container.folders.rename(session.user.id, folder.id, name.trim());
      setManageOpen(false);
      router.back();
    } catch (e) {
      setError(e instanceof FolderError ? e.message : 'No se pudo renombrar.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!session || !folder) return;
    setBusy(true);
    try {
      await container.folders.delete(session.user.id, folder.id);
      setManageOpen(false);
      router.back();
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }}
    >
      <View className="flex-row items-center justify-between gap-2 px-5 pb-3">
        <Text className="flex-1 text-2xl font-bold" numberOfLines={1}>
          {folder?.name ?? 'Carpeta'}
        </Text>
        <View className="flex-row items-center gap-2">
          {canManage ? (
            <Pressable onPress={openManage} hitSlop={8} className="rounded-full bg-secondary p-2">
              <Pencil size={18} color="#18181b" />
            </Pressable>
          ) : null}
          <Button label="‹ Volver" variant="secondary" size="sm" onPress={() => router.back()} />
        </View>
      </View>

      {properties.length === 0 ? (
        <Text className="px-5 text-muted-foreground">Esta carpeta está vacía.</Text>
      ) : (
        <View className="flex-row flex-wrap px-3.5">
          {properties.map((p) => (
            <PropertyMiniCard key={p.id} property={p} />
          ))}
        </View>
      )}

      <Modal
        visible={manageOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setManageOpen(false)}
      >
        <Pressable className="flex-1 bg-black/50" onPress={() => setManageOpen(false)} />
        <View className="absolute inset-x-0 bottom-0 gap-3 rounded-t-3xl bg-background p-5 pb-10">
          <Text className="text-lg font-bold">Editar carpeta</Text>
          <Input value={name} onChangeText={setName} placeholder="Nombre de la carpeta" />
          {error ? <Text className="text-sm text-destructive">{error}</Text> : null}
          <Button label={busy ? 'Guardando…' : 'Guardar'} disabled={busy} onPress={rename} />
          <Button
            label="Borrar carpeta"
            variant="destructive"
            disabled={busy}
            onPress={remove}
          />
        </View>
      </Modal>
    </ScrollView>
  );
}
