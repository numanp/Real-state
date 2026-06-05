import { Bookmark, Heart, RotateCcw, Star, X } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useSaveSheetStore } from '@/core/store/save-sheet-store';
import { useCardActions } from '@/features/feed/ui/hooks/use-card-actions';
import { Text } from '@/shared/ui/primitives/text';

interface Props {
  propertyId: string;
  likes: number;
}

function Action({
  children,
  label,
  onPress,
}: {
  children: ReactNode;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} hitSlop={8} className="items-center gap-1">
      {children}
      <Text className="text-[11px] font-semibold text-white">{label}</Text>
    </Pressable>
  );
}

/** TikTok/Tinder-style action rail: like (animated), super-like, save, pass, rewind. */
export function FeedActions({ propertyId, likes }: Props) {
  const { isLiked, isSaved, requireAuth, toggleLike, pass, superLike, rewind } =
    useCardActions(propertyId);

  const scale = useSharedValue(1);
  const heartStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  function onLike() {
    if (!isLiked) {
      scale.value = withSequence(withTiming(1.3, { duration: 110 }), withSpring(1, { damping: 6 }));
    }
    void toggleLike();
  }

  return (
    <View className="absolute bottom-28 right-3 items-center gap-5">
      {/* Server count already includes the viewer's like (denormalized like_count),
          so we render it raw — adding (isLiked ? 1 : 0) double-counted any property
          the viewer had already liked. The heart fill/animation is the like feedback. */}
      <Action label={String(likes)} onPress={onLike}>
        <Animated.View style={heartStyle}>
          <Heart
            size={36}
            color={isLiked ? '#ef4444' : '#ffffff'}
            fill={isLiked ? '#ef4444' : 'transparent'}
          />
        </Animated.View>
      </Action>

      {/* Super-like is a one-shot action, not a toggle: the star stays an outline.
          It must NOT fill from `isLiked` (the heart's state) — that read as "super-liked". */}
      <Action label="Super" onPress={() => void superLike()}>
        <Star size={32} color="#facc15" fill="transparent" />
      </Action>

      <Action
        label="Guardar"
        onPress={() => {
          if (requireAuth()) useSaveSheetStore.getState().open(propertyId);
        }}
      >
        <Bookmark size={32} color="#ffffff" fill={isSaved ? '#ffffff' : 'transparent'} />
      </Action>

      <Action label="Pasar" onPress={pass}>
        <X size={32} color="#ffffff" />
      </Action>

      <Action label="Volver" onPress={rewind}>
        <RotateCcw size={26} color="#ffffff" />
      </Action>
    </View>
  );
}
