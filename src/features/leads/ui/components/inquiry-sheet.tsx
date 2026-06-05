import { useEffect, useState } from 'react';
import { Modal, Pressable, View } from 'react-native';

import { useSendLead } from '@/features/leads/ui/hooks/use-send-lead';
import { LeadError, type LeadErrorCode } from '@/features/leads/domain/ports/leads-repository';
import { MESSAGE_MAX } from '@/features/leads/domain/entities/lead';
import { Button } from '@/shared/ui/primitives/button';
import { Input } from '@/shared/ui/primitives/input';
import { Text } from '@/shared/ui/primitives/text';

interface Props {
  visible: boolean;
  propertyId: string;
  onClose: () => void;
}

const ERROR_TEXT: Record<LeadErrorCode, string> = {
  auth_required: 'Iniciá sesión para enviar una consulta.',
  invalid_message: 'Escribí un mensaje para el anunciante.',
  property_not_found: 'Este aviso ya no está disponible.',
  self_inquiry: 'No podés consultar tu propio aviso.',
  lead_rate_limited: 'Ya enviaste una consulta a este aviso hoy.',
  unknown: 'No pudimos enviar tu consulta. Probá de nuevo.',
};

/** Standalone inquiry sheet (Option A): a message field + submit, independent of
 *  the entitlement-gated ContactSheet. Parent-controlled via visible/onClose,
 *  mirroring ReviewSheet/ContactSheet. */
export function InquirySheet({ visible, propertyId, onClose }: Props) {
  const { send, loading, error } = useSendLead(propertyId);
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);

  // Reset the form each time the sheet opens.
  useEffect(() => {
    if (visible) {
      setMessage('');
      setSent(false);
    }
  }, [visible]);

  async function onSubmit() {
    const text = message.trim();
    if (!text) return;
    const created = await send(text);
    if (created) setSent(true);
  }

  const errorText = error
    ? error instanceof LeadError
      ? ERROR_TEXT[error.code]
      : ERROR_TEXT.unknown
    : null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/50" onPress={onClose} />
      <View className="absolute inset-x-0 bottom-0 gap-3 rounded-t-3xl bg-background p-5 pb-10">
        <Text className="text-lg font-bold">Consultar al anunciante</Text>

        {sent ? (
          <View className="gap-3 py-2">
            <Text className="text-sm">¡Listo! Tu consulta fue enviada. El anunciante la verá en su bandeja.</Text>
            <Button label="Cerrar" onPress={onClose} />
          </View>
        ) : (
          <View className="gap-2">
            <Input
              className="h-24 py-3"
              placeholder="Hola, me interesa esta propiedad. ¿Sigue disponible?"
              value={message}
              onChangeText={setMessage}
              maxLength={MESSAGE_MAX}
              multiline
              textAlignVertical="top"
            />
            <Button
              label={loading ? 'Enviando…' : 'Enviar consulta'}
              disabled={loading || message.trim().length === 0}
              onPress={onSubmit}
            />
            {errorText ? <Text className="text-sm text-destructive">{errorText}</Text> : null}
          </View>
        )}
      </View>
    </Modal>
  );
}
