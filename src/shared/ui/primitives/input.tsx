import { TextInput, type TextInputProps } from 'react-native';

import { cn } from '@/shared/ui/lib/cn';

type Props = TextInputProps & { className?: string };

/** Themed text input atom built on the design tokens. */
export function Input({ className, ...props }: Props) {
  return (
    <TextInput
      placeholderTextColor="#9ca3af"
      className={cn(
        'h-12 w-full rounded-md border border-input bg-background px-4 text-base text-foreground',
        className,
      )}
      {...props}
    />
  );
}
