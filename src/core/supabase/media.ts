/*
  Demo media: the seed loads metadata but no actual files into the private
  storage buckets, so we render deterministic picsum images keyed by the
  property id. When real listings upload media, swap these for signed URLs
  off the `reels` / `property-images` buckets (storage paths already in the DB).
*/
const GALLERY_COUNT = 6;

export function posterFor(id: string): string {
  return `https://picsum.photos/seed/${encodeURIComponent(id)}/900/1600`;
}

export function galleryFor(id: string): string[] {
  return Array.from(
    { length: GALLERY_COUNT },
    (_, i) => `https://picsum.photos/seed/${encodeURIComponent(id)}-${i}/1200/900`,
  );
}
