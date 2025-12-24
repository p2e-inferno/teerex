import { Contract, JsonRpcProvider, isAddress } from 'ethers';
import { getNetworkConfigByChainId } from '@/lib/config/network-config';

/**
 * Creates a contract instance with RPC provider for read-only operations
 * Includes validation and error handling
 *
 * @param lockAddress - The contract address
 * @param chainId - The chain ID
 * @param abi - The contract ABI
 * @returns Contract instance connected to RPC provider
 * @throws Error if address is invalid, chain not configured, or contract doesn't exist
 */
export async function createReadOnlyContract(
  lockAddress: string,
  chainId: number,
  abi: any[]
): Promise<Contract> {
  // Validate inputs
  if (!lockAddress || lockAddress === 'Unknown' || !isAddress(lockAddress)) {
    throw new Error(`Invalid lock address: ${lockAddress}`);
  }

  if (!chainId || chainId === 0) {
    throw new Error(`Invalid chainId: ${chainId} for lock ${lockAddress}`);
  }

  // Get network config
  const networkConfig = await getNetworkConfigByChainId(chainId);
  const rpcUrl = networkConfig?.rpc_url;
  if (!rpcUrl) {
    throw new Error(`No RPC URL configured for chain ${chainId}`);
  }

  // Create provider
  const provider = new JsonRpcProvider(rpcUrl);

  // Verify contract exists
  const code = await provider.getCode(lockAddress);
  if (!code || code === '0x') {
    throw new Error(
      `No contract found at ${lockAddress} on chain ${chainId}. The lock may have been deployed on a different chain.`
    );
  }

  // Create and return contract instance
  return new Contract(lockAddress, abi, provider);
}

/**
 * Validates wallet and lock addresses
 * @param lockAddress - The lock contract address
 * @param walletAddress - The wallet address
 * @throws Error if either address is invalid
 */
export function validateAddresses(lockAddress: string, walletAddress: string): void {
  if (!isAddress(lockAddress)) {
    throw new Error(`Invalid lock address: ${lockAddress}`);
  }
  if (!isAddress(walletAddress)) {
    throw new Error(`Invalid wallet address: ${walletAddress}`);
  }
}
