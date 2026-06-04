import { useEffect, useState } from 'react';

import { container } from '@/core/di/container';
import type { PropertyDetail } from '@/features/properties/domain/entities/property-detail';

/** Fetches the full PropertyDetail for each selected id (reuses GetProperty).
 *  Keyed on the id list so it refetches only when the selection changes. */
export function useComparison(ids: string[]) {
  const [properties, setProperties] = useState<PropertyDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const key = ids.join(',');

  useEffect(() => {
    let active = true;
    setLoading(true);
    void Promise.all(ids.map((id) => container.getProperty.execute(id))).then((res) => {
      if (!active) return;
      setProperties(res.filter((p): p is PropertyDetail => p != null));
      setLoading(false);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { properties, loading };
}
