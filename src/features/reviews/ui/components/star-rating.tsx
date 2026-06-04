import { Star } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { MAX_RATING } from '@/features/reviews/domain/entities/review';
import { AGENCY_GOLD as GOLD } from '@/features/reviews/ui/lib/colors';

const STARS = Array.from({ length: MAX_RATING }, (_, i) => i + 1);

/** Read-only star row. Fills to the nearest whole star of `value`. */
export function StarDisplay({ value, size = 14 }: { value: number; size?: number }) {
  const filled = Math.round(value);
  return (
    <View className="flex-row items-center">
      {STARS.map((n) => (
        <Star key={n} size={size} color={GOLD} fill={n <= filled ? GOLD : 'transparent'} />
      ))}
    </View>
  );
}

/** Interactive 1..5 star picker. */
export function StarInput({
  value,
  onChange,
  size = 30,
}: {
  value: number;
  onChange: (n: number) => void;
  size?: number;
}) {
  return (
    <View className="flex-row items-center gap-1">
      {STARS.map((n) => (
        <Pressable
          key={n}
          hitSlop={6}
          onPress={() => onChange(n)}
          accessibilityRole="button"
          accessibilityLabel={`${n} ${n === 1 ? 'estrella' : 'estrellas'}`}
        >
          <Star size={size} color={GOLD} fill={n <= value ? GOLD : 'transparent'} />
        </Pressable>
      ))}
    </View>
  );
}
