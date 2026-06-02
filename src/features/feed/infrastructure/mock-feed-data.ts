import type { FeedItem, Operation } from '@/features/feed/domain/entities/feed-item';

// Realistic mock feed so the app runs with NO database. Mirrors supabase/seed.sql
// (AR + BR, buy + rent). Swapped for live Supabase data via the DI container later.
const BASE = Date.parse('2026-06-01T12:00:00.000Z');
const poster = (seed: string) => `https://picsum.photos/seed/${seed}/900/1600`;

interface Row {
  id: string;
  title: string;
  op: Operation;
  /** Whole currency units (converted to cents below). */
  price: number;
  currency: string;
  period: 'once' | 'monthly';
  neighborhood: string;
  city: string;
  beds: number;
  baths: number;
  area: number;
  seed: string;
}

const ROWS: Row[] = [
  { id: 'ar-01', title: 'Monoambiente a estrenar en Monserrat', op: 'buy', price: 89000, currency: 'USD', period: 'once', neighborhood: 'Monserrat', city: 'Buenos Aires', beds: 1, baths: 1, area: 38, seed: 'monserrat' },
  { id: 'ar-02', title: 'Luminoso 2 ambientes con balcón', op: 'buy', price: 165000, currency: 'USD', period: 'once', neighborhood: 'Palermo', city: 'Buenos Aires', beds: 2, baths: 1, area: 55, seed: 'palermo' },
  { id: 'ar-03', title: 'Departamento 3 ambientes al frente', op: 'buy', price: 245000, currency: 'USD', period: 'once', neighborhood: 'Belgrano', city: 'Buenos Aires', beds: 3, baths: 2, area: 82, seed: 'belgrano' },
  { id: 'ar-04', title: 'PH reciclado con terraza propia', op: 'buy', price: 132000, currency: 'USD', period: 'once', neighborhood: 'Caballito', city: 'Buenos Aires', beds: 2, baths: 1, area: 64, seed: 'caballito' },
  { id: 'ar-05', title: '2 ambientes en alquiler, apto profesional', op: 'rent', price: 450000, currency: 'ARS', period: 'monthly', neighborhood: 'Villa Crespo', city: 'Buenos Aires', beds: 2, baths: 1, area: 48, seed: 'villacrespo' },
  { id: 'ar-06', title: 'Monoambiente en Recoleta, expensas bajas', op: 'rent', price: 380000, currency: 'ARS', period: 'monthly', neighborhood: 'Recoleta', city: 'Buenos Aires', beds: 1, baths: 1, area: 35, seed: 'recoleta' },
  { id: 'ar-07', title: 'Casa con jardín y pileta en Pilar', op: 'buy', price: 320000, currency: 'USD', period: 'once', neighborhood: 'Pilar', city: 'Buenos Aires', beds: 4, baths: 3, area: 210, seed: 'pilar' },
  { id: 'br-01', title: 'Apartamento 1 quarto em Santa Cecília', op: 'rent', price: 2800, currency: 'BRL', period: 'monthly', neighborhood: 'Santa Cecília', city: 'São Paulo', beds: 1, baths: 1, area: 42, seed: 'santacecilia' },
  { id: 'br-02', title: 'Apartamento 2 quartos em Pinheiros', op: 'buy', price: 780000, currency: 'BRL', period: 'once', neighborhood: 'Pinheiros', city: 'São Paulo', beds: 2, baths: 2, area: 68, seed: 'pinheiros' },
  { id: 'br-03', title: 'Cobertura 2 quartos vista mar', op: 'buy', price: 950000, currency: 'BRL', period: 'once', neighborhood: 'Copacabana', city: 'Rio de Janeiro', beds: 2, baths: 2, area: 88, seed: 'copacabana' },
  { id: 'br-04', title: 'Casa em condomínio para alugar', op: 'rent', price: 4500, currency: 'BRL', period: 'monthly', neighborhood: 'Alphaville', city: 'Barueri', beds: 3, baths: 3, area: 160, seed: 'alphaville' },
  { id: 'br-05', title: 'Studio mobiliado em Vila Mariana', op: 'buy', price: 410000, currency: 'BRL', period: 'once', neighborhood: 'Vila Mariana', city: 'São Paulo', beds: 1, baths: 1, area: 30, seed: 'vilamariana' },
];

export const MOCK_FEED: FeedItem[] = ROWS.map((r, i) => ({
  id: r.id,
  title: r.title,
  operation: r.op,
  price: { amountCents: r.price * 100, currency: r.currency, period: r.period },
  location: { neighborhood: r.neighborhood, city: r.city },
  specs: { bedrooms: r.beds, bathrooms: r.baths, areaSqm: r.area },
  primaryReel: {
    id: `${r.id}-reel`,
    mediaType: 'image_set',
    posterUrl: poster(r.seed),
    sources: [poster(r.seed), poster(`${r.seed}-2`)],
  },
  counts: { likes: 0, saves: 0 },
  publishedAt: new Date(BASE - i * 3_600_000).toISOString(),
}));
