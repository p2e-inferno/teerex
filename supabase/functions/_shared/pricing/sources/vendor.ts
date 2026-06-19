import type { RateEdge } from "../types.ts";

export function normalizeVendorRateToEdges(
  exchangeRate: bigint,
  asOf = Date.now(),
): RateEdge[] {
  const parsedRate = Number(exchangeRate);
  if (!Number.isFinite(parsedRate) || parsedRate <= 0) {
    throw new Error("DG vendor exchange rate is invalid");
  }

  return [
    {
      from: "UP",
      to: "DG",
      rate: parsedRate,
      source: "vendor",
      asOf,
    },
    {
      from: "DG",
      to: "UP",
      rate: 1 / parsedRate,
      source: "vendor",
      asOf,
    },
  ];
}
