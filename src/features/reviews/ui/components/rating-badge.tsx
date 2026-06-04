import { Star } from 'lucide-react-native';
import { Pressable } from 'react-native';

import type { AgencyRating } from '@/features/reviews/domain/entities/review';
import { Text } from '@/shared/ui/primitives/text';

const GOLD = '#e2b340';

/** Compact agency rating chip shown next to the advertiser name. Tapping it
 *  opens the reviews sheet. Renders "Sin reseñas" when there are none. */
export function AgencyRatingBadge({
  rating,
  onPress,
}: {
  rating: AgencyRating;
  onPress?: () => void;
}) {
  const hasReviews = rating.average != null;
  const label = hasReviews
    ? `${rating.average!.toFixed(1)} · ${rating.reviewCount} ${rating.reviewCount === 1 ? 'reseña' : 'reseñas'}`
    : 'Sin reseñas';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={hasReviews ? `Calificación ${label}` : 'Sin reseñas, dejá la primera'}
      className="flex-row items-center gap-1.5 self-start rounded-full bg-secondary px-3 py-1 active:opacity-80"
    >
      <Star size={14} color={GOLD} fill={hasReviews ? GOLD : 'transparent'} />
      <Text className="text-xs font-medium">{label}</Text>
    </Pressable>
  );
}
