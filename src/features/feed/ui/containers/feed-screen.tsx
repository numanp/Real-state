import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/features/auth/ui/hooks/use-auth';
import { FeedList } from '@/features/feed/ui/components/feed-list';
import { useFeed } from '@/features/feed/ui/hooks/use-feed';
import { Button } from '@/shared/ui/primitives/button';

/**
 * Smart container: wires the feed use-case (via useFeed) to the presentational
 * FeedList, plus a lightweight account entry point (anonymous browse stays open;
 * saving will require an account in the next milestone).
 */
export function FeedScreen() {
  const { items, loadMore } = useFeed();
  const { isAuthenticated, signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();

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
