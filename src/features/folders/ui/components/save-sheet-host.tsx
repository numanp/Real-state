import { useSaveSheetStore } from '@/core/store/save-sheet-store';
import { useInteractionsStore } from '@/core/store/interactions-store';
import { SaveSheet } from '@/features/folders/ui/components/save-sheet';
import { useFeedTracking } from '@/features/personalization/ui/use-feed-tracking';

/** The ONE SaveSheet for the whole feed. Mounted once at the screen level so a
 *  recycled list of cards renders a single Modal instead of one per card. Cards
 *  open it imperatively via useSaveSheetStore.open(propertyId). */
export function SaveSheetHost() {
  const propertyId = useSaveSheetStore((s) => s.propertyId);
  const close = useSaveSheetStore((s) => s.close);
  const setSaved = useInteractionsStore((s) => s.setSaved);
  const { trackSave } = useFeedTracking();

  return (
    <SaveSheet
      visible={propertyId != null}
      propertyId={propertyId ?? ''}
      onClose={close}
      onSaved={() => {
        if (!propertyId) return;
        setSaved(propertyId, true);
        trackSave(propertyId);
      }}
    />
  );
}
