import { useEffect, useState } from 'react';

import { container } from '@/core/di/container';
import type { PropertyDetail } from '@/features/properties/domain/entities/property-detail';

export function useProperty(id: string | undefined) {
  const [property, setProperty] = useState<PropertyDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    void container.getProperty.execute(id).then((result) => {
      if (!active) return;
      setProperty(result);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [id]);

  return { property, loading };
}
