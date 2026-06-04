import { useLocalSearchParams, useRouter } from 'expo-router';
import { Share2 } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { container } from '@/core/di/container';
import { ContactSheet } from '@/features/contact/ui/components/contact-sheet';
import { useFeedTracking } from '@/features/personalization/ui/use-feed-tracking';
import { AmenitiesList } from '@/features/properties/ui/components/amenities-list';
import { CostList } from '@/features/properties/ui/components/cost-list';
import { FichaSection } from '@/features/properties/ui/components/ficha-section';
import { PhotoGallery } from '@/features/properties/ui/components/photo-gallery';
import { SpecsGrid } from '@/features/properties/ui/components/specs-grid';
import { useProperty } from '@/features/properties/ui/hooks/use-property';
import { shareProperty } from '@/features/properties/ui/lib/share-property';
import type { AgencyRating } from '@/features/reviews/domain/entities/review';
import { AgencyRatingBadge } from '@/features/reviews/ui/components/rating-badge';
import { ReviewSheet } from '@/features/reviews/ui/components/review-sheet';
import { formatMoney } from '@/shared/ui/lib/format';
import { Button } from '@/shared/ui/primitives/button';
import { Text } from '@/shared/ui/primitives/text';

export function PropertyDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { property, loading } = useProperty(id);
  const { trackShare } = useFeedTracking();
  const [contactOpen, setContactOpen] = useState(false);
  const [reviewsOpen, setReviewsOpen] = useState(false);
  const agencyId = property?.advertiser.agencyId;
  const [agencyRating, setAgencyRating] = useState<AgencyRating | null>(null);

  useEffect(() => {
    if (!agencyId) {
      setAgencyRating(null);
      return;
    }
    let active = true;
    void container.reviews
      .getRating(agencyId)
      .then((r) => {
        if (active) setAgencyRating(r);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [agencyId]);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Text className="text-muted-foreground">Cargando…</Text>
      </View>
    );
  }

  if (!property) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-background px-6">
        <Text className="text-lg font-bold">Propiedad no encontrada</Text>
        <Button label="Volver" variant="outline" onPress={() => router.back()} />
      </View>
    );
  }

  const priceLabel = `${formatMoney(property.price.amountCents, property.price.currency)}${
    property.price.period === 'monthly' ? '/mes' : ''
  }`;
  const advertiserLabel =
    property.advertiser.type === 'owner'
      ? 'Dueño directo'
      : (property.advertiser.name ?? 'Inmobiliaria');

  async function onShare() {
    if (!property) return;
    trackShare(property.id);
    await shareProperty(property);
  }

  return (
    <View className="flex-1 bg-background">
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}>
        <PhotoGallery images={property.gallery} />

        <View className="gap-1 px-5 pt-4">
          <View className="self-start rounded-full bg-primary px-3 py-1">
            <Text className="text-xs font-semibold text-primary-foreground">
              {property.operation === 'buy' ? 'Venta' : 'Alquiler'} · {property.kind}
            </Text>
          </View>
          <Text className="text-3xl font-bold">{priceLabel}</Text>
          <CostList costs={property.costs} />
          <Text className="text-lg">{property.title}</Text>
          <Text className="text-sm text-muted-foreground">
            {[property.location.neighborhood, property.location.city, property.location.region]
              .filter(Boolean)
              .join(', ')}
          </Text>
        </View>

        <View className="mt-3 border-t border-border">
          <FichaSection title="Características">
            <SpecsGrid property={property} />
          </FichaSection>
          <FichaSection title="Amenities">
            <AmenitiesList amenities={property.amenities} />
          </FichaSection>
          <FichaSection title="Descripción">
            <Text className="text-sm leading-5">{property.description}</Text>
          </FichaSection>
          <FichaSection title="Anunciante">
            <View className="gap-2">
              <Text className="text-sm">{advertiserLabel}</Text>
              {agencyId ? (
                <AgencyRatingBadge
                  rating={agencyRating ?? { agencyId, reviewCount: 0, average: null }}
                  onPress={() => setReviewsOpen(true)}
                />
              ) : null}
            </View>
          </FichaSection>
        </View>
      </ScrollView>

      <View className="absolute left-3" style={{ top: insets.top + 8 }}>
        <Button label="‹ Volver" variant="secondary" size="sm" onPress={() => router.back()} />
      </View>

      <View className="absolute right-3" style={{ top: insets.top + 8 }}>
        <Pressable onPress={onShare} hitSlop={8} className="rounded-full bg-secondary p-2.5">
          <Share2 size={18} color="#18181b" />
        </Pressable>
      </View>

      <View
        className="absolute inset-x-0 bottom-0 border-t border-border bg-background px-5 pt-3"
        style={{ paddingBottom: insets.bottom + 12 }}
      >
        {/* Contact reveal is entitlement-gated server-side (get_listing_contact);
            the sheet renders the level the server returns. */}
        <Button label="Contactar" onPress={() => setContactOpen(true)} />
      </View>

      <ContactSheet
        visible={contactOpen}
        propertyId={property.id}
        onClose={() => setContactOpen(false)}
      />

      <ReviewSheet
        visible={reviewsOpen}
        agencyId={agencyId}
        agencyName={property.advertiser.name}
        onClose={() => setReviewsOpen(false)}
      />
    </View>
  );
}
