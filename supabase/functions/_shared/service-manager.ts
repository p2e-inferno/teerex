/* deno-lint-ignore-file no-explicit-any */
import { ethers } from "https://esm.sh/ethers@6.14.4";
import { validateChain } from "./network-helpers.ts";
import { appendDivviTagToCalldataAsync, submitDivviReferralBestEffort } from "./divvi.ts";

const PublicLockABI = [
  {
    inputs: [],
    name: "renounceLockManager",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "_account", type: "address" }],
    name: "isLockManager",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
];

export async function renounceServiceManager(params: {
  supabase: any;
  lockAddress: string;
  chainId: number;
  userWallets: string[];
  requireUserManager?: boolean;
}): Promise<{ transactionHash: string }> {
  const { supabase, lockAddress, chainId, userWallets, requireUserManager = true } = params;

  const networkConfig = await validateChain(supabase, chainId);
  if (!networkConfig?.rpc_url) {
    throw new Error("rpc_not_configured");
  }

  const provider = new ethers.JsonRpcProvider(networkConfig.rpc_url);
  const lockContract = new ethers.Contract(lockAddress, PublicLockABI, provider);

  if (requireUserManager) {
    let authorized = false;
    for (const addr of userWallets) {
      const isManager = await lockContract.isLockManager(addr);
      if (isManager) {
        authorized = true;
        break;
      }
    }
    if (!authorized) {
      throw new Error("not_lock_manager");
    }
  }

  const serviceWalletPrivateKey = Deno.env.get("UNLOCK_SERVICE_PRIVATE_KEY");
  if (!serviceWalletPrivateKey) {
    throw new Error("missing_service_wallet_private_key");
  }

  const serviceWallet = new ethers.Wallet(serviceWalletPrivateKey, provider);
  const isServiceManager = await lockContract.isLockManager(serviceWallet.address);
  if (!isServiceManager) {
    throw new Error("service_wallet_not_manager");
  }

  const calldata = lockContract.interface.encodeFunctionData("renounceLockManager", []);
  const tagged = await appendDivviTagToCalldataAsync({
    data: calldata,
    user: serviceWallet.address as `0x${string}`,
  });
  const tx = await serviceWallet.sendTransaction({ to: lockAddress, data: tagged });
  const receipt = await tx.wait();

  if (receipt.status !== 1) {
    throw new Error("transaction_failed");
  }

  if (tx.hash && Number.isFinite(chainId)) {
    await submitDivviReferralBestEffort({ txHash: tx.hash, chainId });
  }

  return { transactionHash: receipt.transactionHash };
}
