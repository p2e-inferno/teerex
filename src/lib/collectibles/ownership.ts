import type { Collectible } from '@/types/collectible';
import { getUserKeyBalance } from '@/utils/lockUtils';

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

  // Avoid creating an unbounded burst of RPC requests as the public catalog grows.
  for (let index = 0; index < collectibles.length; index += batchSize) {
    const batch = collectibles.slice(index, index + batchSize);
    const rows = await Promise.all(batch.map(async (collectible) => {
      const balances = await Promise.allSettled(normalized.map((address) =>
        getUserKeyBalance(collectible.lock_address, address, collectible.chain_id),
      ));
      const fulfilled = balances.filter((result): result is PromiseFulfilledResult<number> => result.status === 'fulfilled');
      const failed = balances.length - fulfilled.length;
      const quantity = fulfilled.reduce((sum, result) => sum + result.value, 0);
      return { collectible, quantity, failed };
    }));

    for (const row of rows) {
      failedChecks += row.failed;
      if (row.quantity > 0) owned.push({ collectible: row.collectible, quantity: row.quantity });
    }
  }

  return { owned, failedChecks };
}
