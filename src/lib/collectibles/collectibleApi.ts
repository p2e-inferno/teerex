import { callEdgeFunction } from '@/lib/edgeFunctions';
import type {
  Collectible,
  CollectibleListResult,
  CreateCollectibleInput,
  UpdateCollectibleInput,
} from '@/types/collectible';

interface ListOptions {
  page?: number;
  pageSize?: number;
  query?: string;
  creatorAddress?: string;
}

export async function listCollectibles(options: ListOptions = {}): Promise<CollectibleListResult> {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(48, Math.max(1, options.pageSize ?? 12));
  return callEdgeFunction<CollectibleListResult>('collectibles', {
    route: 'list',
    limit: pageSize,
    offset: (page - 1) * pageSize,
    query: options.query?.trim() || undefined,
    creator_address: options.creatorAddress?.toLowerCase() || undefined,
  }, {});
}

export async function getCollectible(idOrLock: string): Promise<Collectible> {
  const data = await callEdgeFunction<{ collectible: Collectible }>('collectibles', {
    route: 'detail',
    id: idOrLock,
  }, {});
  return data.collectible;
}

export async function getMyCollectibles(privyToken: string): Promise<Collectible[]> {
  const data = await callEdgeFunction<{ collectibles: Collectible[] }>('collectible-management', {
    action: 'mine',
  }, { privyToken });
  return data.collectibles ?? [];
}

export async function createCollectible(
  input: CreateCollectibleInput,
  privyToken: string,
): Promise<Collectible> {
  const data = await callEdgeFunction<{ collectible: Collectible }>('collectible-management', {
    action: 'create',
    collectible: input,
  }, { privyToken });
  return data.collectible;
}

export async function updateCollectible(
  id: string,
  input: UpdateCollectibleInput,
  privyToken: string,
): Promise<Collectible> {
  const data = await callEdgeFunction<{ collectible: Collectible }>('collectible-management', {
    action: 'update',
    id,
    updates: input,
  }, { privyToken });
  return data.collectible;
}
