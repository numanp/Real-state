/**
 * Unit tests for the pure reel-playback decision helpers. These keep the
 * play/branch logic testable without an RN component harness (the expo-video
 * wiring itself is covered by tsc + lint + review + deferred device check).
 * TDD RED phase: fails until reel-playback.ts exists.
 */
import { describe, expect, it } from 'vitest';

import type { ReelMedia } from '@/features/feed/domain/entities/feed-item';
import { isPlayableVideo, shouldPlay } from '@/features/feed/ui/lib/reel-playback';

function videoReel(overrides: Partial<ReelMedia> = {}): ReelMedia {
  return {
    id: 'reel-1',
    mediaType: 'video',
    sources: ['https://signed.example/source.mp4'],
    posterUrl: 'https://signed.example/poster.webp',
    aspectRatio: 0.5625,
    ...overrides,
  };
}

function imageSetReel(overrides: Partial<ReelMedia> = {}): ReelMedia {
  return {
    id: 'reel-2',
    mediaType: 'image_set',
    sources: ['https://signed.example/img_0.webp', 'https://signed.example/img_1.webp'],
    posterUrl: 'https://signed.example/poster.webp',
    aspectRatio: 0.5625,
    ...overrides,
  };
}

describe('isPlayableVideo', () => {
  it('is true for a video reel with at least one source', () => {
    expect(isPlayableVideo(videoReel())).toBe(true);
  });

  it('is false for an image_set reel', () => {
    expect(isPlayableVideo(imageSetReel())).toBe(false);
  });

  it('is false for a video reel with no sources (fail safe to poster)', () => {
    expect(isPlayableVideo(videoReel({ sources: [] }))).toBe(false);
  });
});

describe('shouldPlay', () => {
  it('plays only when the card is active AND the reel is a playable video', () => {
    expect(shouldPlay(true, videoReel())).toBe(true);
  });

  it('does NOT play when the card is not active', () => {
    expect(shouldPlay(false, videoReel())).toBe(false);
  });

  it('does NOT play an image_set even when active', () => {
    expect(shouldPlay(true, imageSetReel())).toBe(false);
  });

  it('does NOT play a sourceless video even when active', () => {
    expect(shouldPlay(true, videoReel({ sources: [] }))).toBe(false);
  });
});
