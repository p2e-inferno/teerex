import type { Collectible } from '@/types/collectible';
import { readCollectibleBalances } from '@/lib/collectibles/chainState';

export interface OwnedCollectible {
  collectible: Collectible;
  quantity: number;
}

export interface OwnershipResolution {
  owned: OwnedCollectible[];
  failedChecks: number;
}

export async function resolveOwnedCollectibles(
  collectibles: Collectible[],
  addresses: string[],
  batchSize = 12,
): Promise<OwnershipResolution> {
  const normalized = Array.from(new Set(addresses.map((address) => address.toLowerCase()).filter(Boolean)));
  if (normalized.length === 0 || collectibles.length === 0) return { owned: [], failedChecks: 0 };

  const owned: OwnedCollectible[] = [];
  let failedChecks = 0;

  // Avoid an unbounded burst of RPC requests as the public catalog grows.
  for (let index = 0; index < collectibles.length; index += batchSize) {
    const batch = collectibles.slice(index, index + batchSize);
    const rows = await Promise.all(batch.map(async (collectible) => {
      try {
        const balances = await readCollectibleBalances(collectible.lock_address, collectible.chain_id, normalized);
        return { collectible, quantity: balances.reduce((sum, count) => sum + count, 0), failed: false };
      } catch {
        return { collectible, quantity: 0, failed: true };
      }
    }));

    for (const row of rows) {
      if (row.failed) failedChecks += 1;
      if (row.quantity > 0) owned.push({ collectible: row.collectible, quantity: row.quantity });
    }
  }

  return { owned, failedChecks };
}
