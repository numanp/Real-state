import { useRouter } from 'expo-router';
import { Trash2 } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';

import { useSessionStore } from '@/core/store/session-store';
import type { AgencyReview } from '@/features/reviews/domain/entities/review';
import { StarDisplay, StarInput } from '@/features/reviews/ui/components/star-rating';
import { useAgencyReviews } from '@/features/reviews/ui/hooks/use-agency-reviews';
import { Button } from '@/shared/ui/primitives/button';
import { Input } from '@/shared/ui/primitives/input';
import { Text } from '@/shared/ui/primitives/text';

interface Props {
  visible: boolean;
  agencyId?: string;
  agencyName?: string;
  onClose: () => void;
}

/** Bottom sheet: agency rating summary + the caller's own review form (gated by
 *  session) + the public reviews list. All writes go through the gated RPCs. */
export function ReviewSheet({ visible, agencyId, agencyName, onClose }: Props) {
  const router = useRouter();
  const session = useSessionStore((s) => s.session);
  const { rating, reviews, myReview, loading, load, submit, remove } = useAgencyReviews(agencyId);
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) void load();
  }, [visible, load]);

  // Prefill the form from the caller's existing review (edit flow).
  useEffect(() => {
    if (visible) {
      setStars(myReview?.rating ?? 0);
      setComment(myReview?.comment ?? '');
    }
  }, [visible, myReview]);

  async function onSubmit() {
    if (stars < 1) return;
    setBusy(true);
    try {
      await submit(stars, comment.trim() || undefined);
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    setBusy(true);
    try {
      await remove();
      setStars(0);
      setComment('');
    } finally {
      setBusy(false);
    }
  }

  const goSignIn = () => {
    onClose();
    router.push('/sign-in');
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/50" onPress={onClose} />
      <View className="absolute inset-x-0 bottom-0 gap-3 rounded-t-3xl bg-background p-5 pb-10">
        <Text className="text-lg font-bold" numberOfLines={1}>
          Reseñas{agencyName ? ` · ${agencyName}` : ''}
        </Text>

        <View className="flex-row items-center gap-2">
          {rating?.average != null ? (
            <>
              <StarDisplay value={rating.average} size={16} />
              <Text className="text-sm font-medium">{rating.average.toFixed(1)}</Text>
              <Text className="text-sm text-muted-foreground">
                ({rating.reviewCount} {rating.reviewCount === 1 ? 'reseña' : 'reseñas'})
              </Text>
            </>
          ) : (
            <Text className="text-sm text-muted-foreground">Todavía no hay reseñas.</Text>
          )}
        </View>

        {session ? (
          <View className="gap-2 rounded-2xl border border-border p-3">
            <Text className="text-sm font-medium">{myReview ? 'Tu reseña' : 'Dejá tu reseña'}</Text>
            <StarInput value={stars} onChange={setStars} />
            <Input
              placeholder="Contanos tu experiencia (opcional)…"
              value={comment}
              onChangeText={setComment}
              maxLength={1000}
            />
            <View className="flex-row items-center gap-2">
              <Button
                className="flex-1"
                label={busy ? 'Guardando…' : myReview ? 'Actualizar' : 'Publicar'}
                disabled={busy || stars < 1}
                onPress={onSubmit}
              />
              {myReview ? (
                <Pressable
                  onPress={onDelete}
                  disabled={busy}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Eliminar mi reseña"
                  className="rounded-md border border-border p-2.5 active:opacity-80"
                >
                  <Trash2 size={18} color="#ef4444" />
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : (
          <View className="gap-2 rounded-2xl border border-border bg-secondary p-3">
            <Text className="text-sm">Iniciá sesión para dejar tu reseña.</Text>
            <Button label="Iniciar sesión" variant="outline" onPress={goSignIn} />
          </View>
        )}

        <ScrollView className="max-h-64">
          {loading && reviews.length === 0 ? (
            <Text className="py-3 text-muted-foreground">Cargando…</Text>
          ) : reviews.length === 0 ? (
            <Text className="py-3 text-muted-foreground">Sé el primero en reseñar.</Text>
          ) : (
            reviews.map((r) => <ReviewRow key={r.id} review={r} />)
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

function ReviewRow({ review }: { review: AgencyReview }) {
  return (
    <View className="gap-1 border-b border-border py-3">
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-medium" numberOfLines={1}>
          {review.reviewerName}
        </Text>
        <StarDisplay value={review.rating} size={12} />
      </View>
      {review.comment ? (
        <Text className="text-sm text-muted-foreground">{review.comment}</Text>
      ) : null}
    </View>
  );
}
