import { View } from 'react-native';

import type { Cost } from '@/features/properties/domain/entities/property-detail';
import { formatMoney } from '@/shared/ui/lib/format';
import { Text } from '@/shared/ui/primitives/text';

const PERIOD: Record<Cost['period'], string> = { monthly: '/mes', yearly: '/año', once: '' };

export function CostList({ costs }: { costs: Cost[] }) {
  if (costs.length === 0) return null;

  return (
    <View className="gap-1 py-1">
      {costs.map((c) => (
        <View key={c.label} className="flex-row justify-between">
          <Text className="text-sm text-muted-foreground">{c.label}</Text>
          <Text className="text-sm font-medium">
            {formatMoney(c.amountCents, c.currency)}
            {PERIOD[c.period]}
          </Text>
        </View>
      ))}
    </View>
  );
}
