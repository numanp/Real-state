import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { memo } from 'react';
import { Pressable, View } from 'react-native';

import type { FeedItem } from '@/features/feed/domain/entities/feed-item';
import { FeedActions } from '@/features/feed/ui/components/feed-actions';
import { useFeedTracking } from '@/features/personalization/ui/use-feed-tracking';
import { formatMoney } from '@/shared/ui/lib/format';
import { Text } from '@/shared/ui/primitives/text';

interface Props {
  item: FeedItem;
  height: number;
  width: number;
}

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
export const FeedCard = memo(function FeedCard({ item, height, width }: Props) {
  const router = useRouter();
  const { trackDetail } = useFeedTracking();

  return (
    <View style={{ height, width }} className="bg-black">
      <Pressable
        style={{ flex: 1 }}
        onPress={() => {
          trackDetail(item.id);
          router.push(`/property/${item.id}`);
        }}
      >
        <Image
          source={item.primaryReel.posterUrl}
          placeholder={item.primaryReel.blurhash}
          recyclingKey={item.id}
          contentFit="cover"
          transition={200}
          priority="high"
          cachePolicy="memory-disk"
          style={{ flex: 1 }}
        />
      </Pressable>

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
      </View>

      <FeedActions propertyId={item.id} likes={item.counts.likes} />
    </View>
  );
});
