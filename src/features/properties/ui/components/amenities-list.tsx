import { View } from 'react-native';

import type { Amenity } from '@/features/properties/domain/entities/property-detail';
import { Text } from '@/shared/ui/primitives/text';

export function AmenitiesList({ amenities }: { amenities: Amenity[] }) {
  const present = amenities.filter((a) => a.available);
  const absent = amenities.filter((a) => !a.available);

  return (
    <View className="gap-2">
      <View className="flex-row flex-wrap gap-2">
        {present.map((a) => (
          <View key={a.label} className="rounded-full bg-secondary px-3 py-1">
            <Text className="text-sm text-secondary-foreground">{a.label}</Text>
          </View>
        ))}
      </View>
      {absent.length > 0 ? (
        <Text className="text-xs text-muted-foreground">
          No incluye: {absent.map((a) => a.label).join(', ')}
        </Text>
      ) : null}
    </View>
  );
}
