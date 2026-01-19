export const BUNDLE_PRICING_ERRORS = {
  invalidPriceFiat: "Invalid price_fiat",
  invalidPriceDg: "Invalid price_dg",
  dgRequiredWhenFiatSet: "DG price is required when NGN price is set",
} as const;

export function parseNonNegativeNumber(
  value: unknown,
  fieldName: keyof typeof BUNDLE_PRICING_ERRORS,
  defaultValue = 0,
): number {
  if (value === undefined || value === null || value === "") return defaultValue;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(BUNDLE_PRICING_ERRORS[fieldName]);
  }
  return parsed;
}

export function assertBundlePricing(params: { priceFiat: number; priceDg: number }): void {
  const { priceFiat, priceDg } = params;
  if (priceFiat > 0 && priceDg <= 0) {
    throw new Error(BUNDLE_PRICING_ERRORS.dgRequiredWhenFiatSet);
  }
}

export function normalizeDbPriceDg(priceDg: number): number | null {
  return priceDg > 0 ? priceDg : null;
}

