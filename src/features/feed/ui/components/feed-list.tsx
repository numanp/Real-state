import { FlashList } from '@shopify/flash-list';
import { useCallback } from 'react';
import { useWindowDimensions } from 'react-native';

import type { FeedItem } from '@/features/feed/domain/entities/feed-item';

import { FeedCard } from './feed-card';

interface Props {
  items: FeedItem[];
  onEndReached: () => void;
}

/**
 * Recycling vertical pager. FlashList v2 auto-sizes (no estimatedItemSize).
 * pagingEnabled + screen-height snap = one property per viewport (TikTok feel).
 */
export function FeedList({ items, onEndReached }: Props) {
  const { height, width } = useWindowDimensions();

  const renderItem = useCallback(
    ({ item }: { item: FeedItem }) => <FeedCard item={item} height={height} width={width} />,
    [height, width],
  );

  return (
    <FlashList
      data={items}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      pagingEnabled
      snapToInterval={height}
      decelerationRate="fast"
      showsVerticalScrollIndicator={false}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.6}
    />
  );
}
