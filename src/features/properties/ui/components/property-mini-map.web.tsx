import { MapPin } from 'lucide-react-native';
import { Linking, Pressable, View } from 'react-native';

import { Text } from '@/shared/ui/primitives/text';

interface Props {
  latitude: number;
  longitude: number;
  title?: string;
}

const HEIGHT = 180;

/** Web fallback for PropertyMiniMap. expo-maps has no web implementation, so on
 *  web we render a tappable placeholder that deep-links the coordinates to an
 *  external map. The real interactive map renders on iOS/Android. */
export function PropertyMiniMap({ latitude, longitude, title }: Props) {
  const open = () =>
    void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`);
  return (
    <Pressable
      onPress={open}
      accessibilityRole="button"
      accessibilityLabel="Abrir la ubicación en el mapa"
      className="items-center justify-center gap-2 rounded-2xl border border-border bg-secondary active:opacity-80"
      style={{ height: HEIGHT }}
    >
      <MapPin size={28} color="#208AEF" />
      <Text className="text-sm font-medium">{title ?? 'Ubicación'}</Text>
      <Text className="text-xs text-muted-foreground">Abrir en el mapa</Text>
    </Pressable>
  );
}
