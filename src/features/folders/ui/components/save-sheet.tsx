import { CheckSquare, Square } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';

import { container } from '@/core/di/container';
import { useSessionStore } from '@/core/store/session-store';
import type { Folder } from '@/features/folders/domain/entities/folder';
import { FolderError } from '@/features/folders/domain/ports/folders-repository';
import { Button } from '@/shared/ui/primitives/button';
import { Input } from '@/shared/ui/primitives/input';
import { Text } from '@/shared/ui/primitives/text';

interface Props {
  visible: boolean;
  propertyId: string;
  onClose: () => void;
  onSaved: () => void;
}

/** Bottom sheet to save a property into one or more folders (or a new one). */
export function SaveSheet({ visible, propertyId, onClose, onSaved }: Props) {
  const session = useSessionStore((s) => s.session);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !session) return;
    let active = true;
    void Promise.all([
      container.folders.list(session.user.id),
      container.folders.foldersContaining(session.user.id, propertyId),
    ]).then(([list, containing]) => {
      if (!active) return;
      setFolders(list);
      setSelected(containing);
      setNewName('');
      setError(null);
    });
    return () => {
      active = false;
    };
  }, [visible, session, propertyId]);

  if (!session) return null;
  const userId = session.user.id;

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const ids = [...selected];
      const name = newName.trim();
      if (name) {
        try {
          const created = await container.folders.create(userId, name);
          ids.push(created.id);
        } catch (e) {
          // Surface the typed reason and keep the sheet open so the user can fix it.
          setError(folderErrorMessage(e));
          return;
        }
      }
      await container.folders.saveToFolders(userId, propertyId, ids);
      onSaved();
      onClose();
    } catch {
      setError('No pudimos guardar. Probá de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/50" onPress={onClose} />
      <View className="absolute inset-x-0 bottom-0 gap-3 rounded-t-3xl bg-background p-5 pb-10">
        <Text className="text-lg font-bold">Guardar en…</Text>
        <ScrollView className="max-h-64">
          {folders.length === 0 ? (
            <Text className="py-2 text-muted-foreground">
              Todavía no tenés carpetas. Creá una abajo.
            </Text>
          ) : (
            folders.map((f) => (
              <Pressable
                key={f.id}
                onPress={() => toggle(f.id)}
                className="flex-row items-center justify-between py-3"
              >
                <Text className="text-base">{f.name}</Text>
                {selected.includes(f.id) ? (
                  <CheckSquare size={22} color="#18181b" />
                ) : (
                  <Square size={22} color="#a1a1aa" />
                )}
              </Pressable>
            ))
          )}
        </ScrollView>
        <Input placeholder="Nueva carpeta…" value={newName} onChangeText={setNewName} />
        {error ? <Text className="text-sm text-destructive">{error}</Text> : null}
        <Button label={busy ? 'Guardando…' : 'Guardar'} disabled={busy} onPress={save} />
      </View>
    </Modal>
  );
}

function folderErrorMessage(e: unknown): string {
  if (e instanceof FolderError) {
    switch (e.code) {
      case 'duplicate_name':
        return 'Ya tenés una carpeta con ese nombre.';
      case 'invalid_name':
        return 'Elegí un nombre válido (1–60 caracteres).';
      case 'quota_exceeded':
        return 'Llegaste al límite de carpetas de tu plan.';
    }
  }
  return 'No pudimos crear la carpeta. Probá de nuevo.';
}
