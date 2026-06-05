import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type LayoutChangeEvent, View, type ViewToken } from 'react-native';

import { useFeedControlStore } from '@/core/store/feed-control-store';
import type { FeedItem } from '@/features/feed/domain/entities/feed-item';
import { useFeedTracking } from '@/features/personalization/ui/use-feed-tracking';

import { FeedCard } from './feed-card';

interface Props {
  items: FeedItem[];
  onEndReached: () => void;
}

/**
 * Recycling vertical pager. The card height equals the measured viewport (so
 * each property snaps fully). Viewability drives the `view` dwell signal and the
 * active index; a FlashList ref is exposed to the control store so the action
 * rail can advance (pass/super-like) or rewind the feed.
 */
export function FeedList({ items, onEndReached }: Props) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const { emitView } = useFeedTracking();
  const listRef = useRef<FlashListRef<FeedItem>>(null);

  const emitViewRef = useRef(emitView);
  emitViewRef.current = emitView;
  // Kept current so the once-created viewability handler can read the latest list
  // without being re-created (which would reset FlashList's viewability tracking).
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const active = useRef<{ id: string; index: number; at: number } | null>(null);

  useEffect(() => {
    const { setScroller, setCount } = useFeedControlStore.getState();
    setScroller((index) => listRef.current?.scrollToIndex({ index, animated: true }));
    setCount(items.length);
    return () => useFeedControlStore.getState().setScroller(null);
  }, [items.length]);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
  }, []);

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 80, minimumViewTime: 150 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems[0];
    const firstId = first?.item?.id as string | undefined;
    const firstIndex = first?.index ?? 0;
    const now = Date.now();
    const prev = active.current;
    if (prev && prev.id !== firstId) {
      emitViewRef.current(prev.id, now - prev.at, prev.index);
      active.current = null;
    }
    if (firstId && active.current?.id !== firstId) {
      active.current = { id: firstId, index: firstIndex, at: now };
      useFeedControlStore.getState().setActiveIndex(firstIndex);
      // Warm the next 3 posters so the next swipe paints instantly (no flash).
      const upcoming = itemsRef.current
        .slice(firstIndex + 1, firstIndex + 4)
        .map((it) => it.primaryReel.posterUrl)
        .filter((url): url is string => url != null);
      if (upcoming.length) void Image.prefetch(upcoming, { cachePolicy: 'memory-disk' });
    }
  }).current;

  // Reactive read of the active index so exactly one card mounts a playing video.
  // The list re-renders only when the active index changes (a swipe), not on
  // every scroll frame — `setActiveIndex` fires once per viewable-item change.
  const activeIndex = useFeedControlStore((s) => s.activeIndex);

  const renderItem = useCallback(
    ({ item, index }: { item: FeedItem; index: number }) => (
      <FeedCard
        item={item}
        height={size.height}
        width={size.width}
        isActive={index === activeIndex}
      />
    ),
    [size.height, size.width, activeIndex],
  );

  return (
    <View className="flex-1" onLayout={onLayout}>
      {size.height > 0 ? (
        <FlashList
          ref={listRef}
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
