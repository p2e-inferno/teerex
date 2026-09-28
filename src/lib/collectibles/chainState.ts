import { ethers } from 'ethers';
import { getNetworkConfigByChainId } from '@/lib/config/network-config';

const READ_ABI = [
  { inputs: [], name: 'totalSupply', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'maxKeysPerAddress', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ type: 'address', name: 'owner' }], name: 'balanceOf', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
] as const;

async function readContract(lockAddress: string, chainId: number) {
  if (!ethers.isAddress(lockAddress)) throw new Error('Invalid collectible lock address.');
  const network = await getNetworkConfigByChainId(chainId);
  if (!network?.rpc_url) throw new Error(`No RPC is configured for chain ${chainId}.`);
  const provider = new ethers.JsonRpcProvider(network.rpc_url);
  const code = await provider.getCode(lockAddress);
  if (code === '0x') throw new Error('The collectible contract is not available on its configured network.');
  return new ethers.Contract(lockAddress, READ_ABI, provider);
}

export async function readCollectibleBalances(
  lockAddress: string,
  chainId: number,
  addresses: string[],
): Promise<number[]> {
  const normalized = addresses.map((address) => {
    if (!ethers.isAddress(address)) throw new Error('Invalid collector wallet address.');
    return address;
  });
  const lock = await readContract(lockAddress, chainId);
  const balances = await Promise.all(normalized.map((address) => lock.balanceOf(address)));
  return balances.map((value) => Number(value));
}

export async function readCollectibleChainState(
  lockAddress: string,
  chainId: number,
  addresses: string[] = [],
): Promise<{ sold: number; maxPerWallet: number; owned: number }> {
  const normalized = addresses.map((address) => {
    if (!ethers.isAddress(address)) throw new Error('Invalid collector wallet address.');
    return address;
  });
  const lock = await readContract(lockAddress, chainId);
  const [sold, maxPerWallet, balances] = await Promise.all([
    lock.totalSupply(),
    lock.maxKeysPerAddress(),
    Promise.all(normalized.map((address) => lock.balanceOf(address))),
  ]);
  return {
    sold: Number(sold),
    maxPerWallet: Number(maxPerWallet) || 1,
    owned: balances.reduce((sum, value) => sum + Number(value), 0),
  };
}
