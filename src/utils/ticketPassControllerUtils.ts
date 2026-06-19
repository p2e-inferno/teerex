import { ethers } from 'ethers';
import {
  getNetworkConfigByChainId,
  getRpcUrl,
  getTokenAddressAsync,
  ZERO_ADDRESS,
} from '@/lib/config/network-config';
import { getTicketPassControllerAddress } from '@/lib/config/contract-config';
import { ensureCorrectNetwork } from '@/utils/lockUtils';
import { getRawEip1193Provider } from '@/lib/wallet/provider';
import type { TicketPassOnchainState } from '@/types/ticketPass';

export const TICKET_PASS_CONTROLLER_ABI = [
  'function createPass(uint256 expirationDuration, uint256 maxCopies, uint256 maxKeysPerAccount, string lockName, address payoutToken, uint256 tokenPerCopy, uint256 ethPerCopy, address creator_) payable returns (address lock)',
  'function closePass(address lock)',
  'function withdrawResidual(address lock)',
  'function setIssuanceEnabled(address lock, bool enabled)',
  'function dispense(address lock, uint256 tokenId)',
  'function dispenseNext(address lock)',
  'function remainingCopies(address lock) view returns (uint256)',
  'function nextUnredeemedToken(address lock, address owner) view returns (uint256 tokenId, bool found)',
  'function previewEscrowRequirement(uint256 maxCopies, uint256 tokenPerCopy, uint256 ethPerCopy) view returns (uint256 tokenEscrow, uint256 ethEscrow)',
  'function withdrawablePreview(address lock) view returns (uint256 tokenResidual, uint256 ethResidual)',
  'function passByLock(address) view returns (bool exists, bool closed, bool issuanceEnabled, address creator, address payoutToken, uint256 tokenPerCopy, uint256 ethPerCopy, uint256 maxCopies, uint256 keyExpiration, uint256 tokenEscrow, uint256 ethEscrow, uint256 redeemedCount)',
  'event PassCreated(address indexed lock, address indexed creator, address indexed payoutToken, uint256 tokenPerCopy, uint256 ethPerCopy, uint256 maxCopies, uint256 keyExpiration, uint256 tokenEscrow, uint256 ethEscrow)',
];

const ERC20_ABI = [
  'function decimals() view returns (uint8)',
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 value) returns (bool)',
];

export type TicketPassPayoutSymbol = 'USDC' | 'DG' | 'G' | 'UP';

export interface TicketPassDeployConfig {
  lockName: string;
  /** ERC20 to dispense per copy (omit/null for native-only passes). */
  tokenSymbol?: TicketPassPayoutSymbol | null;
  /** Human-readable ERC20 amount per copy (e.g. "50"). Ignored when tokenSymbol is null. */
  tokenPerCopy?: string;
  /** Human-readable native amount per copy (e.g. "0.01"). */
  ethPerCopy?: string;
  maxCopies: number;
  maxPerBuyer: number;
  expirationSeconds: number;
  /** On-chain pass owner; defaults to the connected wallet. */
  creatorAddress?: string;
}

export interface TicketPassDeployResult {
  success: boolean;
  transactionHash?: string;
  lockAddress?: string;
  controllerAddress?: string;
  payoutTokenAddress?: string | null;
  payoutTokenSymbol?: string | null;
  tokenDecimals?: number | null;
  tokenPerCopyWei?: string;
  ethPerCopyWei?: string;
  error?: string;
}

export interface TicketPassActionResult {
  success: boolean;
  transactionHash?: string;
  error?: string;
}

async function getReadProvider(chainId: number): Promise<ethers.JsonRpcProvider> {
  const networkConfig = await getNetworkConfigByChainId(chainId);
  let rpcUrl = networkConfig?.rpc_url || undefined;
  if (!rpcUrl) {
    try { rpcUrl = getRpcUrl(chainId); } catch { rpcUrl = undefined; }
  }
  if (!rpcUrl) throw new Error(`No RPC URL configured for chain ID ${chainId}`);
  return new ethers.JsonRpcProvider(rpcUrl);
}

async function getControllerWithSigner(controllerAddress: string, wallet: any, chainId: number) {
  if (!wallet?.address) throw new Error('No wallet provided. Please connect your wallet first.');
  if (!ethers.isAddress(controllerAddress)) throw new Error('Invalid Ticket Pass controller address.');
  const provider = await getRawEip1193Provider(wallet);
  await ensureCorrectNetwork(provider, chainId);
  const signer = await new ethers.BrowserProvider(provider).getSigner();
  return new ethers.Contract(controllerAddress, TICKET_PASS_CONTROLLER_ABI, signer);
}

async function resolveTokenInfo(
  chainId: number,
  symbol: TicketPassPayoutSymbol,
): Promise<{ address: string; decimals: number }> {
  const address = await getTokenAddressAsync(chainId, symbol as any);
  if (!address) throw new Error(`${symbol} token is not configured for this network.`);
  const provider = await getReadProvider(chainId);
  const token = new ethers.Contract(address, ERC20_ABI, provider);
  const decimals = Number(await token.decimals());
  return { address, decimals };
}

/**
 * Preview the escrow a creator must deposit for a pass: tokenPerCopy*maxCopies and ethPerCopy*maxCopies.
 * Computed locally (the contract's previewEscrowRequirement is pure) to keep the form responsive.
 */
export function previewTicketPassEscrow(params: {
  maxCopies: number;
  tokenPerCopyWei: bigint;
  ethPerCopyWei: bigint;
}): { tokenEscrowWei: bigint; ethEscrowWei: bigint } {
  const copies = BigInt(params.maxCopies);
  return {
    tokenEscrowWei: params.tokenPerCopyWei * copies,
    ethEscrowWei: params.ethPerCopyWei * copies,
  };
}

/**
 * Deploy + fund a Ticket Pass in a single controller transaction. Approves the ERC20 escrow first
 * when a token payout is configured.
 */
export const deployTicketPass = async (
  config: TicketPassDeployConfig,
  wallet: any,
  chainId: number,
): Promise<TicketPassDeployResult> => {
  try {
    if (!wallet?.address) throw new Error('No wallet provided. Please connect your wallet first.');
    if (!chainId) throw new Error('Missing chainId for deployment.');
    if (!Number.isFinite(config.maxCopies) || config.maxCopies <= 0) throw new Error('Max copies must be greater than zero.');
    if (!Number.isFinite(config.maxPerBuyer) || config.maxPerBuyer <= 0 || config.maxPerBuyer > config.maxCopies) {
      throw new Error('Max per buyer must be between 1 and max copies.');
    }
    if (!Number.isFinite(config.expirationSeconds) || config.expirationSeconds <= 0) {
      throw new Error('Pass expiration must be greater than zero.');
    }

    const controllerAddress = await getTicketPassControllerAddress(chainId);

    let payoutTokenAddress = ZERO_ADDRESS;
    let tokenDecimals: number | null = null;
    let tokenPerCopyWei = 0n;
    if (config.tokenSymbol) {
      const info = await resolveTokenInfo(chainId, config.tokenSymbol);
      payoutTokenAddress = info.address;
      tokenDecimals = info.decimals;
      tokenPerCopyWei = ethers.parseUnits(String(config.tokenPerCopy ?? '0'), info.decimals);
    }
    const ethPerCopyWei = config.ethPerCopy ? ethers.parseEther(String(config.ethPerCopy)) : 0n;

    if (tokenPerCopyWei === 0n && ethPerCopyWei === 0n) {
      throw new Error('A pass must deliver a token amount, an ETH amount, or both.');
    }

    const { tokenEscrowWei, ethEscrowWei } = previewTicketPassEscrow({
      maxCopies: config.maxCopies,
      tokenPerCopyWei,
      ethPerCopyWei,
    });

    const provider = await getRawEip1193Provider(wallet);
    await ensureCorrectNetwork(provider, chainId);
    const signer = await new ethers.BrowserProvider(provider).getSigner();
    const signerAddress = await signer.getAddress();

    // Approve ERC20 escrow up-front (with the must-be-zero reset fallback some tokens require).
    if (tokenPerCopyWei > 0n && tokenEscrowWei > 0n) {
      const token = new ethers.Contract(payoutTokenAddress, ERC20_ABI, signer);
      const allowance: bigint = await token.allowance(signerAddress, controllerAddress);
      if (allowance < tokenEscrowWei) {
        try {
          await (await token.approve(controllerAddress, tokenEscrowWei)).wait();
        } catch (error: any) {
          if (String(error?.message || '').toLowerCase().includes('must be zero')) {
            await (await token.approve(controllerAddress, 0)).wait();
            await (await token.approve(controllerAddress, tokenEscrowWei)).wait();
          } else {
            throw error;
          }
        }
      }
    }

    const controller = new ethers.Contract(controllerAddress, TICKET_PASS_CONTROLLER_ABI, signer);
    const tx = await controller.createPass(
      config.expirationSeconds,
      config.maxCopies,
      config.maxPerBuyer,
      config.lockName,
      payoutTokenAddress,
      tokenPerCopyWei,
      ethPerCopyWei,
      config.creatorAddress || signerAddress,
      ethEscrowWei > 0n ? { value: ethEscrowWei } : {},
    );
    const receipt = await tx.wait();
    if (receipt.status !== 1) throw new Error('Ticket Pass deployment failed.');

    let lockAddress = '';
    const iface = new ethers.Interface(TICKET_PASS_CONTROLLER_ABI);
    for (const log of receipt.logs || []) {
      try {
        const parsed = iface.parseLog({ topics: log.topics, data: log.data });
        if (parsed?.name === 'PassCreated') {
          lockAddress = parsed.args.lock;
          break;
        }
      } catch {
        // ignore logs from other contracts
      }
    }
    if (!lockAddress || !ethers.isAddress(lockAddress)) {
      throw new Error('Could not find pass lock address in deployment receipt.');
    }

    return {
      success: true,
      transactionHash: tx.hash,
      lockAddress,
      controllerAddress,
      payoutTokenAddress: config.tokenSymbol ? payoutTokenAddress : null,
      payoutTokenSymbol: config.tokenSymbol || null,
      tokenDecimals,
      tokenPerCopyWei: tokenPerCopyWei.toString(),
      ethPerCopyWei: ethPerCopyWei.toString(),
    };
  } catch (error) {
    console.error('Error deploying Ticket Pass:', error);
    let message = 'Failed to deploy Ticket Pass';
    if (error instanceof Error) {
      if (error.message.toLowerCase().includes('user rejected')) message = 'Transaction was cancelled. Please try again when ready.';
      else if (error.message.toLowerCase().includes('insufficient funds')) message = 'Insufficient funds for the pass escrow + gas.';
      else message = error.message;
    }
    return { success: false, error: message };
  }
};

export const closeTicketPass = async (
  lockAddress: string,
  controllerAddress: string,
  wallet: any,
  chainId: number,
): Promise<TicketPassActionResult> => {
  try {
    const controller = await getControllerWithSigner(controllerAddress, wallet, chainId);
    const tx = await controller.closePass(lockAddress);
    const receipt = await tx.wait();
    if (receipt.status !== 1) throw new Error('Close transaction failed.');
    return { success: true, transactionHash: tx.hash };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to close pass' };
  }
};

export const withdrawTicketPassResidual = async (
  lockAddress: string,
  controllerAddress: string,
  wallet: any,
  chainId: number,
): Promise<TicketPassActionResult> => {
  try {
    const controller = await getControllerWithSigner(controllerAddress, wallet, chainId);
    const tx = await controller.withdrawResidual(lockAddress);
    const receipt = await tx.wait();
    if (receipt.status !== 1) throw new Error('Withdraw transaction failed.');
    return { success: true, transactionHash: tx.hash };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to withdraw residual' };
  }
};

/** Creator kill-switch for platform issuance (the "remove service manager" analog). */
export const setTicketPassIssuance = async (
  lockAddress: string,
  controllerAddress: string,
  enabled: boolean,
  wallet: any,
  chainId: number,
): Promise<TicketPassActionResult> => {
  try {
    const controller = await getControllerWithSigner(controllerAddress, wallet, chainId);
    const tx = await controller.setIssuanceEnabled(lockAddress, enabled);
    const receipt = await tx.wait();
    if (receipt.status !== 1) throw new Error('Issuance toggle transaction failed.');
    return { success: true, transactionHash: tx.hash };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update issuance' };
  }
};

/** Self-serve recovery: dispense the connected wallet's next valid, undispensed pass. */
export const selfDispenseTicketPass = async (
  lockAddress: string,
  controllerAddress: string,
  wallet: any,
  chainId: number,
): Promise<TicketPassActionResult> => {
  try {
    const controller = await getControllerWithSigner(controllerAddress, wallet, chainId);
    const tx = await controller.dispenseNext(lockAddress);
    const receipt = await tx.wait();
    if (receipt.status !== 1) throw new Error('Dispense transaction failed.');
    return { success: true, transactionHash: tx.hash };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to claim pass' };
  }
};

export const getTicketPassOnchainState = async (
  lockAddress: string,
  controllerAddress: string,
  chainId: number,
): Promise<TicketPassOnchainState | null> => {
  try {
    const provider = await getReadProvider(chainId);
    const controller = new ethers.Contract(controllerAddress, TICKET_PASS_CONTROLLER_ABI, provider);
    const cfg = await controller.passByLock(lockAddress);
    if (!cfg.exists) return null;
    const remaining: bigint = await controller.remainingCopies(lockAddress).catch(() => 0n);
    return {
      exists: cfg.exists,
      closed: cfg.closed,
      issuanceEnabled: cfg.issuanceEnabled,
      creator: cfg.creator,
      payoutToken: cfg.payoutToken,
      tokenPerCopy: cfg.tokenPerCopy,
      ethPerCopy: cfg.ethPerCopy,
      maxCopies: cfg.maxCopies,
      redeemedCount: cfg.redeemedCount,
      remaining,
    };
  } catch (error) {
    console.error('Error reading Ticket Pass on-chain state:', error);
    return null;
  }
};
