import type { NetworkConfig } from '@/lib/config/network-config';

/**
 * Mock network configurations for testing token availability across different networks
 */
export const mockNetworkConfigs = {
  base: {
    id: 'test-base-id',
    chain_id: 8453,
    chain_name: 'Base',
    usdc_token_address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    dg_token_address: '0x4aA47eD29959c7053996d8f7918db01A62D02ee5',
    up_token_address: '0xac27fa800955849d6d17cc8952ba9dd6eaa66187',
    g_token_address: null,
    unlock_factory_address: '0xd0b14797b9D08493392865647384974470202A78',
    native_currency_symbol: 'ETH',
    native_currency_name: 'Ethereum',
    native_currency_decimals: 18,
    rpc_url: 'https://base-rpc.publicnode.com',
    block_explorer_url: 'https://basescan.org',
    is_mainnet: true,
    is_active: true,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  } as NetworkConfig,

  celo: {
    id: 'test-celo-id',
    chain_id: 42220,
    chain_name: 'Celo',
    usdc_token_address: '0xcebA9300f2b948710d2653dD7B07f33A8B32118C',
    dg_token_address: null,
    up_token_address: null,
    g_token_address: '0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A',
    unlock_factory_address: null,
    native_currency_symbol: 'CELO',
    native_currency_name: 'Celo',
    native_currency_decimals: 18,
    rpc_url: 'https://forno.celo.org',
    block_explorer_url: 'https://celoscan.io',
    is_mainnet: true,
    is_active: true,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  } as NetworkConfig,

  ethereum: {
    id: 'test-ethereum-id',
    chain_id: 1,
    chain_name: 'Ethereum',
    usdc_token_address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    dg_token_address: null,
    up_token_address: null,
    g_token_address: '0x67C5870b4A41D4Ebef24d2456547A03F1f3e094B',
    unlock_factory_address: '0x1FF7e338d5E582138C46044dc238543Ce555C963',
    native_currency_symbol: 'ETH',
    native_currency_name: 'Ethereum',
    native_currency_decimals: 18,
    rpc_url: 'https://eth.llamarpc.com',
    block_explorer_url: 'https://etherscan.io',
    is_mainnet: true,
    is_active: true,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  } as NetworkConfig,

  baseSepolia: {
    id: 'test-base-sepolia-id',
    chain_id: 84532,
    chain_name: 'Base Sepolia',
    usdc_token_address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    dg_token_address: null,
    up_token_address: null,
    g_token_address: null,
    unlock_factory_address: '0x259813B665C8f6074391028ef782e27B65840d89',
    native_currency_symbol: 'ETH',
    native_currency_name: 'Ethereum',
    native_currency_decimals: 18,
    rpc_url: 'https://sepolia.base.org',
    block_explorer_url: 'https://sepolia.basescan.org',
    is_mainnet: false,
    is_active: true,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  } as NetworkConfig,
};

/**
 * Helper to mock useNetworkConfigs hook return value
 */
export function mockUseNetworkConfigs(overrides: Partial<UseNetworkConfigsReturn> = {}) {
  return {
    networks: Object.values(mockNetworkConfigs),
    isLoading: false,
    error: null,
    refreshNetworks: () => {},
    getNetworkByChainId: (chainId: number) => {
      return Object.values(mockNetworkConfigs).find(n => n.chain_id === chainId);
    },
    hasUSDC: (chainId: number) => {
      const network = Object.values(mockNetworkConfigs).find(n => n.chain_id === chainId);
      return !!network?.usdc_token_address;
    },
    hasToken: (chainId: number, symbol: 'USDC' | 'DG' | 'G' | 'UP') => {
      const network = Object.values(mockNetworkConfigs).find(n => n.chain_id === chainId);
      if (!network) return false;

      switch (symbol) {
        case 'USDC': return !!network.usdc_token_address;
        case 'DG': return !!network.dg_token_address;
        case 'G': return !!network.g_token_address;
        case 'UP': return !!network.up_token_address;
        default: return false;
      }
    },
    getUsdcAddress: (chainId: number) => {
      return Object.values(mockNetworkConfigs).find(n => n.chain_id === chainId)?.usdc_token_address || null;
    },
    getTokenAddress: (chainId: number, symbol: 'USDC' | 'DG' | 'G' | 'UP') => {
      const network = Object.values(mockNetworkConfigs).find(n => n.chain_id === chainId);
      if (!network) return null;

      switch (symbol) {
        case 'USDC': return network.usdc_token_address;
        case 'DG': return network.dg_token_address;
        case 'G': return network.g_token_address;
        case 'UP': return network.up_token_address;
        default: return null;
      }
    },
    getAvailableTokens: (chainId: number) => {
      const network = Object.values(mockNetworkConfigs).find(n => n.chain_id === chainId);
      if (!network) return ['ETH'];

      const tokens = ['ETH'];
      if (network.usdc_token_address) tokens.push('USDC');
      if (network.dg_token_address) tokens.push('DG');
      if (network.g_token_address) tokens.push('G');
      if (network.up_token_address) tokens.push('UP');
      return tokens;
    },
    getFactoryAddress: (chainId: number) => {
      return Object.values(mockNetworkConfigs).find(n => n.chain_id === chainId)?.unlock_factory_address || null;
    },
    getRpcUrl: (chainId: number) => {
      return Object.values(mockNetworkConfigs).find(n => n.chain_id === chainId)?.rpc_url || null;
    },
    ...overrides,
  };
}

// Type helper to avoid circular dependency
interface UseNetworkConfigsReturn {
  networks: NetworkConfig[];
  isLoading: boolean;
  error: string | null;
  refreshNetworks: () => void;
  getNetworkByChainId: (chainId: number) => NetworkConfig | undefined;
  hasUSDC: (chainId: number) => boolean;
  hasToken: (chainId: number, symbol: 'USDC' | 'DG' | 'G' | 'UP') => boolean;
  getUsdcAddress: (chainId: number) => string | null;
  getTokenAddress: (chainId: number, symbol: 'USDC' | 'DG' | 'G' | 'UP') => string | null;
  getAvailableTokens: (chainId: number) => string[];
  getFactoryAddress: (chainId: number) => string | null;
  getRpcUrl: (chainId: number) => string | null;
}
