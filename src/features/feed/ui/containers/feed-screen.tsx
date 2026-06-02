import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { container } from '@/core/di/container';
import { useInteractionsStore } from '@/core/store/interactions-store';
import { useAuth } from '@/features/auth/ui/hooks/use-auth';
import { FeedList } from '@/features/feed/ui/components/feed-list';
import { useFeed } from '@/features/feed/ui/hooks/use-feed';
import { Button } from '@/shared/ui/primitives/button';

/**
 * Smart container: wires the feed use-case to the presentational FeedList, loads
 * the signed-in user's likes into the interactions store (and clears them on
 * sign-out), and exposes a lightweight account entry point.
 */
export function FeedScreen() {
  const { items, loadMore } = useFeed();
  const { session, isAuthenticated, signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();

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

  return (
    <View className="flex-1 bg-black">
      <FeedList items={items} onEndReached={loadMore} />
      <View className="absolute right-4" style={{ top: insets.top + 8 }}>
        <Button
          label={isAuthenticated ? 'Salir' : 'Ingresá'}
          variant="secondary"
          size="sm"
          onPress={() => (isAuthenticated ? void signOut() : router.push('/sign-in'))}
        />
      </View>
    </View>
  );
}
