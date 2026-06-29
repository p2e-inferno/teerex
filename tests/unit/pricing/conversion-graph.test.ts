import { describe, expect, it } from 'vitest';
import {
  buildGraph,
  resolveConversionPath,
} from '../../../supabase/functions/_shared/pricing/conversion-graph.ts';
import type { RateEdge } from '../../../supabase/functions/_shared/pricing/types.ts';

const asOf = 1_717_171_717_000;

describe('pricing conversion graph', () => {
  it('resolves a multi-hop conversion path', () => {
    const edges: RateEdge[] = [
      { from: 'DG', to: 'UP', rate: 0.5, source: 'vendor', asOf },
      { from: 'UP', to: 'USDC', rate: 2, source: 'uniswap', asOf },
      { from: 'USDC', to: 'USD', rate: 1, source: 'fiat_api', asOf },
      { from: 'USD', to: 'NGN', rate: 1500, source: 'fiat_api', asOf },
    ];

    const resolved = resolveConversionPath(buildGraph(edges), 'DG', 'NGN');

    expect(resolved).toEqual({
      path: ['DG', 'UP', 'USDC', 'USD', 'NGN'],
      rate: 1500,
    });
  });

  it('ignores invalid and non-positive rates', () => {
    const edges: RateEdge[] = [
      { from: 'DG', to: 'UP', rate: 0, source: 'vendor', asOf },
      { from: 'DG', to: 'USDC', rate: Number.NaN, source: 'uniswap', asOf },
      { from: 'UP', to: 'USDC', rate: 3, source: 'uniswap', asOf },
    ];

    const graph = buildGraph(edges);

    expect(resolveConversionPath(graph, 'DG', 'USDC')).toBeNull();
    expect(resolveConversionPath(graph, 'UP', 'USDC')).toEqual({
      path: ['UP', 'USDC'],
      rate: 3,
    });
  });

  it('returns an identity path for matching symbols', () => {
    const resolved = resolveConversionPath(buildGraph([]), 'USD', 'USD');

    expect(resolved).toEqual({
      path: ['USD'],
      rate: 1,
    });
  });
});
