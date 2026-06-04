import { usePushRegistration } from '@/features/push/ui/hooks/use-push-registration';

/** Mount-once, renders nothing: registers the device push token on sign-in. */
export function PushRegistrar() {
  usePushRegistration();
  return null;
}
