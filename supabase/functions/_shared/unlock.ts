/* deno-lint-ignore-file no-explicit-any */
import { Contract, JsonRpcProvider, Wallet, ethers } from "https://esm.sh/ethers@6.14.4";
import PublicLockV15 from "../_shared/abi/PublicLockV15.json" assert { type: "json" };
import ERC20ABI from "../_shared/abi/ERC20.json" assert { type: "json" };
import { appendDivviTagToCalldataAsync, submitDivviReferralBestEffort } from "./divvi.ts";
import { extractTokenIdFromReceipt } from "./nft-helpers.ts";
import { retryWithBackoff, isRetryableTransactionError } from "./retry-helper.ts";
import type { NetworkConfig } from "./network-helpers.ts";

// ============================================================================
// TOKEN RESOLUTION UTILITIES FOR LOCK DEPLOYMENT
// ============================================================================

/**
 * Token resolution result
 */
export interface TokenInfo {
  tokenAddress: string;
  decimals: number;
  keyPrice: bigint;
}

/**
 * Resolve token address, decimals, and calculate key price for Unlock Protocol
 *
 * Mirrors the client-side logic in src/utils/lockUtils.ts getTokenInfo()
 * to ensure consistent token handling across gasless and client-side deployments.
 *
 * @param currency - Currency symbol (ETH, USDC, DG, G, UP, FREE)
 * @param price - Human-readable price (e.g., 500 for 500 DG, 0.01 for 0.01 ETH)
 * @param chainId - Chain ID
 * @param networkConfig - Network configuration from database
 * @param provider - Ethers JsonRpcProvider instance
 * @returns Token address, decimals, and key price in wei/smallest unit
 * @throws Error if token is not configured for the chain
 *
 * @example
 * ```typescript
 * const provider = new JsonRpcProvider(networkConfig.rpc_url);
 * const { tokenAddress, decimals, keyPrice } = await resolveTokenInfo(
 *   'DG', 500, 8453, networkConfig, provider
 * );
 * // tokenAddress: '0x4aA47eD29959c7053996d8f7918db01A62D02ee5'
 * // decimals: 18
 * // keyPrice: 500000000000000000000n (500 × 10^18)
 * ```
 */
export async function resolveTokenInfo(
  currency: string,
  price: number,
  chainId: number,
  networkConfig: NetworkConfig,
  provider: JsonRpcProvider
): Promise<TokenInfo> {
  // Handle FREE events
  if (currency === 'FREE') {
    return {
      tokenAddress: ethers.ZeroAddress,
      decimals: 18,
      keyPrice: 0n,
    };
  }

  // Handle native token (ETH)
  if (currency === 'ETH') {
    return {
      tokenAddress: ethers.ZeroAddress,
      decimals: 18,
      keyPrice: ethers.parseEther(String(price)),
    };
  }

  // Handle ERC20 tokens (USDC, DG, G, UP) - dynamic resolution
  const tokenAddressMap: Record<string, string | null> = {
    'USDC': networkConfig.usdc_token_address,
    'DG': networkConfig.dg_token_address,
    'G': networkConfig.g_token_address,
    'UP': networkConfig.up_token_address,
  };

  const tokenAddress = tokenAddressMap[currency];

  if (!tokenAddress) {
    throw new Error(
      `${currency} token address not configured for chain ${chainId}. ` +
      `Please contact administrator to add ${currency.toLowerCase()}_token_address to network_configs.`
    );
  }

  // Fetch decimals from ERC20 contract
  const tokenContract = new Contract(tokenAddress, ERC20ABI as any, provider);
  let decimals: number;

  try {
    decimals = Number(await tokenContract.decimals());
  } catch (error) {
    console.error(`Failed to fetch decimals for ${currency} at ${tokenAddress}:`, error);
    throw new Error(
      `Failed to read decimals from ${currency} token contract at ${tokenAddress}. ` +
      `Please verify the token address is correct.`
    );
  }

  // Calculate key price in smallest unit
  const keyPrice = ethers.parseUnits(String(price), decimals);

  return {
    tokenAddress,
    decimals,
    keyPrice,
  };
}

/**
 * Get supported currencies for a network based on configured token addresses
 *
 * @param networkConfig - Network configuration from database
 * @returns Array of supported currency symbols
 */
export function getSupportedCurrencies(networkConfig: NetworkConfig): string[] {
  const currencies: string[] = ['FREE', 'ETH']; // Always supported

  if (networkConfig.usdc_token_address) currencies.push('USDC');
  if (networkConfig.dg_token_address) currencies.push('DG');
  if (networkConfig.g_token_address) currencies.push('G');
  if (networkConfig.up_token_address) currencies.push('UP');

  return currencies;
}

/**
 * Resolve currency symbol from token address (Phase 1 & 2 utility)
 *
 * Maps token contract addresses to currency symbols by comparing with network config.
 * Used for syncing database pricing from on-chain state.
 *
 * @param tokenAddress - Token contract address (or zero address for native)
 * @param networkConfig - Network configuration with token addresses
 * @returns Currency symbol (ETH, USDC, DG, G, UP, or UNKNOWN)
 *
 * @example
 * ```typescript
 * const currency = resolveCurrencyFromAddress(
 *   '0x4aA47eD29959c7053996d8f7918db01A62D02ee5',
 *   networkConfig
 * );
 * // Returns: 'DG'
 * ```
 */
export function resolveCurrencyFromAddress(
  tokenAddress: string,
  networkConfig: NetworkConfig
): string {
  // Native token (ETH)
  if (tokenAddress === ethers.ZeroAddress) {
    return 'ETH';
  }

  // Normalize addresses for comparison (lowercase)
  const normalizedAddress = tokenAddress.toLowerCase();

  if (networkConfig.usdc_token_address?.toLowerCase() === normalizedAddress) {
    return 'USDC';
  }
  if (networkConfig.dg_token_address?.toLowerCase() === normalizedAddress) {
    return 'DG';
  }
  if (networkConfig.g_token_address?.toLowerCase() === normalizedAddress) {
    return 'G';
  }
  if (networkConfig.up_token_address?.toLowerCase() === normalizedAddress) {
    return 'UP';
  }

  console.warn(`[resolveCurrencyFromAddress] Unknown token address ${tokenAddress}`);
  return 'UNKNOWN';
}

/**
 * Check if a lock is free by querying its on-chain keyPrice
 * Returns true if keyPrice is 0, false otherwise
 *
 * Useful for handling edge cases where price=0 but payment_methods doesn't include 'free'
 * (e.g., when event creation bug resulted in mismatch between DB and chain state)
 *
 * @param lockAddress - Lock contract address
 * @param rpcUrl - RPC URL for the network
 * @returns true if lock keyPrice is 0, false otherwise
 *
 * @example
 * ```typescript
 * const isFree = await isLockFreeOnchain(
 *   '0xe29c1A67953d2B664c66754fc0963a73FC645Dd7',
 *   'https://sepolia.base.org'
 * );
 * // Returns: true if keyPrice === 0n
 * ```
 */
export async function isLockFreeOnchain(
  lockAddress: string,
  rpcUrl: string
): Promise<boolean> {
  try {
    if (!lockAddress || !rpcUrl) {
      return false;
    }

    const provider = new JsonRpcProvider(rpcUrl);
    const lock = new Contract(lockAddress, PublicLockV15 as any, provider);
    const keyPrice = await lock.keyPrice();

    return keyPrice === 0n;
  } catch (error) {
    console.error(`[isLockFreeOnchain] Error checking if lock ${lockAddress} is free:`, error);
    return false;
  }
}

// ============================================================================
// EXISTING UTILITIES
// ============================================================================

/**
 * Checks in parallel if any address in `addresses` holds a valid key
 * for the given `lockAddress` using the provided `rpcUrl`.
 */
export async function isAnyUserWalletHasValidKeyParallel(
  lockAddress: string,
  addresses: string[],
  rpcUrl: string,
): Promise<{ anyHasKey: boolean; holder?: string }> {
  if (!lockAddress || !rpcUrl || !Array.isArray(addresses) || addresses.length === 0) {
    return { anyHasKey: false };
  }
  const provider = new JsonRpcProvider(rpcUrl);
  const lock = new Contract(lockAddress, PublicLockV15 as any, provider);
  const checks = await Promise.all(
    addresses.map(async (addr) => {
      try {
        const ok = await lock.getHasValidKey(addr);
        return { addr, ok: Boolean(ok) };
      } catch (_) {
        return { addr, ok: false };
      }
    })
  );
  const hit = checks.find((c) => c.ok);
  return { anyHasKey: Boolean(hit), holder: hit?.addr };
}

/**
 * Checks in parallel if any address in `addresses` is a lock manager
 * for the given `lockAddress` using the provided `rpcUrl`.
 */
export async function isAnyUserWalletIsLockManagerParallel(
  lockAddress: string,
  addresses: string[],
  rpcUrl: string,
): Promise<{ anyIsManager: boolean; manager?: string }> {
  if (!lockAddress || !rpcUrl || !Array.isArray(addresses) || addresses.length === 0) {
    return { anyIsManager: false };
  }

  const provider = new JsonRpcProvider(rpcUrl);

  // Minimal ABI for isLockManager function
  const lockManagerABI = [
    {
      inputs: [{ internalType: "address", name: "_account", type: "address" }],
      name: "isLockManager",
      outputs: [{ internalType: "bool", name: "", type: "bool" }],
      stateMutability: "view",
      type: "function",
    },
  ];

  const lock = new Contract(lockAddress, lockManagerABI, provider);

  const checks = await Promise.all(
    addresses.map(async (addr) => {
      try {
        const ok = await lock.isLockManager(addr);
        return { addr, ok: Boolean(ok) };
      } catch (_) {
        return { addr, ok: false };
      }
    })
  );

  const hit = checks.find((c) => c.ok);
  return { anyIsManager: Boolean(hit), manager: hit?.addr };
}

export async function grantLockKey(params: {
  rpcUrl: string;
  chainId: number;
  lockAddress: string;
  serviceWalletPrivateKey: string;
  recipient: string;
  expirationSeconds: number;
  keyManager?: string;
  requireTokenId?: boolean;
}): Promise<{ alreadyHasKey: boolean; txHash?: string; tokenId?: string | null }> {
  const {
    rpcUrl,
    chainId,
    lockAddress,
    serviceWalletPrivateKey,
    recipient,
    expirationSeconds,
    keyManager,
    requireTokenId = false,
  } = params;

  if (!rpcUrl) throw new Error("rpc_not_configured");
  if (!lockAddress) throw new Error("missing_lock_address");
  if (!serviceWalletPrivateKey) throw new Error("missing_service_pk");
  if (!recipient) throw new Error("missing_recipient");

  const provider = new JsonRpcProvider(rpcUrl);
  const signer = new Wallet(serviceWalletPrivateKey, provider);
  const lock = new Contract(lockAddress, PublicLockV15 as any, signer);

  const isManager = await lock.isLockManager(await signer.getAddress());
  if (!isManager) throw new Error("service_wallet_not_lock_manager");

  const hasKey: boolean = await lock.getHasValidKey(recipient).catch(() => false);
  if (hasKey) return { alreadyHasKey: true };

  const expirationTimestamp = Math.floor(Date.now() / 1000) + Number(expirationSeconds || 0);
  const recipients = [recipient];
  const expirations = [BigInt(expirationTimestamp)];
  const keyManagers = [keyManager || recipient];

  const serviceUser = (await signer.getAddress()) as `0x${string}`;
  const calldata = lock.interface.encodeFunctionData("grantKeys", [recipients, expirations, keyManagers]);
  const taggedData = await appendDivviTagToCalldataAsync({ data: calldata, user: serviceUser });

  const receipt = await retryWithBackoff(
    async () => {
      const currentNonce = await signer.getNonce();
      const txSend = await signer.sendTransaction({ to: lockAddress, data: taggedData, nonce: currentNonce });
      return await txSend.wait();
    },
    {
      maxAttempts: 3,
      initialDelay: 1000,
      backoffMultiplier: 2,
      maxDelay: 5000,
      shouldRetry: isRetryableTransactionError,
    },
    "grantKeys",
  );

  const txHash = (receipt as any)?.hash ?? (receipt as any)?.transactionHash;
  if (txHash && Number.isFinite(chainId)) {
    await submitDivviReferralBestEffort({ txHash, chainId }).catch(() => { });
  }

  let tokenId: string | null = null;
  try {
    tokenId = await extractTokenIdFromReceipt(receipt as any, lockAddress, recipient);
  } catch (e: any) {
    if (requireTokenId) throw e;
  }
  return { alreadyHasKey: false, txHash, tokenId };
}
