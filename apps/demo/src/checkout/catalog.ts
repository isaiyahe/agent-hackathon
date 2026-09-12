export const DEMO_ITEM = {
  sku: 'repro-demo-item',
  name: 'REPRO Demo Item',
  description: 'Our best-selling demo item. Free standard shipping and 30-day returns.',
  priceCents: 4900,
} as const;

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function formatMoney(cents: number): string {
  return usd.format(cents / 100);
}
