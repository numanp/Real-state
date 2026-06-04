import { FlashList } from '@shopify/flash-list';
import { useCallback, useRef, useState } from 'react';
import { type LayoutChangeEvent, View, type ViewToken } from 'react-native';

import type { FeedItem } from '@/features/feed/domain/entities/feed-item';
import { useFeedTracking } from '@/features/personalization/ui/use-feed-tracking';

import { FeedCard } from './feed-card';

interface Props {
  items: FeedItem[];
  onEndReached: () => void;
}

/**
 * Recycling vertical pager. The card height MUST equal the list's real viewport
 * (measured via onLayout, NOT the window height) so each property snaps fully.
 * Viewability drives the `view` dwell signal (which card was on screen, how long).
 */
export function FeedList({ items, onEndReached }: Props) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const { emitView } = useFeedTracking();

  // Keep the latest emitter reachable from the stable viewability callback.
  const emitViewRef = useRef(emitView);
  emitViewRef.current = emitView;
  const active = useRef<{ id: string; index: number; at: number } | null>(null);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
  }, []);

  // Stable refs — FlashList/FlatList forbid these from changing between renders.
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 80, minimumViewTime: 150 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const firstId = viewableItems[0]?.item?.id as string | undefined;
    const now = Date.now();
    const prev = active.current;
    if (prev && prev.id !== firstId) {
      emitViewRef.current(prev.id, now - prev.at, prev.index);
      active.current = null;
    }
    if (firstId && active.current?.id !== firstId) {
      active.current = { id: firstId, index: viewableItems[0]?.index ?? 0, at: now };
    }
  }).current;

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
          viewabilityConfig={viewabilityConfig}
          onViewableItemsChanged={onViewableItemsChanged}
        />
      ) : null}
    </View>
  );
}
