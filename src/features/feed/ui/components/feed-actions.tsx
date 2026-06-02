import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { useCardActions } from '@/features/feed/ui/hooks/use-card-actions';
import { SaveSheet } from '@/features/folders/ui/components/save-sheet';
import { Text } from '@/shared/ui/primitives/text';

interface Props {
  propertyId: string;
  likes: number;
}

/** TikTok-style action rail (like + save) overlaid on a feed card. */
export function FeedActions({ propertyId, likes }: Props) {
  const { isLiked, isSaved, requireAuth, toggleLike, markSaved } = useCardActions(propertyId);
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <>
      <View className="absolute bottom-36 right-3 items-center gap-6">
        <Pressable onPress={toggleLike} className="items-center gap-1">
          <Text className="text-4xl">{isLiked ? '❤️' : '🤍'}</Text>
          <Text className="text-xs font-semibold text-white">{likes + (isLiked ? 1 : 0)}</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            if (requireAuth()) setSheetOpen(true);
          }}
          className="items-center gap-1"
        >
          <Text className="text-4xl">{isSaved ? '🔖' : '🏷️'}</Text>
          <Text className="text-xs font-semibold text-white">Guardar</Text>
        </Pressable>
      </View>
      <SaveSheet
        visible={sheetOpen}
        propertyId={propertyId}
        onClose={() => setSheetOpen(false)}
        onSaved={markSaved}
      />
    </>
  );
}
