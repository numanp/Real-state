import { FlashList } from '@shopify/flash-list';
import { useCallback, useState } from 'react';
import { type LayoutChangeEvent, View } from 'react-native';

import type { FeedItem } from '@/features/feed/domain/entities/feed-item';

import { FeedCard } from './feed-card';

interface Props {
  items: FeedItem[];
  onEndReached: () => void;
}

/**
 * Recycling vertical pager. The card height MUST equal the list's real viewport
 * (measured via onLayout, NOT the window height — they differ by the status bar
 * / browser chrome). card == viewport == snapToInterval → exactly one property
 * per snap, never a half-card.
 */
export function FeedList({ items, onEndReached }: Props) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: FeedItem }) => (
      <FeedCard item={item} height={size.height} width={size.width} />
    ),
    [size.height, size.width],
  );

  return (
    <View className="flex-1" onLayout={onLayout}>
      {size.height > 0 ? (
        <FlashList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          snapToInterval={size.height}
          snapToAlignment="start"
          decelerationRate="fast"
          disableIntervalMomentum
          showsVerticalScrollIndicator={false}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.6}
        />
      ) : null}
    </View>
  );
}
