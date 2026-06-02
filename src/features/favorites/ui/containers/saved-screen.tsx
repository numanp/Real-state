import { useRouter } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSessionStore } from '@/core/store/session-store';
import { useLikedProperties } from '@/features/favorites/ui/hooks/use-liked-properties';
import { useFolders } from '@/features/folders/ui/hooks/use-folders';
import { PropertyMiniCard } from '@/features/properties/ui/components/property-mini-card';
import { Button } from '@/shared/ui/primitives/button';
import { Text } from '@/shared/ui/primitives/text';

export function SavedScreen() {
  const session = useSessionStore((s) => s.session);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { properties: liked } = useLikedProperties();
  const { folders } = useFolders();

  if (!session) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-background px-6">
        <Text className="text-lg font-bold">Ingresá para ver tus guardados</Text>
        <Button label="Ingresar" onPress={() => router.push('/sign-in')} />
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }}
    >
      <View className="flex-row items-center justify-between px-5 pb-2">
        <Text className="text-2xl font-bold">Guardados</Text>
        <Button label="‹ Feed" variant="secondary" size="sm" onPress={() => router.back()} />
      </View>

      <Text className="px-5 pb-2 pt-3 text-base font-bold">Me gusta</Text>
      {liked.length === 0 ? (
        <Text className="px-5 text-muted-foreground">Todavía no likeaste ninguna propiedad.</Text>
      ) : (
        <View className="flex-row flex-wrap px-3.5">
          {liked.map((p) => (
            <PropertyMiniCard key={p.id} property={p} />
          ))}
        </View>
      )}

      <Text className="px-5 pb-2 pt-5 text-base font-bold">Mis carpetas</Text>
      {folders.length === 0 ? (
        <Text className="px-5 text-muted-foreground">
          Todavía no tenés carpetas. Guardá una propiedad desde el feed.
        </Text>
      ) : (
        <View className="gap-2 px-5">
          {folders.map((f) => (
            <Pressable
              key={f.id}
              onPress={() => router.push(`/folders/${f.id}`)}
              className="flex-row items-center justify-between rounded-xl bg-card p-4"
            >
              <Text className="text-base font-medium">{f.name}</Text>
              <Text className="text-sm text-muted-foreground">
                {f.itemCount} {f.itemCount === 1 ? 'propiedad' : 'propiedades'}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
