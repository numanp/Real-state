import { useRouter } from 'expo-router';
import { Lock, Mail, MessageCircle, Phone } from 'lucide-react-native';
import { type ReactNode, useEffect } from 'react';
import { Linking, Modal, Pressable, View } from 'react-native';

import type { ContactReveal } from '@/features/contact/domain/entities/contact-reveal';
import { useListingContact } from '@/features/contact/ui/hooks/use-listing-contact';
import { Button } from '@/shared/ui/primitives/button';
import { Text } from '@/shared/ui/primitives/text';

interface Props {
  visible: boolean;
  propertyId: string;
  onClose: () => void;
}

/** Bottom sheet that reveals advertiser contact per the server-resolved level
 *  (none → paywall, limited → masked, full → actionable channels). */
export function ContactSheet({ visible, propertyId, onClose }: Props) {
  const router = useRouter();
  const { reveal, loading, error, load } = useListingContact(propertyId);

  useEffect(() => {
    if (visible) void load();
  }, [visible, load]);

  const goPremium = () => {
    onClose();
    router.push('/membership');
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/50" onPress={onClose} />
      <View className="absolute inset-x-0 bottom-0 gap-3 rounded-t-3xl bg-background p-5 pb-10">
        <Text className="text-lg font-bold">Contacto</Text>
        {loading ? (
          <Text className="py-4 text-muted-foreground">Cargando…</Text>
        ) : error ? (
          <View className="gap-3 py-2">
            <Text className="text-sm text-destructive">No pudimos cargar el contacto.</Text>
            <Button label="Reintentar" variant="secondary" onPress={() => void load()} />
          </View>
        ) : !reveal ? (
          <Text className="py-4 text-muted-foreground">Cargando…</Text>
        ) : reveal.rateLimited ? (
          <Text className="py-4 text-sm">
            Alcanzaste el límite diario de contactos. Probá de nuevo mañana.
          </Text>
        ) : reveal.level === 'full' ? (
          <FullContact reveal={reveal} />
        ) : reveal.level === 'limited' ? (
          <LimitedContact reveal={reveal} onUpgrade={goPremium} />
        ) : (
          <LockedContact reveal={reveal} onUpgrade={goPremium} />
        )}
      </View>
    </Modal>
  );
}

function ChannelRow({
  icon,
  label,
  onPress,
}: {
  icon: ReactNode;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-3 rounded-xl border border-border p-4"
    >
      {icon}
      <Text className="text-base font-medium">{label}</Text>
    </Pressable>
  );
}

function FullContact({ reveal }: { reveal: ContactReveal }) {
  const digits = reveal.whatsapp?.replace(/[^0-9]/g, '');
  // Sanitize before building tel:/mailto: URIs — the reveal comes from the RPC
  // but is never re-validated. Phone: keep only digits + leading '+' (drops tel
  // comma/pause smuggling). Email: ALLOWLIST valid address chars, so a crafted
  // value can't slip a newline/control byte into the mailto: header.
  const phone = reveal.phone?.replace(/[^0-9+]/g, '') || undefined;
  const email =
    reveal.email && /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(reveal.email)
      ? reveal.email
      : undefined;
  return (
    <View className="gap-2">
      {reveal.brokerName || reveal.agencyName ? (
        <Text className="text-sm text-muted-foreground">
          {[reveal.brokerName, reveal.agencyName].filter(Boolean).join(' · ')}
        </Text>
      ) : null}
      {digits ? (
        <ChannelRow
          icon={<MessageCircle size={20} color="#25D366" />}
          label="WhatsApp"
          onPress={() => void Linking.openURL(`https://wa.me/${digits}`)}
        />
      ) : null}
      {phone ? (
        <ChannelRow
          icon={<Phone size={20} color="#18181b" />}
          label={phone}
          onPress={() => void Linking.openURL(`tel:${phone}`)}
        />
      ) : null}
      {email ? (
        <ChannelRow
          icon={<Mail size={20} color="#18181b" />}
          label={email}
          onPress={() => void Linking.openURL(`mailto:${email}`)}
        />
      ) : null}
    </View>
  );
}

function LimitedContact({ reveal, onUpgrade }: { reveal: ContactReveal; onUpgrade: () => void }) {
  return (
    <View className="gap-3">
      {reveal.brokerName || reveal.agencyName ? (
        <Text className="text-sm text-muted-foreground">
          {[reveal.brokerName, reveal.agencyName].filter(Boolean).join(' · ')}
        </Text>
      ) : null}
      {reveal.whatsappMasked ? (
        <View className="flex-row items-center gap-3 rounded-xl border border-border p-4">
          <MessageCircle size={20} color="#a1a1aa" />
          <Text className="text-base">{reveal.whatsappMasked}</Text>
        </View>
      ) : null}
      <Text className="text-sm text-muted-foreground">
        Desbloqueá el número completo y el teléfono con Ultimate.
      </Text>
      <Button label="Ver planes" onPress={onUpgrade} />
    </View>
  );
}

function LockedContact({ reveal, onUpgrade }: { reveal: ContactReveal; onUpgrade: () => void }) {
  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-3 rounded-xl border border-border bg-secondary p-4">
        <Lock size={20} color="#18181b" />
        <Text className="flex-1 text-sm">
          {reveal.agencyName ? `Publicado por ${reveal.agencyName}. ` : ''}El contacto del anunciante
          es para suscriptores.
        </Text>
      </View>
      <Button label="Ver planes" onPress={onUpgrade} />
    </View>
  );
}
