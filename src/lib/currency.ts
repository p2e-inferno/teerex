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

export function usdcFromMicro(micro?: number | null): number {
  return Number(micro || 0) / 1_000_000;
}

export function usdcToMicro(usdc: string | number): number {
  const value = typeof usdc === 'number' ? usdc : Number(usdc);
  return Number.isFinite(value) ? Math.round(value * 1_000_000) : 0;
}

export function formatUsdcFromMicro(micro?: number | null): string {
  const amount = usdcFromMicro(micro);
  const formatted = amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).replace(/(\.\d{2}\d*?)0+$/, '$1');
  return `${formatted} USDC`;
}
