/**
 * Unit tests for the feed UI store (global mute for reel autoplay).
 * TDD RED phase: these fail until feed-ui-store.ts exists.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { useFeedUiStore } from '@/core/store/feed-ui-store';

describe('useFeedUiStore', () => {
  beforeEach(() => {
    // Reset to defaults between tests (the store is a module-level singleton).
    useFeedUiStore.setState({ muted: true });
  });

  it('defaults to muted (autoplay is muted per platform policy)', () => {
    expect(useFeedUiStore.getState().muted).toBe(true);
  });

  it('toggleMuted flips muted true -> false', () => {
    useFeedUiStore.getState().toggleMuted();
    expect(useFeedUiStore.getState().muted).toBe(false);
  });

  it('toggleMuted flips muted false -> true', () => {
    useFeedUiStore.getState().toggleMuted();
    useFeedUiStore.getState().toggleMuted();
    expect(useFeedUiStore.getState().muted).toBe(true);
  });

  it('setMuted(false) unmutes', () => {
    useFeedUiStore.getState().setMuted(false);
    expect(useFeedUiStore.getState().muted).toBe(false);
  });

  it('setMuted(true) mutes', () => {
    useFeedUiStore.getState().setMuted(false);
    useFeedUiStore.getState().setMuted(true);
    expect(useFeedUiStore.getState().muted).toBe(true);
  });
});
