import { ethers } from 'ethers';
import { parseEther, parseUnits } from 'viem';
import {
  getNetworkConfigByChainId,
  getTokenAddressAsync,
  ZERO_ADDRESS,
} from '@/lib/config/network-config';
import { getDivviEip1193Provider, getRawEip1193Provider } from '@/lib/wallet/provider';
import { ensureCorrectNetwork } from '@/utils/lockUtils';

const LOCK_ABI = [
  {
    inputs: [
      { type: 'uint256[]', name: '_values' },
      { type: 'address[]', name: '_recipients' },
      { type: 'address[]', name: '_referrers' },
      { type: 'address[]', name: '_keyManagers' },
      { type: 'bytes[]', name: '_data' },
    ],
    name: 'purchase',
    outputs: [{ type: 'uint256[]', name: 'tokenIds' }],
    stateMutability: 'payable',
    type: 'function',
  },
  { inputs: [], name: 'keyPrice', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'tokenAddress', outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ type: 'address', name: '_account' }], name: 'isLockManager', outputs: [{ type: 'bool' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ type: 'uint256', name: '_maxKeys' }], name: 'setMaxKeysPerAddress', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [], name: 'maxKeysPerAddress', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'maxNumberOfKeys', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'totalSupply', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'expirationDuration', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  {
    inputs: [
      { type: 'uint256', name: '_newExpirationDuration' },
      { type: 'uint256', name: '_maxNumberOfKeys' },
      { type: 'uint256', name: '_maxKeysPerAccount' },
    ],
    name: 'updateLockConfig',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ type: 'uint256', name: '_keyPrice' }, { type: 'address', name: '_tokenAddress' }],
    name: 'updateKeyPricing',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

const ERC20_ABI = [
  { inputs: [], name: 'decimals', outputs: [{ type: 'uint8' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ type: 'address', name: 'owner' }, { type: 'address', name: 'spender' }], name: 'allowance', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ type: 'address', name: 'spender' }, { type: 'uint256', name: 'value' }], name: 'approve', outputs: [{ type: 'bool' }], stateMutability: 'nonpayable', type: 'function' },
] as const;

const ZERO = '0x0000000000000000000000000000000000000000';

async function tokenInfo(chainId: number, currency: string) {
  if (currency === 'ETH') return { address: ZERO_ADDRESS, decimals: 18 };
  const address = await getTokenAddressAsync(chainId, currency as any);
  if (!address) throw new Error(`${currency} is not configured on this network.`);
  const network = await getNetworkConfigByChainId(chainId);
  if (!network?.rpc_url) throw new Error('Network RPC is not configured.');
  const provider = new ethers.JsonRpcProvider(network.rpc_url);
  const token = new ethers.Contract(address, ERC20_ABI, provider);
  return { address, decimals: Number(await token.decimals()) };
}

async function managedLock(wallet: any, lockAddress: string, chainId: number) {
  if (!wallet?.address) throw new Error('Connect your wallet first.');
  if (!ethers.isAddress(lockAddress)) throw new Error('Invalid lock address.');
  const rawProvider = await getRawEip1193Provider(wallet);
  await ensureCorrectNetwork(rawProvider, chainId);
  const provider = new ethers.BrowserProvider(rawProvider);
  const signer = await provider.getSigner();
  const signerAddress = await signer.getAddress();
  const lock = new ethers.Contract(lockAddress, LOCK_ABI, signer);
  if (!(await lock.isLockManager(signerAddress))) {
    throw new Error('The connected wallet is not a manager of this collectible lock.');
  }
  return { lock, signerAddress };
}

export async function purchaseLockKeys(
  lockAddress: string,
  expectedUnitPrice: number,
  currency: string,
  wallet: any,
  chainId: number,
  quantity = 1,
): Promise<{ success: boolean; transactionHash?: string; error?: string }> {
  try {
    if (!Number.isInteger(quantity) || quantity < 1) throw new Error('Quantity must be at least 1.');
    if (!ethers.isAddress(lockAddress) || !wallet?.address) throw new Error('Connect a wallet and try again.');

    const rawProvider = await getDivviEip1193Provider(wallet);
    await ensureCorrectNetwork(rawProvider, chainId);
    const provider = new ethers.BrowserProvider(rawProvider);
    const signer = await provider.getSigner();
    const owner = await signer.getAddress();
    const lock = new ethers.Contract(lockAddress, LOCK_ABI, signer);
    const info = await tokenInfo(chainId, currency);
    const expected = info.address === ZERO_ADDRESS
      ? parseEther(expectedUnitPrice.toString())
      : parseUnits(expectedUnitPrice.toString(), info.decimals);
    const [unitPrice, tokenAddress] = await Promise.all([lock.keyPrice(), lock.tokenAddress()]);
    if (unitPrice !== expected) throw new Error('The collectible price has changed. Refresh and try again.');
    if (String(tokenAddress).toLowerCase() !== info.address.toLowerCase()) {
      throw new Error('The collectible payment token has changed. Refresh and try again.');
    }

    const values = Array.from({ length: quantity }, () => unitPrice);
    const recipients = Array.from({ length: quantity }, () => owner);
    const referrers = Array.from({ length: quantity }, () => ZERO);
    const keyManagers = Array.from({ length: quantity }, () => ZERO);
    const data = Array.from({ length: quantity }, () => '0x');
    const totalCost = unitPrice * BigInt(quantity);

    if (info.address !== ZERO_ADDRESS) {
      const token = new ethers.Contract(info.address, ERC20_ABI, signer);
      const allowance = await token.allowance(owner, lockAddress);
      if (allowance < totalCost) {
        try {
          await (await token.approve(lockAddress, totalCost)).wait();
        } catch (error: any) {
          if (!String(error?.message || '').toLowerCase().includes('must be zero')) throw error;
          await (await token.approve(lockAddress, 0)).wait();
          await (await token.approve(lockAddress, totalCost)).wait();
        }
      }
    }

    const overrides = info.address === ZERO_ADDRESS ? { value: totalCost } : {};
    const estimated = await lock.purchase.estimateGas(values, recipients, referrers, keyManagers, data, overrides);
    const tx = await lock.purchase(values, recipients, referrers, keyManagers, data, {
      ...overrides,
      gasLimit: (estimated * 120n) / 100n,
    });
    const receipt = await tx.wait();
    if (receipt.status !== 1) throw new Error('Purchase transaction failed.');
    return { success: true, transactionHash: tx.hash };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Purchase failed.' };
  }
}

export async function setLockMaxKeysPerAddress(
  lockAddress: string,
  maxKeys: number,
  wallet: any,
  chainId: number,
): Promise<{ success: boolean; transactionHash?: string; error?: string }> {
  try {
    if (!Number.isInteger(maxKeys) || maxKeys < 1) throw new Error('Per-person limit must be at least 1.');
    const { lock } = await managedLock(wallet, lockAddress, chainId);
    const current = await lock.maxKeysPerAddress();
    if (current === BigInt(maxKeys)) return { success: true };
    const maxSupply = await lock.maxNumberOfKeys();
    if (BigInt(maxKeys) > maxSupply) throw new Error('Per-person limit cannot exceed total supply.');
    const tx = await lock.setMaxKeysPerAddress(maxKeys);
    const receipt = await tx.wait();
    if (receipt.status !== 1) throw new Error('Limit update failed.');
    return { success: true, transactionHash: tx.hash };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Could not update the per-person limit.' };
  }
}

export async function setLockMaxSupply(
  lockAddress: string,
  maxSupply: number,
  wallet: any,
  chainId: number,
): Promise<{ success: boolean; transactionHash?: string; error?: string }> {
  try {
    if (!Number.isInteger(maxSupply) || maxSupply < 1) throw new Error('Supply must be at least 1.');
    const { lock } = await managedLock(wallet, lockAddress, chainId);
    const [expiration, currentMaxSupply, perWallet, totalSupply] = await Promise.all([
      lock.expirationDuration(), lock.maxNumberOfKeys(), lock.maxKeysPerAddress(), lock.totalSupply(),
    ]);
    if (currentMaxSupply === BigInt(maxSupply)) return { success: true };
    if (BigInt(maxSupply) < totalSupply) throw new Error('Supply cannot be lower than the number already collected.');
    if (BigInt(maxSupply) < perWallet) throw new Error('Supply cannot be lower than the per-person purchase limit.');
    const tx = await lock.updateLockConfig(expiration, BigInt(maxSupply), perWallet);
    const receipt = await tx.wait();
    if (receipt.status !== 1) throw new Error('Supply update failed.');
    return { success: true, transactionHash: tx.hash };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Could not update supply.' };
  }
}

export async function setLockPrice(
  lockAddress: string,
  newPrice: number,
  currency: string,
  wallet: any,
  chainId: number,
): Promise<{ success: boolean; transactionHash?: string; error?: string }> {
  try {
    if (!Number.isFinite(newPrice) || newPrice <= 0) throw new Error('Price must be greater than zero.');
    const { lock } = await managedLock(wallet, lockAddress, chainId);
    const info = await tokenInfo(chainId, currency);
    const [currentToken, currentPrice] = await Promise.all([lock.tokenAddress(), lock.keyPrice()]);
    if (String(currentToken).toLowerCase() !== info.address.toLowerCase()) throw new Error('The lock currency does not match TeeRex configuration.');
    const rawPrice = info.address === ZERO_ADDRESS
      ? parseEther(newPrice.toString())
      : parseUnits(newPrice.toString(), info.decimals);
    if (currentPrice === rawPrice) return { success: true };
    const tx = await lock.updateKeyPricing(rawPrice, info.address);
    const receipt = await tx.wait();
    if (receipt.status !== 1) throw new Error('Price update failed.');
    return { success: true, transactionHash: tx.hash };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Could not update price.' };
  }
}
