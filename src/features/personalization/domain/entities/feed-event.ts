/** Implicit + explicit signals from the feed — the substrate for ranking,
 *  daily picks, similar-properties and alerts. */
export type FeedEventType =
  | 'view' // card became active (with dwellMs)
  | 'detail' // opened the ficha
  | 'like'
  | 'unlike'
  | 'pass' // swiped away / disliked (negative signal)
  | 'save'
  | 'unsave'
  | 'super_like'
  | 'rewind'
  | 'share';

export interface FeedEvent {
  userId: string;
  propertyId: string | null;
  type: FeedEventType;
  /** Time the card was active, for `view` events. */
  dwellMs?: number;
  /** Index in the feed when the event happened. */
  position?: number;
  /** ISO timestamp. */
  at: string;
}
