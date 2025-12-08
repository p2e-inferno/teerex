import { useQuery } from '@tanstack/react-query';
import { Contract, JsonRpcProvider, isAddress } from 'ethers';
import PublicLockABI from '../../supabase/functions/_shared/abi/PublicLockV15.json' assert { type: 'json' };
import { getNetworkConfigByChainId } from '@/lib/config/network-config';

async function fetchTicketBalance(lockAddress: string, userAddress: string, chainId: number): Promise<number> {
  if (!isAddress(lockAddress) || !isAddress(userAddress)) {
    throw new Error('Invalid address');
  }

  const networkConfig = await getNetworkConfigByChainId(chainId);
  const rpcUrl = networkConfig?.rpc_url;
  if (!rpcUrl) {
    throw new Error(`No RPC URL configured for chain ${chainId}`);
  }

  const provider = new JsonRpcProvider(rpcUrl);

  // Avoid decode errors if the address has no contract code
  const code = await provider.getCode(lockAddress);
  if (!code || code === '0x') {
    return 0;
  }

  const lock = new Contract(lockAddress, PublicLockABI, provider);
  const balance = await lock.balanceOf(userAddress);
  return Number(balance);
}

export function useTicketBalance(params: { lockAddress: string; userAddress: string; chainId: number }) {
  const { lockAddress, userAddress, chainId } = params;

  return useQuery({
    queryKey: ['ticket-balance', chainId, lockAddress, userAddress],
    queryFn: () => fetchTicketBalance(lockAddress, userAddress, chainId),
    enabled: Boolean(lockAddress && userAddress && chainId),
    staleTime: 15 * 60 * 1000, // 15 minutes
    gcTime: 20 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}
