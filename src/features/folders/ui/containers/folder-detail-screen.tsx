import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useFolderProperties } from '@/features/folders/ui/hooks/use-folder-properties';
import { useFolders } from '@/features/folders/ui/hooks/use-folders';
import { PropertyMiniCard } from '@/features/properties/ui/components/property-mini-card';
import { Button } from '@/shared/ui/primitives/button';
import { Text } from '@/shared/ui/primitives/text';

export function FolderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { properties } = useFolderProperties(id);
  const { folders } = useFolders();
  const folder = folders.find((f) => f.id === id);

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }}
    >
      <View className="flex-row items-center justify-between px-5 pb-3">
        <Text className="text-2xl font-bold" numberOfLines={1}>
          {folder?.name ?? 'Carpeta'}
        </Text>
        <Button label="‹ Volver" variant="secondary" size="sm" onPress={() => router.back()} />
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
    </ScrollView>
  );
}
