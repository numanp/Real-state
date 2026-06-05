import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useFeedUiStore } from '@/core/store/feed-ui-store';
import type { ReelMedia } from '@/features/feed/domain/entities/feed-item';

interface Props {
  reel: ReelMedia;
  /** True when this card is the active (viewable) item. Only then does it play. */
  isActive: boolean;
}

/**
 * Plays a single reel video on the active card and falls back to the poster
 * everywhere else. The player is per-card (one decoder per card) and is released
 * automatically by `useVideoPlayer` on unmount, so FlashList recycling bounds
 * memory (REELS-FICHA §7.5). Progressive paint (§7.4): the poster — itself
 * blurhash-backed — renders BENEATH the video and is only hidden once the player
 * reports its first frame, so the user sees blurhash -> poster -> video with no
 * black flash and no layout shift (the 9:16 box is reserved by the parent card).
 *
 * NOTE: the §7.1 single shared player (one decoder, source swapped to the active
 * index) is a DEFERRED optimization that needs on-device profiling; this
 * active-only per-card player is the correct, profilable-later baseline.
 */
export function ReelVideo({ reel, isActive }: Props) {
  const muted = useFeedUiStore((s) => s.muted);

  const source = reel.sources[0] ?? null;
  // Track WHICH source has painted (not a bare boolean): when FlashList recycles
  // this instance into a different reel, `source` changes and `firstFrame`
  // derives back to false on its own — no setState-in-effect, and crucially no
  // stale poster-hide that would flash black before the new player paints (§7.4).
  const [paintedSource, setPaintedSource] = useState<string | null>(null);
  const firstFrame = source !== null && paintedSource === source;
  const player = useVideoPlayer(source, (p) => {
    p.loop = true;
    p.muted = muted;
  });

  // Reactively mirror the global mute toggle onto the (mutable, native-backed)
  // player. expo-video exposes mute as a settable property — assigning it is the
  // documented reactive pattern. The react-compiler immutability rule can't see
  // that `player` is a native handle, hence the scoped disable.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability -- expo-video player is a native handle; muted is its public setter
    player.muted = muted;
  }, [player, muted]);

  // Play only while active; pause otherwise. `play()`/`pause()` are method calls
  // (not state writes), so a non-active card simply holds a paused player and
  // shows its poster (`showPoster` below).
  useEffect(() => {
    if (isActive) {
      player.play();
    } else {
      player.pause();
    }
  }, [player, isActive]);

  // Show the poster until the active player has painted its first frame, and
  // again whenever the card is not active. Visibility is DERIVED (no setState in
  // an effect): once buffered, a re-activated card swaps straight to video with
  // no black flash, while an inactive card always shows its still poster.
  const showPoster = !isActive || !firstFrame;

  return (
    <View style={{ flex: 1 }}>
      <VideoView
        player={player}
        contentFit="cover"
        nativeControls={false}
        onFirstFrameRender={() => setPaintedSource(source)}
        style={{ flex: 1 }}
      />

      {showPoster ? (
        <Image
          source={reel.posterUrl}
          placeholder={reel.blurhash}
          recyclingKey={reel.id}
          contentFit="cover"
          transition={200}
          priority="high"
          cachePolicy="memory-disk"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
      ) : null}
    </View>
  );
}
