/* deno-lint-ignore-file no-explicit-any */
import { Contract, JsonRpcProvider, Wallet } from "https://esm.sh/ethers@6.14.4";
import PublicLockV15 from "../_shared/abi/PublicLockV15.json" assert { type: "json" };
import { appendDivviTagToCalldataAsync, submitDivviReferralBestEffort } from "./divvi.ts";
import { extractTokenIdFromReceipt } from "./nft-helpers.ts";
import { retryWithBackoff, isRetryableTransactionError } from "./retry-helper.ts";

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
