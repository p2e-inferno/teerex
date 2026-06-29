const nairaFormatter = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  maximumFractionDigits: 0,
});

export function koboToNaira(kobo?: number | null): number {
  return Number(kobo || 0) / 100;
}

export function nairaToKobo(naira: string | number): number {
  const value = typeof naira === 'number' ? naira : Number(naira);
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
}

export function formatNairaFromKobo(kobo?: number | null): string {
  return nairaFormatter.format(koboToNaira(kobo));
}

export function nairaInputValueFromKobo(kobo?: number | null): string {
  return String(koboToNaira(kobo));
}
