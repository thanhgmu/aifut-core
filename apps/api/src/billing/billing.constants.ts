export const SUPPORTED_CURRENCIES = ['VND', 'USD', 'THB', 'IDR', 'MYR', 'PHP', 'SGD'] as const;
export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  VND: '₫', USD: '$', THB: '฿', IDR: 'Rp', MYR: 'RM', PHP: '₱', SGD: 'S$',
};

// Fixed rates vs USD for initial pricing (update dynamically in production)
export const EXCHANGE_RATES: Record<Currency, number> = {
  VND: 25400, USD: 1, THB: 35, IDR: 15700, MYR: 4.4, PHP: 56, SGD: 1.33,
};

export const BILLING_ROADMAP = [
  'plan-seeder', 'subscription-activation',
  'usage-metering', 'invoice-generation',
  'payment-gateway', 'past-due-handling',
  'analytics-dashboard',
];
