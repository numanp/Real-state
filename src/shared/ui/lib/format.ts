const SYMBOLS: Record<string, string> = { USD: 'US$', ARS: '$', BRL: 'R$' };

/** Group thousands with '.' (es-AR/pt-BR convention) without relying on Intl
 *  (Hermes ships only a partial Intl). */
function groupThousands(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Format an integer minor-unit amount (cents) as a localized price string. */
export function formatMoney(amountCents: number, currency: string): string {
  const symbol = SYMBOLS[currency] ?? `${currency} `;
  return `${symbol}${groupThousands(amountCents / 100)}`;
}
