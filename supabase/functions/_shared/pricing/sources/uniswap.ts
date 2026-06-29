import type { RateEdge } from "../types.ts";

function normalizeQuotedRate(params: {
  amountIn: bigint;
  amountOut: bigint;
  inputDecimals: number;
  outputDecimals: number;
}): number {
  const normalizedIn = Number(params.amountIn) / 10 ** params.inputDecimals;
  const normalizedOut = Number(params.amountOut) / 10 ** params.outputDecimals;

  if (
    !Number.isFinite(normalizedIn) ||
    normalizedIn <= 0 ||
    !Number.isFinite(normalizedOut) ||
    normalizedOut <= 0
  ) {
    throw new Error("Unable to normalize Uniswap quote");
  }

  return normalizedOut / normalizedIn;
}

export function normalizeUniswapQuotesToEdges(
  quotes: {
    ethIn: bigint;
    ethToUsdcOut: bigint;
    upIn: bigint;
    upToUsdcOut: bigint;
  },
  asOf = Date.now(),
): RateEdge[] {
  const ethToUsdc = normalizeQuotedRate({
    amountIn: quotes.ethIn,
    amountOut: quotes.ethToUsdcOut,
    inputDecimals: 18,
    outputDecimals: 6,
  });
  const upToUsdc = normalizeQuotedRate({
    amountIn: quotes.upIn,
    amountOut: quotes.upToUsdcOut,
    inputDecimals: 18,
    outputDecimals: 6,
  });

  return [
    {
      from: "ETH",
      to: "USDC",
      rate: ethToUsdc,
      source: "uniswap",
      asOf,
    },
    {
      from: "USDC",
      to: "ETH",
      rate: 1 / ethToUsdc,
      source: "uniswap",
      asOf,
    },
    {
      from: "UP",
      to: "USDC",
      rate: upToUsdc,
      source: "uniswap",
      asOf,
    },
    {
      from: "USDC",
      to: "UP",
      rate: 1 / upToUsdc,
      source: "uniswap",
      asOf,
    },
  ];
}
