import { APPROVED_FIAT_SYMBOLS_ENGINE } from "../constants.ts";
import type { FiatRateResponse, FiatSymbol, RateEdge } from "../types.ts";

type CoinbaseExchangeRatesResponse = {
  data?: {
    currency?: string;
    rates?: Record<string, string>;
  };
};

type OpenErApiResponse = {
  result?: string;
  time_last_update_unix?: number;
  base_code?: string;
  rates?: Record<string, number>;
};

const COINBASE_EXCHANGE_RATES_URL =
  "https://api.coinbase.com/v2/exchange-rates?currency=USD";
const OPEN_ER_API_URL = "https://open.er-api.com/v6/latest/USD";
const UPSTREAM_TIMEOUT_MS = 6000;

export function parseCoinbaseFiatRateResponse(
  payload: CoinbaseExchangeRatesResponse,
  asOf = Date.now(),
): FiatRateResponse {
  const base = payload.data?.currency;
  const rates = payload.data?.rates;

  if (base !== "USD" || !rates) {
    throw new Error("Coinbase fiat response is invalid");
  }

  const approvedRates: Partial<Record<FiatSymbol, number>> = {
    USD: 1,
  };

  for (const symbol of APPROVED_FIAT_SYMBOLS_ENGINE) {
    if (symbol === "USD") continue;

    const raw = rates[symbol];
    if (typeof raw !== "string") continue;
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) {
      approvedRates[symbol] = parsed;
    }
  }

  return {
    base: "USD",
    asOf,
    rates: approvedRates,
  };
}

export function parseOpenErApiRateResponse(
  payload: OpenErApiResponse,
): FiatRateResponse {
  if (
    payload.result !== "success" ||
    payload.base_code !== "USD" ||
    !payload.rates
  ) {
    throw new Error("Open ER API fiat response is invalid");
  }

  const approvedRates: Partial<Record<FiatSymbol, number>> = {
    USD: 1,
  };

  for (const symbol of APPROVED_FIAT_SYMBOLS_ENGINE) {
    if (symbol === "USD") continue;

    const raw = payload.rates[symbol];
    if (typeof raw !== "number") continue;
    if (Number.isFinite(raw) && raw > 0) {
      approvedRates[symbol] = raw;
    }
  }

  return {
    base: "USD",
    asOf: (payload.time_last_update_unix ?? Math.floor(Date.now() / 1000)) * 1000,
    rates: approvedRates,
  };
}

export function normalizeFiatRatesToEdges(snapshot: FiatRateResponse): RateEdge[] {
  const edges: RateEdge[] = [];

  for (const symbol of APPROVED_FIAT_SYMBOLS_ENGINE) {
    if (symbol === "USD") continue;

    const rate = snapshot.rates[symbol];
    if (!Number.isFinite(rate) || !rate || rate <= 0) continue;

    edges.push(
      {
        from: "USD",
        to: symbol,
        rate,
        source: "fiat_api",
        asOf: snapshot.asOf,
      },
      {
        from: symbol,
        to: "USD",
        rate: 1 / rate,
        source: "fiat_api",
        asOf: snapshot.asOf,
      },
    );
  }

  return edges;
}

async function fetchJsonWithTimeout<T>(
  url: string,
  fetchFn: typeof fetch,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const response = await fetchFn(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Upstream request failed with status ${response.status}`);
    }

    return await response.json() as T;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchFiatEdges(options?: {
  fetchFn?: typeof fetch;
}): Promise<RateEdge[]> {
  const fetchFn = options?.fetchFn ?? fetch;

  try {
    const payload = await fetchJsonWithTimeout<CoinbaseExchangeRatesResponse>(
      COINBASE_EXCHANGE_RATES_URL,
      fetchFn,
    );
    return normalizeFiatRatesToEdges(parseCoinbaseFiatRateResponse(payload));
  } catch (error) {
    console.warn("[pricing:fiat] Coinbase failed, using fallback", error);
  }

  const fallbackPayload = await fetchJsonWithTimeout<OpenErApiResponse>(
    OPEN_ER_API_URL,
    fetchFn,
  );
  return normalizeFiatRatesToEdges(parseOpenErApiRateResponse(fallbackPayload));
}
