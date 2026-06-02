import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import type { PropertyDetail } from '@/features/properties/domain/entities/property-detail';
import { formatMoney } from '@/shared/ui/lib/format';
import { Text } from '@/shared/ui/primitives/text';

/** Compact 2-column property card for grids (favorites, folder contents). */
export function PropertyMiniCard({ property }: { property: PropertyDetail }) {
  const router = useRouter();
  const price = `${formatMoney(property.price.amountCents, property.price.currency)}${
    property.price.period === 'monthly' ? '/mes' : ''
  }`;

  return (
    <Pressable
      onPress={() => router.push(`/property/${property.id}`)}
      className="mb-3 w-1/2 px-1.5"
    >
      <View className="overflow-hidden rounded-xl bg-card">
        <Image
          source={property.gallery[0]}
          style={{ width: '100%', height: 140 }}
          contentFit="cover"
          transition={150}
        />
        <View className="gap-0.5 p-2">
          <Text className="text-sm font-bold" numberOfLines={1}>
            {price}
          </Text>
          <Text className="text-xs text-muted-foreground" numberOfLines={1}>
            {property.title}
          </Text>
          <Text className="text-xs text-muted-foreground" numberOfLines={1}>
            {property.location.neighborhood ?? property.location.city}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}
