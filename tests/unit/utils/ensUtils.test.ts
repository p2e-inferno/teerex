import { beforeEach, describe, expect, it, vi } from 'vitest';

const viemMocks = vi.hoisted(() => ({
  createPublicClient: vi.fn(),
  fallback: vi.fn(),
  http: vi.fn(),
  getEnsAddress: vi.fn(),
  getEnsName: vi.fn(),
  getNetworkConfigByChainId: vi.fn(),
  normalize: vi.fn((name: string) => name.toLowerCase()),
}));

vi.mock('viem', () => ({
  createPublicClient: viemMocks.createPublicClient,
  fallback: viemMocks.fallback,
  http: viemMocks.http,
}));

vi.mock('viem/chains', () => ({
  mainnet: { id: 1, name: 'Ethereum' },
}));

vi.mock('viem/ens', () => ({
  normalize: viemMocks.normalize,
}));

vi.mock('@/lib/config/network-config', () => ({
  getNetworkConfigByChainId: viemMocks.getNetworkConfigByChainId,
}));

describe('ensUtils', () => {
  beforeEach(() => {
    vi.resetModules();
    for (const mock of Object.values(viemMocks)) {
      mock.mockReset();
    }
    viemMocks.normalize.mockImplementation((name: string) => name.toLowerCase());
  });

  it('creates the ENS client with the configured Ethereum RPC before public fallbacks', async () => {
    const httpTransports: Array<{ url: string }> = [];
    viemMocks.http.mockImplementation((url: string) => {
      const transport = { url };
      httpTransports.push(transport);
      return transport;
    });
    viemMocks.fallback.mockReturnValue({ type: 'fallback' });
    viemMocks.createPublicClient.mockReturnValue({
      getEnsAddress: viemMocks.getEnsAddress,
      getEnsName: viemMocks.getEnsName,
    });
    viemMocks.getNetworkConfigByChainId.mockResolvedValue({
      rpc_url: 'https://keyed-mainnet.example/rpc',
    });

    const { resolveENSRpcUrls, createENSClient } = await import('@/utils/ensUtils');
    const rpcUrls = await resolveENSRpcUrls();

    createENSClient(rpcUrls);

    expect(rpcUrls).toEqual([
      'https://keyed-mainnet.example/rpc',
      'https://ethereum-rpc.publicnode.com',
      'https://rpc.flashbots.net',
    ]);
    expect(viemMocks.getNetworkConfigByChainId).toHaveBeenCalledWith(1);
    expect(viemMocks.http).toHaveBeenCalledTimes(rpcUrls.length);
    expect(viemMocks.http).toHaveBeenNthCalledWith(1, 'https://keyed-mainnet.example/rpc');
    expect(viemMocks.http).toHaveBeenNthCalledWith(2, 'https://ethereum-rpc.publicnode.com');
    expect(viemMocks.http).toHaveBeenNthCalledWith(3, 'https://rpc.flashbots.net');
    expect(viemMocks.fallback).toHaveBeenCalledWith(httpTransports, { rank: false });
    expect(viemMocks.createPublicClient).toHaveBeenCalledWith({
      chain: { id: 1, name: 'Ethereum' },
      transport: { type: 'fallback' },
    });
  });

  it('resolves normalized ENS names through the mainnet client', async () => {
    viemMocks.http.mockReturnValue({ type: 'http' });
    viemMocks.fallback.mockReturnValue({ type: 'fallback' });
    viemMocks.getEnsAddress.mockResolvedValue('0x1234567890123456789012345678901234567890');
    viemMocks.createPublicClient.mockReturnValue({
      getEnsAddress: viemMocks.getEnsAddress,
      getEnsName: viemMocks.getEnsName,
    });
    viemMocks.getNetworkConfigByChainId.mockResolvedValue({
      rpc_url: 'https://keyed-mainnet.example/rpc',
    });

    const { resolveENS } = await import('@/utils/ensUtils');

    await expect(resolveENS('Vitalik.eth')).resolves.toBe('0x1234567890123456789012345678901234567890');
    expect(viemMocks.getNetworkConfigByChainId).toHaveBeenCalledWith(1);
    expect(viemMocks.http).toHaveBeenNthCalledWith(1, 'https://keyed-mainnet.example/rpc');
    expect(viemMocks.normalize).toHaveBeenCalledWith('Vitalik.eth');
    expect(viemMocks.getEnsAddress).toHaveBeenCalledWith({ name: 'vitalik.eth' });
  });

  it('rejects invalid ENS input before creating a client', async () => {
    const { resolveENS } = await import('@/utils/ensUtils');

    await expect(resolveENS('not-an-ens-name')).rejects.toThrow('Invalid ENS name format');
    expect(viemMocks.getNetworkConfigByChainId).not.toHaveBeenCalled();
    expect(viemMocks.createPublicClient).not.toHaveBeenCalled();
  });
});
