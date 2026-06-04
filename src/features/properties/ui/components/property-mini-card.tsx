import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Check, Plus } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import type { PropertyDetail } from '@/features/properties/domain/entities/property-detail';
import { cn } from '@/shared/ui/lib/cn';
import { formatMoney } from '@/shared/ui/lib/format';
import { Text } from '@/shared/ui/primitives/text';

interface Props {
  property: PropertyDetail;
  /** When provided, an overlay chip toggles the property into the compare set. */
  selectedForCompare?: boolean;
  onToggleCompare?: () => void;
}

/** Compact 2-column property card for grids (favorites, folder contents). */
export function PropertyMiniCard({ property, selectedForCompare, onToggleCompare }: Props) {
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
        <View>
          <Image
            source={property.gallery[0]}
            style={{ width: '100%', height: 140 }}
            contentFit="cover"
            transition={150}
          />
          {onToggleCompare ? (
            <Pressable
              onPress={onToggleCompare}
              hitSlop={8}
              className={cn(
                'absolute right-2 top-2 h-7 w-7 items-center justify-center rounded-full border-2',
                selectedForCompare ? 'border-primary bg-primary' : 'border-white/90 bg-black/40',
              )}
            >
              {selectedForCompare ? (
                <Check size={14} color="#fff" />
              ) : (
                <Plus size={14} color="#fff" />
              )}
            </Pressable>
          ) : null}
        </View>
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
