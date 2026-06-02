import { cva, type VariantProps } from 'class-variance-authority';
import { Pressable, Text, type PressableProps } from 'react-native';

import { cn } from '@/shared/ui/lib/cn';

const buttonVariants = cva('flex-row items-center justify-center rounded-md', {
  variants: {
    variant: {
      default: 'bg-primary active:opacity-90',
      secondary: 'bg-secondary active:opacity-90',
      destructive: 'bg-destructive active:opacity-90',
      outline: 'border border-input bg-background active:bg-accent',
      ghost: 'active:bg-accent',
    },
    size: {
      default: 'h-11 px-5',
      sm: 'h-9 px-3',
      lg: 'h-12 px-6',
    },
  },
  defaultVariants: { variant: 'default', size: 'default' },
});

const labelVariants = cva('text-sm font-medium', {
  variants: {
    variant: {
      default: 'text-primary-foreground',
      secondary: 'text-secondary-foreground',
      destructive: 'text-destructive-foreground',
      outline: 'text-foreground',
      ghost: 'text-foreground',
    },
  },
  defaultVariants: { variant: 'default' },
});

type Props = PressableProps &
  VariantProps<typeof buttonVariants> & {
    label: string;
    className?: string;
  };

/** Themed button atom built on the design tokens (no hardcoded colors/sizes). */
export function Button({ label, variant, size, className, ...props }: Props) {
  return (
    <Pressable className={cn(buttonVariants({ variant, size }), className)} {...props}>
      <Text className={labelVariants({ variant })}>{label}</Text>
    </Pressable>
  );
}
