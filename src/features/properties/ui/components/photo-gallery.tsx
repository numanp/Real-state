import { Image } from 'expo-image';
import { ScrollView, useWindowDimensions, View } from 'react-native';

const HEIGHT = 320;

export function PhotoGallery({ images }: { images: string[] }) {
  const { width } = useWindowDimensions();

  if (images.length === 0) {
    return <View style={{ height: HEIGHT }} className="bg-muted" />;
  }

  return (
    <ScrollView
      horizontal
      pagingEnabled
      showsHorizontalScrollIndicator={false}
      style={{ height: HEIGHT }}
    >
      {images.map((uri, i) => (
        <Image
          key={`${uri}-${i}`}
          source={uri}
          style={{ width, height: HEIGHT }}
          contentFit="cover"
          transition={150}
        />
      ))}
    </ScrollView>
  );
}
