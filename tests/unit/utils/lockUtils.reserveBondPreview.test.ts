import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockPreviewReserveBond,
  mockJsonRpcProvider,
  mockContract,
} = vi.hoisted(() => {
  const mockPreviewReserveBond = vi.fn();
  const mockJsonRpcProvider = vi.fn();
  const mockContract = vi.fn(() => ({
    previewReserveBond: mockPreviewReserveBond,
  }));

  return {
    mockPreviewReserveBond,
    mockJsonRpcProvider,
    mockContract,
  };
});

vi.mock('viem', () => ({
  parseEther: vi.fn(() => 200000000000000n),
  parseUnits: vi.fn((value: string, decimals: number) => BigInt(Math.floor(Number(value) * 10 ** decimals))),
}));

vi.mock('ethers', () => ({
  ethers: {
    JsonRpcProvider: mockJsonRpcProvider,
    Contract: mockContract,
    isAddress: vi.fn(() => true),
  },
}));

vi.mock('@/lib/config/network-config', () => ({
  getRpcUrl: vi.fn(),
  getExplorerTxUrl: vi.fn(),
  getTokenAddressAsync: vi.fn(),
  ZERO_ADDRESS: '0x0000000000000000000000000000000000000000',
  getNetworkConfigByChainId: vi.fn(),
}));

import { previewProtectedEventReserveBond } from '@/utils/lockUtils';
import { getNetworkConfigByChainId } from '@/lib/config/network-config';

describe('previewProtectedEventReserveBond', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getNetworkConfigByChainId).mockResolvedValue({
      chain_id: 137,
      chain_name: 'Polygon',
      rpc_url: 'https://polygon-rpc.example',
      refundable_event_manager_address: '0x1111111111111111111111111111111111111111',
      native_currency_symbol: 'POL',
    } as any);
    mockPreviewReserveBond.mockResolvedValue([500n, 750n, 1250000000000000000n]);
  });

  it('returns the configured native currency symbol for native-token previews', async () => {
    const result = await previewProtectedEventReserveBond(137, 'ETH', 0.2, 5);

    expect(result.symbol).toBe('POL');
    expect(result.decimals).toBe(18);
    expect(result.reserveBond).toBe('1250000000000000000');
    expect(mockPreviewReserveBond).toHaveBeenCalledWith(5, 200000000000000n);
  });
});
