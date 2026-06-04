import { useRouter } from 'expo-router';
import { Trash2 } from 'lucide-react-native';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useFeedModeStore } from '@/core/store/feed-mode-store';
import { useFiltersStore } from '@/core/store/filters-store';
import { useSessionStore } from '@/core/store/session-store';
import { useLikedProperties } from '@/features/favorites/ui/hooks/use-liked-properties';
import { useFolders } from '@/features/folders/ui/hooks/use-folders';
import { useMyListings } from '@/features/listings/ui/hooks/use-my-listings';
import { PropertyMiniCard } from '@/features/properties/ui/components/property-mini-card';
import type { SavedSearchWithCount } from '@/features/saved-searches/ui/hooks/use-saved-searches';
import { useSavedSearches } from '@/features/saved-searches/ui/hooks/use-saved-searches';
import { formatMoney } from '@/shared/ui/lib/format';
import { Button } from '@/shared/ui/primitives/button';
import { Text } from '@/shared/ui/primitives/text';

export function SavedScreen() {
  const session = useSessionStore((s) => s.session);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { properties: liked } = useLikedProperties();
  const { folders } = useFolders();
  const { searches, remove } = useSavedSearches();
  const { listings } = useMyListings();
  const setFilters = useFiltersStore((s) => s.setFilters);
  const setMode = useFeedModeStore((s) => s.setMode);

  if (!session) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-background px-6">
        <Text className="text-lg font-bold">Ingresá para ver tus guardados</Text>
        <Button label="Ingresar" onPress={() => router.push('/sign-in')} />
      </View>
    );
  }

  function applySearch(search: SavedSearchWithCount) {
    setFilters(search.filters);
    setMode('recent');
    router.push('/');
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }}
    >
      <View className="flex-row items-center justify-between px-5 pb-2">
        <Text className="text-2xl font-bold">Guardados</Text>
        <View className="flex-row gap-2">
          <Button
            label="✨ Premium"
            variant="secondary"
            size="sm"
            onPress={() => router.push('/membership')}
          />
          <Button label="‹ Feed" variant="secondary" size="sm" onPress={() => router.back()} />
        </View>
      </View>

      <View className="px-5 pb-1">
        <Button label="＋ Publicar propiedad" onPress={() => router.push('/create-listing')} />
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

      {listings.length > 0 ? (
        <>
          <Text className="px-5 pb-2 pt-5 text-base font-bold">Mis publicaciones</Text>
          <View className="gap-2 px-5">
            {listings.map((l) => (
              <Pressable
                key={l.id}
                onPress={() => router.push(`/property/${l.id}`)}
                className="flex-row items-center justify-between rounded-xl bg-card p-4"
              >
                <View className="flex-1 pr-3">
                  <Text className="text-base font-medium" numberOfLines={1}>
                    {l.title}
                  </Text>
                  <Text className="text-xs text-muted-foreground">
                    {l.operation === 'buy' ? 'Venta' : 'Alquiler'} · {l.city}
                  </Text>
                </View>
                <Text className="text-sm font-bold">{formatMoney(l.priceCents, l.currency)}</Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      <Text className="px-5 pb-2 pt-5 text-base font-bold">Mis búsquedas</Text>
      {searches.length === 0 ? (
        <Text className="px-5 text-muted-foreground">
          Guardá una búsqueda desde los filtros del feed.
        </Text>
      ) : (
        <View className="gap-2 px-5">
          {searches.map((s) => (
            <View
              key={s.id}
              className="flex-row items-center justify-between rounded-xl bg-card p-4"
            >
              <Pressable className="flex-1" onPress={() => applySearch(s)}>
                <Text className="text-base font-medium">{s.name}</Text>
                <Text className="text-xs text-muted-foreground">
                  {s.matchCount} {s.matchCount === 1 ? 'resultado' : 'resultados'}
                </Text>
              </Pressable>
              <Pressable onPress={() => void remove(s.id)} hitSlop={8}>
                <Trash2 size={18} color="#a1a1aa" />
              </Pressable>
            </View>
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
