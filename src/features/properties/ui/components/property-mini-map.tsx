import { AppleMaps, GoogleMaps } from 'expo-maps';
import { Platform, View } from 'react-native';

interface Props {
  latitude: number;
  longitude: number;
  title?: string;
}

const HEIGHT = 180;
const ZOOM = 15;

/** Native mini-map: a single pin at the property location. iOS → Apple Maps,
 *  Android → Google Maps. Requires a native dev build (expo-maps is a native
 *  module, not in Expo Go) and, on Android, a Google Maps API key in the app
 *  config. The web build resolves property-mini-map.web.tsx instead. */
export function PropertyMiniMap({ latitude, longitude, title }: Props) {
  const coordinates = { latitude, longitude };
  const cameraPosition = { coordinates, zoom: ZOOM };

  return (
    <View className="overflow-hidden rounded-2xl border border-border" style={{ height: HEIGHT }}>
      {Platform.OS === 'ios' ? (
        <AppleMaps.View
          style={{ flex: 1 }}
          cameraPosition={cameraPosition}
          markers={[{ coordinates, title }]}
          uiSettings={{
            compassEnabled: false,
            myLocationButtonEnabled: false,
            scaleBarEnabled: false,
            togglePitchEnabled: false,
          }}
          properties={{ isMyLocationEnabled: false, selectionEnabled: false }}
        />
      ) : (
        <GoogleMaps.View
          style={{ flex: 1 }}
          cameraPosition={cameraPosition}
          markers={[{ coordinates, title }]}
          uiSettings={{
            compassEnabled: false,
            myLocationButtonEnabled: false,
            mapToolbarEnabled: false,
            zoomControlsEnabled: false,
            scaleBarEnabled: false,
          }}
          properties={{ isMyLocationEnabled: false }}
        />
      )}
    </View>
  );
}
