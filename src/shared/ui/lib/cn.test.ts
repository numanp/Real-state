import { describe, expect, it } from 'vitest';

import { cn } from '@/shared/ui/lib/cn';

describe('cn', () => {
  it('joins class names', () => {
    expect(cn('px-2', 'text-foreground')).toBe('px-2 text-foreground');
  });

  it('resolves Tailwind conflicts last-wins', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });

  it('drops falsy conditionals', () => {
    expect(cn('a', false && 'b', undefined, 'c')).toBe('a c');
  });
});
