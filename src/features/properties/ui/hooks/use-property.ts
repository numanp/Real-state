import { container } from '@/core/di/container';
import { useAsync } from '@/core/hooks/use-async';
import type { PropertyDetail } from '@/features/properties/domain/entities/property-detail';

/** Loads one property's full detail. On failure `loading` still resolves to
 *  false (no infinite spinner) and `error` is set. */
export function useProperty(id: string | undefined) {
  const { data: property, loading, error } = useAsync<PropertyDetail | null>(
    () => container.getProperty.execute(id as string),
    [id],
    { enabled: !!id },
  );
  return { property, loading, error };
}
