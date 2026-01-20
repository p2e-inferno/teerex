import { ethers } from 'ethers';
import { getNetworkConfigByChainId } from '@/lib/config/network-config';

/**
 * Minimal ERC20 ABI for balance queries
 */
const ERC20_BALANCE_ABI = [
  {
    inputs: [{ internalType: 'address', name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

/**
 * Fetch native token balance (ETH, POL, etc.) for an address on a specific chain
 *
 * @param address - The wallet address to check
 * @param chainId - The chain ID to query
 * @returns Balance in wei as bigint
 * @throws Error if RPC URL not configured or network request fails
 */
export async function fetchNativeBalance(
  address: string,
  chainId: number
): Promise<bigint> {
  const networkConfig = await getNetworkConfigByChainId(chainId);

  if (!networkConfig?.rpc_url) {
    throw new Error(`No RPC URL configured for chain ${chainId}`);
  }

  const provider = new ethers.JsonRpcProvider(networkConfig.rpc_url);
  const balance = await provider.getBalance(address);

  return balance;
}

/**
 * Fetch ERC20 token balance for an address on a specific chain
 *
 * @param tokenAddress - The ERC20 token contract address
 * @param userAddress - The wallet address to check
 * @param chainId - The chain ID to query
 * @returns Balance in token's smallest unit as bigint
 * @throws Error if RPC URL not configured or contract call fails
 */
export async function fetchERC20Balance(
  tokenAddress: string,
  userAddress: string,
  chainId: number
): Promise<bigint> {
  const networkConfig = await getNetworkConfigByChainId(chainId);

  if (!networkConfig?.rpc_url) {
    throw new Error(`No RPC URL configured for chain ${chainId}`);
  }

  const provider = new ethers.JsonRpcProvider(networkConfig.rpc_url);
  const contract = new ethers.Contract(tokenAddress, ERC20_BALANCE_ABI, provider);

  const balance = await contract.balanceOf(userAddress);

  return balance;
}

/**
 * Format a balance with proper decimals for display
 *
 * @param balance - The balance in smallest unit (wei/atoms)
 * @param decimals - The number of decimals for the token
 * @param maxDecimals - Maximum number of decimals to display (default: 6)
 * @returns Formatted balance as string
 *
 * @example
 * formatBalanceWithDecimals(1500000000000000000n, 18, 6) // "1.5"
 * formatBalanceWithDecimals(1234567n, 6, 2) // "1.23"
 */
export function formatBalanceWithDecimals(
  balance: bigint,
  decimals: number,
  maxDecimals: number = 6
): string {
  // Convert from smallest unit to human-readable
  const formatted = ethers.formatUnits(balance, decimals);

  // Parse as float and round to maxDecimals
  const num = parseFloat(formatted);

  // Handle edge cases
  if (num === 0) return '0';

  // Round to maxDecimals precision
  const rounded = num.toFixed(maxDecimals);

  // Remove trailing zeros after decimal point
  return parseFloat(rounded).toString();
}

/**
 * Format a native token balance with symbol
 *
 * @param balance - The balance in wei
 * @param symbol - The native currency symbol (e.g., 'ETH', 'POL')
 * @param maxDecimals - Maximum number of decimals to display (default: 6)
 * @returns Formatted balance with symbol
 *
 * @example
 * formatNativeBalance(1500000000000000000n, 'ETH') // "1.5 ETH"
 */
export function formatNativeBalance(
  balance: bigint,
  symbol: string,
  maxDecimals: number = 6
): string {
  const formatted = formatBalanceWithDecimals(balance, 18, maxDecimals);
  return `${formatted} ${symbol}`;
}

/**
 * Format an ERC20 token balance with symbol
 *
 * @param balance - The balance in token's smallest unit
 * @param symbol - The token symbol (e.g., 'USDC', 'DG')
 * @param decimals - The token's decimals
 * @param maxDecimals - Maximum number of decimals to display (default: 6)
 * @returns Formatted balance with symbol
 *
 * @example
 * formatERC20Balance(1000000n, 'USDC', 6) // "1 USDC"
 */
export function formatERC20Balance(
  balance: bigint,
  symbol: string,
  decimals: number,
  maxDecimals: number = 6
): string {
  const formatted = formatBalanceWithDecimals(balance, decimals, maxDecimals);
  return `${formatted} ${symbol}`;
}
