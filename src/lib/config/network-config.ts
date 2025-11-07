import { base, baseSepolia } from 'wagmi/chains';

export const CHAINS = {
  [base.id]: base,
  [baseSepolia.id]: baseSepolia,
} as const;

export type SupportedChainId = keyof typeof CHAINS extends number ? keyof typeof CHAINS : number;

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export function getRpcUrl(chainId: number): string {
  const chain = CHAINS[chainId as SupportedChainId];
  if (!chain) throw new Error(`Unsupported chainId ${chainId}`);
  const urls = chain.rpcUrls?.default?.http;
  if (!urls || urls.length === 0) throw new Error(`No RPC URL for chainId ${chainId}`);
  return urls[0];
}

export function getExplorerTxUrl(chainId: number, txHash: string): string {
  const chain = CHAINS[chainId as SupportedChainId];
  if (!chain || !chain.blockExplorers?.default?.url) return txHash;
  const baseUrl = chain.blockExplorers.default.url.replace(/\/$/, '');
  return `${baseUrl}/tx/${txHash}`;
}

// Token address helpers (addresses only; decimals resolved at runtime)
export function getUsdcAddress(chainId: number): string {
  if (chainId === base.id) {
    return (import.meta as any).env?.VITE_USDC_ADDRESS_BASE_MAINNET || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
  }
  if (chainId === baseSepolia.id) {
    return (import.meta as any).env?.VITE_USDC_ADDRESS_BASE_SEPOLIA || '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
  }
  throw new Error(`USDC not configured for chainId ${chainId}`);
}

export function getTokenAddress(chainId: number, symbol: 'ETH' | 'USDC'): string {
  if (symbol === 'ETH') return ZERO_ADDRESS;
  return getUsdcAddress(chainId);
}

