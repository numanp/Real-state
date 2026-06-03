import { Bookmark, Heart } from 'lucide-react-native';
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
        <Pressable onPress={toggleLike} className="items-center gap-1" hitSlop={8}>
          <Heart
            size={36}
            color={isLiked ? '#ef4444' : '#ffffff'}
            fill={isLiked ? '#ef4444' : 'transparent'}
          />
          <Text className="text-xs font-semibold text-white">{likes + (isLiked ? 1 : 0)}</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            if (requireAuth()) setSheetOpen(true);
          }}
          className="items-center gap-1"
          hitSlop={8}
        >
          <Bookmark size={34} color="#ffffff" fill={isSaved ? '#ffffff' : 'transparent'} />
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
