import type { RateEdge, SupportedSymbol } from "./types.ts";

export interface GraphNode {
  to: SupportedSymbol;
  rate: number;
  source: RateEdge["source"];
  asOf: number;
}

export type RateGraph = Map<SupportedSymbol, GraphNode[]>;

export interface ResolvedConversionPath {
  path: SupportedSymbol[];
  rate: number;
}

export function buildGraph(edges: RateEdge[]): RateGraph {
  const graph: RateGraph = new Map();

  for (const edge of edges) {
    if (!Number.isFinite(edge.rate) || edge.rate <= 0) continue;

    const entries = graph.get(edge.from) ?? [];
    entries.push({
      to: edge.to,
      rate: edge.rate,
      source: edge.source,
      asOf: edge.asOf,
    });
    graph.set(edge.from, entries);

    if (!graph.has(edge.to)) {
      graph.set(edge.to, []);
    }
  }

  return graph;
}

export function resolveConversionPath(
  graph: RateGraph,
  from: SupportedSymbol,
  to: SupportedSymbol,
): ResolvedConversionPath | null {
  if (from === to) {
    return { path: [from], rate: 1 };
  }

  const queue: ResolvedConversionPath[] = [{ path: [from], rate: 1 }];
  const visited = new Set<SupportedSymbol>([from]);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    const currentNode = current.path[current.path.length - 1];
    if (!currentNode) continue;

    const neighbors = graph.get(currentNode) ?? [];

    for (const neighbor of neighbors) {
      if (visited.has(neighbor.to)) continue;

      const nextPath = [...current.path, neighbor.to];
      const nextRate = current.rate * neighbor.rate;

      if (neighbor.to === to) {
        return {
          path: nextPath,
          rate: nextRate,
        };
      }

      visited.add(neighbor.to);
      queue.push({
        path: nextPath,
        rate: nextRate,
      });
    }
  }

  return null;
}
