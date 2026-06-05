import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Volume2, VolumeX } from 'lucide-react-native';
import { memo, useRef } from 'react';
import { Pressable, View } from 'react-native';

import { useFeedUiStore } from '@/core/store/feed-ui-store';
import type { FeedItem } from '@/features/feed/domain/entities/feed-item';
import { FeedActions } from '@/features/feed/ui/components/feed-actions';
import { ReelVideo } from '@/features/feed/ui/components/reel-video';
import { isPlayableVideo } from '@/features/feed/ui/lib/reel-playback';
import { useFeedTracking } from '@/features/personalization/ui/use-feed-tracking';
import { formatMoney } from '@/shared/ui/lib/format';
import { Text } from '@/shared/ui/primitives/text';

interface Props {
  item: FeedItem;
  height: number;
  width: number;
  /** True when this is the active (viewable) card — only then does its video play. */
  isActive: boolean;
}

/** Global mute toggle, isolated so the rest of the card never re-renders on mute. */
const MuteToggle = memo(function MuteToggle() {
  const muted = useFeedUiStore((s) => s.muted);
  const toggleMuted = useFeedUiStore((s) => s.toggleMuted);
  return (
    <Pressable
      onPress={toggleMuted}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={muted ? 'Activar sonido' : 'Silenciar'}
      className="absolute right-3 top-3 rounded-full bg-black/40 p-2"
    >
      {muted ? <VolumeX size={20} color="#ffffff" /> : <Volume2 size={20} color="#ffffff" />}
    </Pressable>
  );
});

function priceLabel(item: FeedItem): string {
  const base = formatMoney(item.price.amountCents, item.price.currency);
  return item.price.period === 'monthly' ? `${base}/mes` : base;
}

function specsLabel(item: FeedItem): string {
  const parts = [
    `${item.specs.bedrooms} amb`,
    `${item.specs.bathrooms} baño${item.specs.bathrooms === 1 ? '' : 's'}`,
  ];
  if (item.specs.areaSqm) parts.push(`${item.specs.areaSqm} m²`);
  return parts.join(' · ');
}

/**
 * Presentational full-screen card. Tapping the media opens the ficha (and emits
 * a `detail` signal); the info/scrim overlays are pointerEvents="none" and the
 * action rail sits on top, so only the rail and the media are interactive.
 */
export const FeedCard = memo(function FeedCard({ item, height, width, isActive }: Props) {
  const router = useRouter();
  const { trackDetail } = useFeedTracking();
  // Debounce: a fast double-tap otherwise pushed the detail route twice (a
  // duplicate screen under the first) and double-counted the `detail` signal.
  const lastTapRef = useRef(0);

  const reel = item.primaryReel;
  // Video → expo-video on the active card (poster beneath until first frame).
  // image_set / sourceless video → the existing expo-image path, which is the
  // cross-platform-safe fallback (web included).
  const playable = isPlayableVideo(reel);

  return (
    <View style={{ height, width }} className="bg-black">
      <Pressable
        style={{ flex: 1 }}
        onPress={() => {
          const now = Date.now();
          if (now - lastTapRef.current < 700) return;
          lastTapRef.current = now;
          trackDetail(item.id);
          router.push(`/property/${item.id}`);
        }}
      >
        {playable ? (
          <ReelVideo reel={reel} isActive={isActive} />
        ) : (
          <Image
            source={reel.posterUrl}
            placeholder={reel.blurhash}
            recyclingKey={item.id}
            contentFit="cover"
            transition={200}
            priority="high"
            cachePolicy="memory-disk"
            style={{ flex: 1 }}
          />
        )}
      </Pressable>

      {playable ? <MuteToggle /> : null}

      <View pointerEvents="none" className="absolute inset-x-0 bottom-0 h-2/5 bg-black/50" />

      <View pointerEvents="none" className="absolute inset-x-0 bottom-0 gap-1 p-5 pb-12 pr-20">
        <View className="mb-1 self-start rounded-full bg-primary px-3 py-1">
          <Text className="text-xs font-semibold text-primary-foreground">
            {item.operation === 'buy' ? 'Venta' : 'Alquiler'}
          </Text>
        </View>
        <Text className="text-3xl font-bold text-white">{priceLabel(item)}</Text>
        <Text className="text-base text-white" numberOfLines={1}>
          {item.title}
        </Text>
        <Text className="text-sm text-white/80">
          {[item.location.neighborhood, item.location.city].filter(Boolean).join(', ')}
        </Text>
        <Text className="text-sm text-white/80">{specsLabel(item)}</Text>
        {reel.caption ? (
          <Text className="text-sm text-white/70" numberOfLines={2}>
            {reel.caption}
          </Text>
        ) : null}
      </View>

      <FeedActions propertyId={item.id} likes={item.counts.likes} />
    </View>
  );
});
