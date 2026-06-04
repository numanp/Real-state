import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { AppState, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { container } from '@/core/di/container';
import { countActiveFilters, useFiltersStore } from '@/core/store/filters-store';
import { useInteractionsStore } from '@/core/store/interactions-store';
import { useAuth } from '@/features/auth/ui/hooks/use-auth';
import { FeedList } from '@/features/feed/ui/components/feed-list';
import { FilterSheet } from '@/features/feed/ui/components/filter-sheet';
import { SaveSheetHost } from '@/features/folders/ui/components/save-sheet-host';
import { useFeed } from '@/features/feed/ui/hooks/use-feed';
import { useFeedModeStore } from '@/core/store/feed-mode-store';
import { useEntitlements } from '@/features/membership/ui/hooks/use-entitlements';
import { useFeedTracking } from '@/features/personalization/ui/use-feed-tracking';
import { useSavedSearches } from '@/features/saved-searches/ui/hooks/use-saved-searches';
import { cn } from '@/shared/ui/lib/cn';
import { Button } from '@/shared/ui/primitives/button';
import { Text } from '@/shared/ui/primitives/text';

/**
 * Smart container: wires the feed use-case to the presentational FeedList, the
 * filters sheet, the likes load, and the account/saved entry points.
 */
export function FeedScreen() {
  const { items, loadMore, isLoading } = useFeed();
  const { session, isAuthenticated, signOut } = useAuth();
  const filters = useFiltersStore((s) => s.filters);
  const setFilters = useFiltersStore((s) => s.setFilters);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { flush } = useFeedTracking();
  const mode = useFeedModeStore((s) => s.mode);
  const setMode = useFeedModeStore((s) => s.setMode);
  const { create: createSearch } = useSavedSearches();
  useEntitlements(); // load the user's entitlements into the store (gates read it)
  const [filterOpen, setFilterOpen] = useState(false);

  const activeFilters = countActiveFilters(filters);

  useEffect(() => {
    const { reset, setLikedIds } = useInteractionsStore.getState();
    if (!session) {
      reset();
      return;
    }
    let active = true;
    void container.favorites.list(session.user.id).then((ids) => {
      if (active) setLikedIds(ids);
    });
    return () => {
      active = false;
    };
  }, [session]);

  // Flush buffered feed signals when the app backgrounds (catch the tail).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') void flush();
    });
    return () => {
      sub.remove();
      void flush();
    };
  }, [flush]);

  return (
    <View className="flex-1 bg-black">
      <FeedList items={items} onEndReached={loadMore} />

      {items.length === 0 && !isLoading ? (
        <View pointerEvents="none" className="absolute inset-0 items-center justify-center px-10">
          <Text className="text-center text-white/80">
            No hay propiedades con esos filtros. Probá ajustarlos.
          </Text>
        </View>
      ) : null}

      <View className="absolute left-4" style={{ top: insets.top + 8 }}>
        <Button
          label={activeFilters > 0 ? `Filtros (${activeFilters})` : 'Filtros'}
          variant="secondary"
          size="sm"
          onPress={() => setFilterOpen(true)}
        />
      </View>

      <View className="absolute right-4 flex-row gap-2" style={{ top: insets.top + 8 }}>
        <Button
          label="Guardados"
          variant="secondary"
          size="sm"
          onPress={() => router.push(isAuthenticated ? '/saved' : '/sign-in')}
        />
        <Button
          label={isAuthenticated ? 'Salir' : 'Ingresá'}
          variant="secondary"
          size="sm"
          onPress={() => (isAuthenticated ? void signOut() : router.push('/sign-in'))}
        />
      </View>

      <View
        className="absolute left-0 right-0 items-center"
        style={{ top: insets.top + 10 }}
        pointerEvents="box-none"
      >
        <View className="flex-row rounded-full bg-black/40 p-1">
          {(['recent', 'forYou'] as const).map((m) => (
            <Pressable
              key={m}
              onPress={() => setMode(m)}
              className={cn('rounded-full px-3 py-1.5', mode === m && 'bg-white')}
            >
              <Text
                className={cn('text-xs font-semibold', mode === m ? 'text-black' : 'text-white')}
              >
                {m === 'recent' ? 'Recientes' : 'Para vos'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <FilterSheet
        visible={filterOpen}
        initial={filters}
        onApply={setFilters}
        onClose={() => setFilterOpen(false)}
        onSaveSearch={(name, f) =>
          isAuthenticated ? void createSearch(name, f) : router.push('/sign-in')
        }
      />

      <SaveSheetHost />
    </View>
  );
}
