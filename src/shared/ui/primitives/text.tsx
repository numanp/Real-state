import { Text as RNText, type TextProps } from 'react-native';

import { cn } from '@/shared/ui/lib/cn';

type Props = TextProps & { className?: string };

/** Themed text atom — defaults to body size on the foreground token. */
export function Text({ className, ...props }: Props) {
  return <RNText className={cn('text-base text-foreground', className)} {...props} />;
}
