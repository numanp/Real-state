import { View } from 'react-native';

import type { PropertyDetail } from '@/features/properties/domain/entities/property-detail';
import { Text } from '@/shared/ui/primitives/text';

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <View className="w-1/2 gap-0.5 py-2">
      <Text className="text-xs text-muted-foreground">{label}</Text>
      <Text className="text-base font-medium">{value}</Text>
    </View>
  );
}

export function SpecsGrid({ property }: { property: PropertyDetail }) {
  const specs: { label: string; value: string }[] = [
    { label: 'Ambientes', value: String(property.rooms) },
    { label: 'Dormitorios', value: String(property.bedrooms) },
    { label: 'Baños', value: String(property.bathrooms) },
    { label: 'Cocheras', value: String(property.parking) },
  ];
  if (property.area.totalSqm) specs.push({ label: 'Sup. total', value: `${property.area.totalSqm} m²` });
  if (property.area.coveredSqm)
    specs.push({ label: 'Sup. cubierta', value: `${property.area.coveredSqm} m²` });
  if (property.ageYears !== undefined)
    specs.push({
      label: 'Antigüedad',
      value: property.ageYears === 0 ? 'A estrenar' : `${property.ageYears} años`,
    });
  if (property.orientation) specs.push({ label: 'Orientación', value: property.orientation });
  if (property.floor) specs.push({ label: 'Piso', value: property.floor });
  if (property.condition) specs.push({ label: 'Estado', value: property.condition });

  return (
    <View className="flex-row flex-wrap">
      {specs.map((s) => (
        <Spec key={s.label} label={s.label} value={s.value} />
      ))}
    </View>
  );
}
