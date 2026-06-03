import { useEffect, useState } from 'react';
import { Modal, Pressable, View } from 'react-native';

import type { FeedFilters } from '@/features/feed/domain/ports/feed-repository';
import { cn } from '@/shared/ui/lib/cn';
import { Button } from '@/shared/ui/primitives/button';
import { Input } from '@/shared/ui/primitives/input';
import { Text } from '@/shared/ui/primitives/text';

interface Props {
  visible: boolean;
  initial: FeedFilters;
  onApply: (filters: FeedFilters) => void;
  onClose: () => void;
}

const OPERATIONS: { label: string; value?: 'buy' | 'rent' }[] = [
  { label: 'Todo' },
  { label: 'Comprar', value: 'buy' },
  { label: 'Alquilar', value: 'rent' },
];
const BEDROOMS = [1, 2, 3, 4];
const CURRENCIES = ['USD', 'ARS', 'BRL'];

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className={cn(
        'rounded-full border px-4 py-2',
        active ? 'border-primary bg-primary' : 'border-input',
      )}
    >
      <Text className={active ? 'text-primary-foreground' : 'text-foreground'}>{label}</Text>
    </Pressable>
  );
}

export function FilterSheet({ visible, initial, onApply, onClose }: Props) {
  const [operation, setOperation] = useState<FeedFilters['operation']>(initial.operation);
  const [minBedrooms, setMinBedrooms] = useState<number | undefined>(initial.minBedrooms);
  const [city, setCity] = useState(initial.city ?? '');
  const [currency, setCurrency] = useState<string | undefined>(initial.currency);
  const [maxPrice, setMaxPrice] = useState(
    initial.maxPriceCents ? String(initial.maxPriceCents / 100) : '',
  );

  useEffect(() => {
    if (!visible) return;
    setOperation(initial.operation);
    setMinBedrooms(initial.minBedrooms);
    setCity(initial.city ?? '');
    setCurrency(initial.currency);
    setMaxPrice(initial.maxPriceCents ? String(initial.maxPriceCents / 100) : '');
  }, [visible, initial]);

  function apply() {
    const next: FeedFilters = {};
    if (operation) next.operation = operation;
    if (minBedrooms) next.minBedrooms = minBedrooms;
    if (city.trim()) next.city = city.trim();
    if (currency) next.currency = currency;
    const max = Number(maxPrice);
    if (currency && maxPrice && !Number.isNaN(max) && max > 0) {
      next.maxPriceCents = Math.round(max * 100);
    }
    onApply(next);
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/50" onPress={onClose} />
      <View className="absolute inset-x-0 bottom-0 gap-4 rounded-t-3xl bg-background p-5 pb-10">
        <Text className="text-lg font-bold">Filtros</Text>

        <View className="gap-2">
          <Text className="text-sm font-medium text-muted-foreground">Operación</Text>
          <View className="flex-row gap-2">
            {OPERATIONS.map((o) => (
              <Chip
                key={o.label}
                label={o.label}
                active={operation === o.value}
                onPress={() => setOperation(o.value)}
              />
            ))}
          </View>
        </View>

        <View className="gap-2">
          <Text className="text-sm font-medium text-muted-foreground">Ambientes (mínimo)</Text>
          <View className="flex-row gap-2">
            {BEDROOMS.map((b) => (
              <Chip
                key={b}
                label={`${b}+`}
                active={minBedrooms === b}
                onPress={() => setMinBedrooms(minBedrooms === b ? undefined : b)}
              />
            ))}
          </View>
        </View>

        <View className="gap-2">
          <Text className="text-sm font-medium text-muted-foreground">Ciudad</Text>
          <Input placeholder="Ej: Buenos Aires" value={city} onChangeText={setCity} />
        </View>

        <View className="gap-2">
          <Text className="text-sm font-medium text-muted-foreground">Precio máx. (por moneda)</Text>
          <View className="flex-row gap-2">
            {CURRENCIES.map((c) => (
              <Chip
                key={c}
                label={c}
                active={currency === c}
                onPress={() => setCurrency(currency === c ? undefined : c)}
              />
            ))}
          </View>
          {currency ? (
            <Input
              placeholder={`Máximo en ${currency}`}
              keyboardType="numeric"
              value={maxPrice}
              onChangeText={setMaxPrice}
            />
          ) : null}
        </View>

        <View className="flex-row gap-3 pt-2">
          <Button
            label="Limpiar"
            variant="outline"
            className="flex-1"
            onPress={() => {
              onApply({});
              onClose();
            }}
          />
          <Button label="Aplicar" className="flex-1" onPress={apply} />
        </View>
      </View>
    </Modal>
  );
}
