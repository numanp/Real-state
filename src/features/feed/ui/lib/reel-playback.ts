/**
 * Pure decision helpers for reel playback. Kept out of the component so the
 * branch logic (video vs. image-set, play vs. pause) is unit-testable without an
 * RN render harness, and so the same rules drive both the player wiring and the
 * web/poster fallback.
 */
import type { ReelMedia } from '@/features/feed/domain/entities/feed-item';

/**
 * A reel is a playable video only when its mediaType is 'video' AND it carries
 * at least one (signed) source URL. A sourceless video fails safe to the poster
 * so a missing/unsigned path never mounts a broken player.
 */
export function isPlayableVideo(reel: ReelMedia): boolean {
  return reel.mediaType === 'video' && reel.sources.length > 0;
}

/**
 * The video plays only when this card is the active (viewable) item AND the reel
 * is a playable video. Off-screen / non-active cards stay paused (poster only),
 * which bounds decoder usage to the active card (REELS-FICHA §7.5).
 */
export function shouldPlay(isActive: boolean, reel: ReelMedia): boolean {
  return isActive && isPlayableVideo(reel);
}
