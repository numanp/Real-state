import type { PropertyDetail } from '@/features/properties/domain/entities/property-detail';
import { formatMoney } from '@/shared/ui/lib/format';

/** One comparison row: a label + the formatted value per property, and which
 *  column wins (lowest price/expensas, largest area) — or null when there's no
 *  meaningful "best" (subjective rows, mixed currencies, <2 comparable values). */
export interface ComparisonRow {
  label: string;
  values: string[];
  bestIndex: number | null;
}

const DASH = '—';

function expensasCents(p: PropertyDetail): number | undefined {
  return p.costs.find((c) => /expensas|condom/i.test(c.label))?.amountCents;
}

/** Index of the winning column, or null if fewer than 2 columns are comparable. */
function bestOf(nums: (number | undefined)[], dir: 'low' | 'high'): number | null {
  if (nums.filter((n) => n != null).length < 2) return null;
  let best: number | null = null;
  let bestVal = dir === 'low' ? Infinity : -Infinity;
  nums.forEach((n, i) => {
    if (n == null) return;
    if ((dir === 'low' && n < bestVal) || (dir === 'high' && n > bestVal)) {
      bestVal = n;
      best = i;
    }
  });
  return best;
}

/** Build the side-by-side comparison rows for 2-3 properties. Pure — no I/O. */
export function buildComparison(properties: PropertyDetail[]): ComparisonRow[] {
  if (properties.length === 0) return [];
  const sameCurrency = new Set(properties.map((p) => p.price.currency)).size === 1;

  const numRow = (
    label: string,
    getter: (p: PropertyDetail) => number | undefined,
    fmt: (n: number) => string,
    dir: 'low' | 'high' | null,
  ): ComparisonRow => {
    const raw = properties.map(getter);
    return {
      label,
      values: raw.map((n) => (n == null ? DASH : fmt(n))),
      bestIndex: dir ? bestOf(raw, dir) : null,
    };
  };

  return [
    {
      label: 'Precio',
      values: properties.map(
        (p) =>
          `${formatMoney(p.price.amountCents, p.price.currency)}${
            p.price.period === 'monthly' ? '/mes' : ''
          }`,
      ),
      bestIndex: sameCurrency ? bestOf(properties.map((p) => p.price.amountCents), 'low') : null,
    },
    numRow('Sup. total', (p) => p.area.totalSqm, (n) => `${n} m²`, 'high'),
    numRow('Sup. cubierta', (p) => p.area.coveredSqm, (n) => `${n} m²`, 'high'),
    numRow('Ambientes', (p) => p.rooms, (n) => `${n}`, null),
    numRow('Dormitorios', (p) => p.bedrooms, (n) => `${n}`, null),
    numRow('Baños', (p) => p.bathrooms, (n) => `${n}`, null),
    numRow('Cocheras', (p) => p.parking, (n) => `${n}`, null),
    numRow('Antigüedad', (p) => p.ageYears, (n) => `${n} años`, null),
    {
      label: 'Expensas',
      values: properties.map((p) => {
        const e = expensasCents(p);
        return e == null ? DASH : formatMoney(e, p.price.currency);
      }),
      bestIndex: sameCurrency ? bestOf(properties.map(expensasCents), 'low') : null,
    },
    {
      label: 'Ubicación',
      values: properties.map((p) => p.location.neighborhood ?? p.location.city),
      bestIndex: null,
    },
  ];
}
