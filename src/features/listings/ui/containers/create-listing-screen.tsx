import { useRouter } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { container } from '@/core/di/container';
import { useSessionStore } from '@/core/store/session-store';
import type { ListingKind, ListingOperation } from '@/features/listings/domain/entities/listing';
import { cn } from '@/shared/ui/lib/cn';
import { Button } from '@/shared/ui/primitives/button';
import { Input } from '@/shared/ui/primitives/input';
import { Text } from '@/shared/ui/primitives/text';

const KINDS: { value: ListingKind; label: string }[] = [
  { value: 'apartment', label: 'Depto' },
  { value: 'house', label: 'Casa' },
  { value: 'studio', label: 'Studio' },
  { value: 'land', label: 'Terreno' },
  { value: 'commercial', label: 'Local' },
];
const CURRENCIES = ['USD', 'ARS', 'BRL'];

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Text
      onPress={onPress}
      className={cn(
        'overflow-hidden rounded-full border px-4 py-2 text-sm',
        active ? 'border-primary bg-primary text-primary-foreground' : 'border-input text-foreground',
      )}
    >
      {label}
    </Text>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View className="gap-2">
      <Text className="text-sm font-medium text-muted-foreground">{label}</Text>
      {children}
    </View>
  );
}

export function CreateListingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const session = useSessionStore((s) => s.session);

  const [title, setTitle] = useState('');
  const [operation, setOperation] = useState<ListingOperation>('rent');
  const [kind, setKind] = useState<ListingKind>('apartment');
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState('ARS');
  const [bedrooms, setBedrooms] = useState('');
  const [bathrooms, setBathrooms] = useState('');
  const [area, setArea] = useState('');
  const [city, setCity] = useState('');
  const [region, setRegion] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!session) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-background px-6">
        <Text className="text-lg font-bold">Ingresá para publicar</Text>
        <Button label="Ingresar" onPress={() => router.push('/sign-in')} />
      </View>
    );
  }

  async function submit() {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      const id = await container.listings.create(session.user.id, {
        title: title.trim(),
        operation,
        kind,
        priceCents: Math.round(Number(price) * 100),
        currency,
        bedrooms: Number(bedrooms) || 0,
        bathrooms: Number(bathrooms) || 0,
        areaSqm: area ? Number(area) : undefined,
        city: city.trim(),
        region: region.trim() || undefined,
        description: description.trim() || undefined,
      });
      router.replace(`/property/${id}`);
    } catch {
      setError('Revisá los campos: título (3+ letras), precio y ciudad son obligatorios.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 32, gap: 16 }}
    >
      <View className="flex-row items-center justify-between px-5">
        <Text className="text-2xl font-bold">Publicar propiedad</Text>
        <Button label="‹ Volver" variant="secondary" size="sm" onPress={() => router.back()} />
      </View>

      <View className="gap-4 px-5">
        <Field label="Operación">
          <View className="flex-row gap-2">
            <Chip label="Alquilar" active={operation === 'rent'} onPress={() => setOperation('rent')} />
            <Chip label="Vender" active={operation === 'buy'} onPress={() => setOperation('buy')} />
          </View>
        </Field>

        <Field label="Tipo">
          <View className="flex-row flex-wrap gap-2">
            {KINDS.map((k) => (
              <Chip key={k.value} label={k.label} active={kind === k.value} onPress={() => setKind(k.value)} />
            ))}
          </View>
        </Field>

        <Field label="Título">
          <Input placeholder="Ej: Luminoso 2 ambientes con balcón" value={title} onChangeText={setTitle} />
        </Field>

        <Field label="Precio">
          <Input placeholder="Monto" keyboardType="numeric" value={price} onChangeText={setPrice} />
          <View className="flex-row gap-2">
            {CURRENCIES.map((c) => (
              <Chip key={c} label={c} active={currency === c} onPress={() => setCurrency(c)} />
            ))}
          </View>
        </Field>

        <View className="flex-row gap-3">
          <View className="flex-1">
            <Field label="Ambientes">
              <Input placeholder="0" keyboardType="numeric" value={bedrooms} onChangeText={setBedrooms} />
            </Field>
          </View>
          <View className="flex-1">
            <Field label="Baños">
              <Input placeholder="0" keyboardType="numeric" value={bathrooms} onChangeText={setBathrooms} />
            </Field>
          </View>
          <View className="flex-1">
            <Field label="m²">
              <Input placeholder="0" keyboardType="numeric" value={area} onChangeText={setArea} />
            </Field>
          </View>
        </View>

        <Field label="Ciudad">
          <Input placeholder="Ej: Buenos Aires" value={city} onChangeText={setCity} />
        </Field>
        <Field label="Provincia / Región (opcional)">
          <Input placeholder="Ej: CABA" value={region} onChangeText={setRegion} />
        </Field>
        <Field label="Descripción (opcional)">
          <Input
            placeholder="Contá lo mejor de la propiedad…"
            value={description}
            onChangeText={setDescription}
            multiline
            className="h-24 py-3"
          />
        </Field>

        {error ? <Text className="text-sm text-destructive">{error}</Text> : null}
        <Button label={busy ? 'Publicando…' : 'Publicar'} disabled={busy} onPress={submit} />
      </View>
    </ScrollView>
  );
}
