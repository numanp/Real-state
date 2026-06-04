import { View } from 'react-native';

import { Button } from '@/shared/ui/primitives/button';
import { Text } from '@/shared/ui/primitives/text';

/** Sticky bar shown over the Saved grid while properties are picked to compare. */
export function CompareBar({
  count,
  onCompare,
  onClear,
  bottomInset,
}: {
  count: number;
  onCompare: () => void;
  onClear: () => void;
  bottomInset: number;
}) {
  return (
    <View
      className="absolute inset-x-0 bottom-0 flex-row items-center gap-3 border-t border-border bg-background px-5 pt-3"
      style={{ paddingBottom: bottomInset + 12 }}
    >
      <Text className="text-sm text-muted-foreground">{count}/3</Text>
      <Button
        className="flex-1"
        label="Comparar"
        disabled={count < 2}
        onPress={onCompare}
      />
      <Button label="Limpiar" variant="secondary" onPress={onClear} />
    </View>
  );
}
