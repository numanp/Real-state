import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Check } from 'lucide-react-native';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCompareStore } from '@/core/store/compare-store';
import { buildComparison } from '@/features/compare/domain/comparison';
import { useComparison } from '@/features/compare/ui/hooks/use-comparison';
import { cn } from '@/shared/ui/lib/cn';
import { formatMoney } from '@/shared/ui/lib/format';
import { Button } from '@/shared/ui/primitives/button';
import { Text } from '@/shared/ui/primitives/text';

export function CompareScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const ids = useCompareStore((s) => s.selectedIds);
  const { properties, loading } = useComparison(ids);
  const rows = buildComparison(properties);

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }}
    >
      <View className="flex-row items-center justify-between px-5 pb-3">
        <Text className="text-2xl font-bold">Comparar</Text>
        <Button label="‹ Volver" variant="secondary" size="sm" onPress={() => router.back()} />
      </View>

      {loading ? (
        <Text className="px-5 py-8 text-center text-muted-foreground">Cargando…</Text>
      ) : properties.length < 2 ? (
        <Text className="px-5 py-8 text-center text-muted-foreground">
          Elegí al menos 2 propiedades en Guardados para comparar.
        </Text>
      ) : (
        <View className="px-3">
          {/* Property column headers */}
          <View className="flex-row">
            <View className="w-24" />
            {properties.map((p) => (
              <Pressable
                key={p.id}
                className="flex-1 px-1"
                onPress={() => router.push(`/property/${p.id}`)}
              >
                <Image
                  source={p.gallery[0]}
                  style={{ width: '100%', height: 72 }}
                  contentFit="cover"
                  className="rounded-lg"
                  transition={150}
                />
                <Text className="pt-1 text-xs font-bold" numberOfLines={1}>
                  {formatMoney(p.price.amountCents, p.price.currency)}
                  {p.price.period === 'monthly' ? '/mes' : ''}
                </Text>
                <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                  {p.title}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Attribute rows */}
          <View className="mt-3 overflow-hidden rounded-xl border border-border">
            {rows.map((r, ri) => (
              <View
                key={r.label}
                className={cn('flex-row', ri < rows.length - 1 && 'border-b border-border')}
              >
                <View className="w-24 justify-center px-2 py-3">
                  <Text className="text-xs text-muted-foreground">{r.label}</Text>
                </View>
                {r.values.map((v, i) => (
                  <View
                    key={i}
                    className={cn('flex-1 justify-center px-1 py-3', r.bestIndex === i && 'bg-secondary')}
                  >
                    <View className="flex-row items-center justify-center gap-1">
                      <Text
                        className={cn('text-center text-sm', r.bestIndex === i && 'font-bold')}
                        numberOfLines={1}
                      >
                        {v}
                      </Text>
                      {r.bestIndex === i ? <Check size={12} color="#16a34a" /> : null}
                    </View>
                  </View>
                ))}
              </View>
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );
}
