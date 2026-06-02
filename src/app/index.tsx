import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/shared/ui/primitives/button';
import { Text } from '@/shared/ui/primitives/text';

export default function HomeScreen() {
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View className="flex-1 items-center justify-center gap-4 bg-background px-6">
        <Text className="text-3xl font-bold">Reel Estate</Text>
        <Text className="text-center text-muted-foreground">
          Scrolleá propiedades como en TikTok. Fundación lista — el feed llega en M3.
        </Text>
        <Button label="Empezar" onPress={() => {}} />
      </View>
    </SafeAreaView>
  );
}
