import type {
  Amenity,
  Cost,
  PropertyDetail,
} from '@/features/properties/domain/entities/property-detail';

// Rich ficha mock so the detail page runs with NO database. Same ids as the feed
// so tapping a card resolves. Mirrors supabase/seed.sql shape (AR + BR, buy/rent).
const BASE = Date.parse('2026-06-01T12:00:00.000Z');
const gallery = (seed: string) =>
  Array.from({ length: 6 }, (_, i) => `https://picsum.photos/seed/${seed}-${i}/1200/900`);

type Market = 'AR' | 'BR';

const BUILDING: Record<Market, string[]> = {
  AR: ['Pileta', 'Gimnasio', 'SUM', 'Seguridad 24h', 'Laundry', 'Parrilla'],
  BR: ['Piscina', 'Academia', 'Salão de festas', 'Portaria 24h', 'Churrasqueira', 'Playground'],
};
const UNIT: Record<Market, string[]> = {
  AR: ['Balcón', 'Aire acondicionado', 'Cocina equipada', 'Placards', 'Calefacción'],
  BR: ['Varanda', 'Ar condicionado', 'Cozinha equipada', 'Armários', 'Aquecimento'],
};

function amenities(market: Market, building: number, unit: number): Amenity[] {
  return [
    ...UNIT[market].map((label, i) => ({ label, scope: 'unit' as const, available: i < unit })),
    ...BUILDING[market].map((label, i) => ({ label, scope: 'building' as const, available: i < building })),
  ];
}

function costs(market: Market, monthly: number, iptu?: number): Cost[] {
  if (market === 'AR') {
    return [{ label: 'Expensas', amountCents: monthly * 100, currency: 'ARS', period: 'monthly' }];
  }
  const list: Cost[] = [
    { label: 'Condomínio', amountCents: monthly * 100, currency: 'BRL', period: 'monthly' },
  ];
  if (iptu) list.push({ label: 'IPTU', amountCents: iptu * 100, currency: 'BRL', period: 'yearly' });
  return list;
}

interface Row {
  id: string;
  title: string;
  op: 'buy' | 'rent';
  kind: string;
  price: number;
  currency: string;
  period: 'once' | 'monthly';
  neighborhood: string;
  city: string;
  region: string;
  country: string;
  rooms: number;
  beds: number;
  baths: number;
  parking: number;
  total: number;
  covered: number;
  market: Market;
  seed: string;
  monthly: number;
  iptu?: number;
  advertiser: { type: 'agency' | 'owner' | 'managed'; name?: string };
  description: string;
}

const ROWS: Row[] = [
  { id: 'ar-01', title: 'Monoambiente a estrenar en Monserrat', op: 'buy', kind: 'Monoambiente', price: 89000, currency: 'USD', period: 'once', neighborhood: 'Monserrat', city: 'Buenos Aires', region: 'CABA', country: 'AR', rooms: 1, beds: 1, baths: 1, parking: 0, total: 38, covered: 35, market: 'AR', seed: 'monserrat', monthly: 42000, advertiser: { type: 'agency', name: 'Inmobiliaria Centro' }, description: 'Monoambiente luminoso a estrenar, ideal para inversión o primera vivienda. A metros del subte.' },
  { id: 'ar-02', title: 'Luminoso 2 ambientes con balcón', op: 'buy', kind: 'Departamento', price: 165000, currency: 'USD', period: 'once', neighborhood: 'Palermo', city: 'Buenos Aires', region: 'CABA', country: 'AR', rooms: 2, beds: 1, baths: 1, parking: 0, total: 55, covered: 50, market: 'AR', seed: 'palermo', monthly: 65000, advertiser: { type: 'agency', name: 'Palermo Props' }, description: 'Dos ambientes muy luminoso con balcón al frente, cocina integrada y excelente ubicación.' },
  { id: 'ar-03', title: 'Departamento 3 ambientes al frente', op: 'buy', kind: 'Departamento', price: 245000, currency: 'USD', period: 'once', neighborhood: 'Belgrano', city: 'Buenos Aires', region: 'CABA', country: 'AR', rooms: 3, beds: 2, baths: 2, parking: 1, total: 82, covered: 78, market: 'AR', seed: 'belgrano', monthly: 98000, advertiser: { type: 'agency', name: 'Belgrano Real Estate' }, description: 'Amplio 3 ambientes al frente con cochera, apto profesional, en edificio con amenities.' },
  { id: 'ar-04', title: 'PH reciclado con terraza propia', op: 'buy', kind: 'PH', price: 132000, currency: 'USD', period: 'once', neighborhood: 'Caballito', city: 'Buenos Aires', region: 'CABA', country: 'AR', rooms: 3, beds: 2, baths: 1, parking: 0, total: 64, covered: 58, market: 'AR', seed: 'caballito', monthly: 30000, advertiser: { type: 'owner' }, description: 'PH reciclado a nuevo con terraza propia y parrilla. Sin expensas altas, mucha luz natural.' },
  { id: 'ar-05', title: '2 ambientes en alquiler, apto profesional', op: 'rent', kind: 'Departamento', price: 450000, currency: 'ARS', period: 'monthly', neighborhood: 'Villa Crespo', city: 'Buenos Aires', region: 'CABA', country: 'AR', rooms: 2, beds: 1, baths: 1, parking: 0, total: 48, covered: 45, market: 'AR', seed: 'villacrespo', monthly: 70000, advertiser: { type: 'agency', name: 'Crespo Alquileres' }, description: 'Dos ambientes apto profesional, contrato 3 años, requisitos: garantía propietaria o seguro de caución.' },
  { id: 'ar-06', title: 'Monoambiente en Recoleta, expensas bajas', op: 'rent', kind: 'Monoambiente', price: 380000, currency: 'ARS', period: 'monthly', neighborhood: 'Recoleta', city: 'Buenos Aires', region: 'CABA', country: 'AR', rooms: 1, beds: 1, baths: 1, parking: 0, total: 35, covered: 33, market: 'AR', seed: 'recoleta', monthly: 48000, advertiser: { type: 'owner' }, description: 'Monoambiente en el corazón de Recoleta, expensas bajas, amoblado opcional.' },
  { id: 'ar-07', title: 'Casa con jardín y pileta en Pilar', op: 'buy', kind: 'Casa', price: 320000, currency: 'USD', period: 'once', neighborhood: 'Pilar', city: 'Buenos Aires', region: 'GBA', country: 'AR', rooms: 5, beds: 4, baths: 3, parking: 2, total: 210, covered: 180, market: 'AR', seed: 'pilar', monthly: 90000, advertiser: { type: 'agency', name: 'Pilar Country Homes' }, description: 'Casa en barrio cerrado con jardín, pileta y quincho. 4 dormitorios, seguridad 24h.' },
  { id: 'br-01', title: 'Apartamento 1 quarto em Santa Cecília', op: 'rent', kind: 'Apartamento', price: 2800, currency: 'BRL', period: 'monthly', neighborhood: 'Santa Cecília', city: 'São Paulo', region: 'SP', country: 'BR', rooms: 2, beds: 1, baths: 1, parking: 0, total: 42, covered: 40, market: 'BR', seed: 'santacecilia', monthly: 650, iptu: 1200, advertiser: { type: 'managed', name: 'QuintoAndar' }, description: 'Apartamento de 1 quarto mobiliado, próximo ao metrô Marechal Deodoro. Aceita pet.' },
  { id: 'br-02', title: 'Apartamento 2 quartos em Pinheiros', op: 'buy', kind: 'Apartamento', price: 780000, currency: 'BRL', period: 'once', neighborhood: 'Pinheiros', city: 'São Paulo', region: 'SP', country: 'BR', rooms: 3, beds: 2, baths: 2, parking: 1, total: 68, covered: 64, market: 'BR', seed: 'pinheiros', monthly: 980, iptu: 3200, advertiser: { type: 'agency', name: 'Pinheiros Imóveis' }, description: 'Apartamento de 2 quartos com varanda gourmet, 1 vaga, em condomínio com lazer completo.' },
  { id: 'br-03', title: 'Cobertura 2 quartos vista mar', op: 'buy', kind: 'Cobertura', price: 950000, currency: 'BRL', period: 'once', neighborhood: 'Copacabana', city: 'Rio de Janeiro', region: 'RJ', country: 'BR', rooms: 3, beds: 2, baths: 2, parking: 1, total: 88, covered: 80, market: 'BR', seed: 'copacabana', monthly: 1500, iptu: 4800, advertiser: { type: 'agency', name: 'Rio Cobertura' }, description: 'Cobertura com vista mar, 2 quartos, terraço com churrasqueira. A duas quadras da praia.' },
  { id: 'br-04', title: 'Casa em condomínio para alugar', op: 'rent', kind: 'Casa', price: 4500, currency: 'BRL', period: 'monthly', neighborhood: 'Alphaville', city: 'Barueri', region: 'SP', country: 'BR', rooms: 4, beds: 3, baths: 3, parking: 2, total: 160, covered: 140, market: 'BR', seed: 'alphaville', monthly: 1200, iptu: 5200, advertiser: { type: 'managed', name: 'QuintoAndar' }, description: 'Casa em condomínio fechado com segurança 24h, 3 quartos, quintal e área gourmet.' },
  { id: 'br-05', title: 'Studio mobiliado em Vila Mariana', op: 'buy', kind: 'Studio', price: 410000, currency: 'BRL', period: 'once', neighborhood: 'Vila Mariana', city: 'São Paulo', region: 'SP', country: 'BR', rooms: 1, beds: 1, baths: 1, parking: 0, total: 30, covered: 28, market: 'BR', seed: 'vilamariana', monthly: 720, iptu: 1600, advertiser: { type: 'owner' }, description: 'Studio mobiliado e decorado, pronto para morar, próximo ao metrô e à Av. Paulista.' },
];

const ORIENTATIONS = ['Norte', 'Sur', 'Este', 'Oeste', 'Noreste'];
const CONDITIONS = ['A estrenar', 'Excelente', 'Muy bueno', 'Reciclado'];

export const MOCK_PROPERTIES: PropertyDetail[] = ROWS.map((r, i) => ({
  id: r.id,
  title: r.title,
  description: r.description,
  operation: r.op,
  kind: r.kind,
  price: { amountCents: r.price * 100, currency: r.currency, period: r.period },
  costs: costs(r.market, r.monthly, r.iptu),
  area: { totalSqm: r.total, coveredSqm: r.covered },
  rooms: r.rooms,
  bedrooms: r.beds,
  bathrooms: r.baths,
  parking: r.parking,
  ageYears: i % 4 === 0 ? 0 : (i % 25) + 1,
  orientation: ORIENTATIONS[i % ORIENTATIONS.length],
  floor: r.kind === 'Casa' ? 'PB' : `${(i % 12) + 1}°`,
  condition: CONDITIONS[i % CONDITIONS.length],
  furnished: i % 3 === 0,
  petsAllowed: i % 2 === 0,
  amenities: amenities(r.market, 4 + (i % 3), 3 + (i % 2)),
  location: { neighborhood: r.neighborhood, city: r.city, region: r.region, country: r.country },
  gallery: gallery(r.seed),
  advertiser: {
    ...r.advertiser,
    // Stable synthetic id so the in-memory reviews repo groups reviews per
    // named agency across listings (offline demo parity with the backend).
    agencyId:
      r.advertiser.type !== 'owner' && r.advertiser.name
        ? `mock-${r.advertiser.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
        : undefined,
  },
  publishedAt: new Date(BASE - i * 3_600_000).toISOString(),
}));
