import { View } from 'react-native';

import { FeedList } from '@/features/feed/ui/components/feed-list';
import { useFeed } from '@/features/feed/ui/hooks/use-feed';

/**
 * Smart container: wires the feed use-case (via useFeed) to the presentational
 * FeedList. No business or styling logic lives here.
 */
export function FeedScreen() {
  const { items, loadMore } = useFeed();

  return (
    <View className="flex-1 bg-black">
      <FeedList items={items} onEndReached={loadMore} />
    </View>
  );
}
