import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Text } from '@/shared/ui/primitives/text';

export function FichaSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-2 border-b border-border px-5 py-4">
      <Text className="text-base font-bold">{title}</Text>
      {children}
    </View>
  );
}
