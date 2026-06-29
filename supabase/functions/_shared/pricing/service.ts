import { buildGraph, resolveConversionPath } from "./conversion-graph.ts";
import type {
  ConversionResult,
  PriceConversionQuote,
  PricingSnapshot,
  RateEdge,
  SupportedSymbol,
} from "./types.ts";

interface SourceFetchers {
  vendor?: () => Promise<RateEdge[]>;
  uniswap?: () => Promise<RateEdge[]>;
  fiat?: () => Promise<RateEdge[]>;
}

interface SnapshotOptions {
  fetchers: SourceFetchers;
}

interface SharedConversionOptions extends Partial<SnapshotOptions> {
  from: SupportedSymbol;
  to: SupportedSymbol;
  snapshot?: PricingSnapshot;
}

export interface ConvertAmountOptions extends SharedConversionOptions {
  amount: number;
}

function getUsdUsdcBridgeEdges(asOf = Date.now()): RateEdge[] {
  return [
    {
      from: "USDC",
      to: "USD",
      rate: 1,
      source: "fiat_api",
      asOf,
    },
    {
      from: "USD",
      to: "USDC",
      rate: 1,
      source: "fiat_api",
      asOf,
    },
  ];
}

async function loadSourceEdges(
  label: string,
  fetcher: (() => Promise<RateEdge[]>) | undefined,
): Promise<{ edges: RateEdge[]; error: string | null }> {
  if (!fetcher) {
    return {
      edges: [],
      error: `${label}: source not configured`,
    };
  }

  try {
    return {
      edges: await fetcher(),
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : `${label} unavailable`;
    return {
      edges: [],
      error: `${label}: ${message}`,
    };
  }
}

export async function getPricingSnapshot(
  options: SnapshotOptions,
): Promise<PricingSnapshot> {
  const [vendor, uniswap, fiat] = await Promise.all([
    loadSourceEdges("DG vendor rate", options.fetchers.vendor),
    loadSourceEdges("Uniswap rate", options.fetchers.uniswap),
    loadSourceEdges("Fiat rate", options.fetchers.fiat),
  ]);

  const bridgeEdges = getUsdUsdcBridgeEdges();
  const edges = [...vendor.edges, ...uniswap.edges, ...bridgeEdges, ...fiat.edges];
  const errors = [vendor.error, uniswap.error, fiat.error].filter(
    (value): value is string => Boolean(value),
  );
  const asOf = [...vendor.edges, ...uniswap.edges, ...fiat.edges].reduce(
    (latest, edge) => Math.max(latest, edge.asOf),
    0,
  );

  return {
    edges,
    errors,
    asOf: asOf || Date.now(),
  };
}

export async function getSpotRate(
  options: SharedConversionOptions,
): Promise<number | null> {
  if (options.from === options.to) {
    return 1;
  }

  const snapshot = options.snapshot ??
    (options.fetchers ? await getPricingSnapshot({ fetchers: options.fetchers }) : null);
  if (!snapshot) return null;

  const graph = buildGraph(snapshot.edges);
  const resolved = resolveConversionPath(graph, options.from, options.to);

  return resolved?.rate ?? null;
}

export async function convertAmount(
  options: ConvertAmountOptions,
): Promise<ConversionResult> {
  const inputAmount = Number.isFinite(options.amount) ? options.amount : 0;

  if (options.from === options.to) {
    return {
      inputAmount,
      outputAmount: inputAmount,
      path: [options.from],
      stale: false,
      errors: [],
    };
  }

  if (inputAmount <= 0) {
    return {
      inputAmount,
      outputAmount: 0,
      path: [],
      stale: false,
      errors: [],
    };
  }

  const snapshot = options.snapshot ??
    (options.fetchers ? await getPricingSnapshot({ fetchers: options.fetchers }) : null);
  if (!snapshot) {
    return {
      inputAmount,
      outputAmount: 0,
      path: [],
      stale: false,
      errors: ["Pair not available"],
    };
  }

  const graph = buildGraph(snapshot.edges);
  const resolved = resolveConversionPath(graph, options.from, options.to);

  if (!resolved) {
    const errors = snapshot.errors.includes("Pair not available")
      ? snapshot.errors
      : [...snapshot.errors, "Pair not available"];

    return {
      inputAmount,
      outputAmount: 0,
      path: [],
      stale: snapshot.errors.length > 0,
      errors,
    };
  }

  return {
    inputAmount,
    outputAmount: inputAmount * resolved.rate,
    path: resolved.path,
    stale: snapshot.errors.length > 0,
    errors: snapshot.errors,
  };
}

export async function getPriceConversionQuote(options: {
  amount: number;
  from: SupportedSymbol;
  to: SupportedSymbol;
  fetchers: SourceFetchers;
}): Promise<PriceConversionQuote> {
  const snapshot = await getPricingSnapshot({ fetchers: options.fetchers });
  const [conversion, spotRate] = await Promise.all([
    convertAmount({
      amount: options.amount,
      from: options.from,
      to: options.to,
      snapshot,
    }),
    getSpotRate({
      from: options.from,
      to: options.to,
      snapshot,
    }),
  ]);

  return {
    ...conversion,
    from: options.from,
    to: options.to,
    spotRate,
    asOf: snapshot.asOf ?? null,
  };
}
