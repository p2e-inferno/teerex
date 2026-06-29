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
  'function setPassMetadata(address lock, string lockName, string lockSymbol, string baseTokenURI)',
  'function dispense(address lock, uint256 tokenId)',
  'function dispenseNext(address lock)',
  'function isAllowedPayoutToken(address token) view returns (bool)',
  'function getAllowedPayoutTokens() view returns (address[])',
  'function remainingCopies(address lock) view returns (uint256)',
  'function nextUnredeemedToken(address lock, address owner) view returns (uint256 tokenId, bool found)',
  'function previewEscrowRequirement(uint256 maxCopies, uint256 tokenPerCopy, uint256 ethPerCopy) view returns (uint256 tokenEscrow, uint256 ethEscrow)',
  'function withdrawablePreview(address lock) view returns (uint256 tokenResidual, uint256 ethResidual)',
  'function passByLock(address) view returns (bool exists, bool closed, bool issuanceEnabled, address creator, address payoutToken, uint256 tokenPerCopy, uint256 ethPerCopy, uint256 maxCopies, uint256 keyExpiration, uint256 tokenEscrow, uint256 ethEscrow, uint256 redeemedCount, uint256 keyMaxPerAccount)',
  'event PassCreated(address indexed lock, address indexed creator, address indexed payoutToken, uint256 tokenPerCopy, uint256 ethPerCopy, uint256 maxCopies, uint256 keyExpiration, uint256 tokenEscrow, uint256 ethEscrow)',
  // Error fragments so client-side reverts decode to a named reason (err.revert.name) for friendly toasts.
  'error AlreadyClosed()',
  'error AlreadyRedeemed()',
  'error EmptyPass()',
  'error InsufficientTokenAllowance(uint256 required, uint256 allowance)',
  'error InsufficientTokenBalance(uint256 required, uint256 balance)',
  'error InvalidConfig()',
  'error InvalidFactory()',
  'error InvalidGranter()',
  'error InvalidKey()',
  'error InvalidLockVersion()',
  'error InvalidPayoutToken()',
  'error InvalidRecipient()',
  'error InvalidToken()',
  'error IssuanceDisabled()',
  'error MathOverflow()',
  'error NativeEscrowMismatch(uint256 required, uint256 provided)',
  'error NativeWithdrawFailed()',
  'error NotClosed()',
  'error NotCreator()',
  'error NotGranter()',
  'error NothingToWithdraw()',
  'error OrderAlreadyProcessed()',
  'error OwnableInvalidOwner(address owner)',
  'error OwnableUnauthorizedAccount(address account)',
  'error PassClosed()',
  'error PayoutNativeTransferFailed()',
  'error PerBuyerLimitReached()',
  'error ReentrancyGuardReentrantCall()',
  'error SafeERC20FailedOperation(address token)',
  'error SoldOut()',
  'error TokenNotAllowed(address token)',
  'error UnknownPass()',
];

const ERC20_ABI = [
  'function decimals() view returns (uint8)',
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 value) returns (bool)',
];

const PUBLIC_LOCK_BALANCE_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
];

const TICKET_PASS_ERROR_MESSAGES: Record<string, string> = {
  EmptyPass: 'A pass must deliver a token or native amount.',
  InvalidConfig: 'Invalid pass configuration.',
  InvalidPayoutToken: 'Invalid payout token for this pass.',
  TokenNotAllowed: 'That payout token is not on the allowlist.',
  NativeEscrowMismatch: 'The funded native amount does not match the pass total.',
  InsufficientTokenBalance: 'Insufficient token balance to fund the pass.',
  InsufficientTokenAllowance: 'Token allowance too low — approve the controller and try again.',
  MathOverflow: 'The escrow amount is too large.',
  NotCreator: 'Only the pass creator can perform this action.',
  AlreadyClosed: 'This pass is already closed.',
  NotClosed: 'Close the pass before withdrawing residual escrow.',
  NothingToWithdraw: 'There is nothing to withdraw.',
  UnknownPass: 'This pass is not recognised by the controller.',
  SoldOut: 'This pass has sold out.',
  PerBuyerLimitReached: 'You already hold the maximum number of this pass.',
  IssuanceDisabled: 'Issuance is currently paused for this pass.',
  PassClosed: 'This pass is closed.',
  AlreadyRedeemed: 'This pass has already been redeemed.',
  InvalidKey: 'No valid, unredeemed pass was found for your wallet.',
  InvalidRecipient: 'Invalid recipient address.',
  PayoutNativeTransferFailed: 'The native payout transfer failed.',
};

/** Turn a caught controller or wallet error into a friendly message. */
function decodeTicketPassError(err: any, fallback: string): string {
  const code = err?.code ?? err?.error?.code;
  const name: string | undefined = err?.revert?.name;
  if (name) return TICKET_PASS_ERROR_MESSAGES[name] ?? name;
  const msg = String(err?.shortMessage || err?.reason || (err instanceof Error ? err.message : '') || '');
  const lowerMessage = msg.toLowerCase();
  if (
    code === 4001 ||
    code === 'ACTION_REJECTED' ||
    lowerMessage.includes('user rejected') ||
    lowerMessage.includes('user denied')
  ) {
    return 'Transaction was cancelled. Please try again when ready.';
  }

  if (lowerMessage.includes('unsupported or inactive chainid')) {
    return 'The selected network is not active in TeeRex configuration.';
  }

  if (lowerMessage.includes('insufficient funds')) {
    return 'Insufficient funds for the pass escrow and network fees.';
  }

  if (lowerMessage.includes('notcreator') || lowerMessage.includes('not creator')) {
    return TICKET_PASS_ERROR_MESSAGES.NotCreator;
  }

  if (
    code === -32603 ||
    lowerMessage.includes('could not coalesce error') ||
    lowerMessage.includes('missing revert data') ||
    lowerMessage.includes('execution reverted') ||
    lowerMessage.includes('unknown custom error')
  ) {
    return 'The wallet could not complete this transaction. Check that your wallet is on the selected network, has enough gas, and has permission for this pass.';
  }

  return msg || fallback;
}

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

    // Preflight the payout-token allowlist for a friendly error (createPass reverts otherwise).
    if (config.tokenSymbol && payoutTokenAddress !== ZERO_ADDRESS) {
      const allowed: boolean = await controller.isAllowedPayoutToken(payoutTokenAddress);
      if (!allowed) {
        throw new Error(`${config.tokenSymbol} is not an allowed payout token on this network yet.`);
      }
    }

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
    const lower = error instanceof Error ? error.message.toLowerCase() : '';
    const message = lower.includes('insufficient funds')
      ? 'Insufficient funds for the pass escrow + gas.'
      : decodeTicketPassError(error, 'Failed to deploy Ticket Pass');
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
    return { success: false, error: decodeTicketPassError(error, 'Failed to close pass') };
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
    return { success: false, error: decodeTicketPassError(error, 'Failed to withdraw residual') };
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
    return { success: false, error: decodeTicketPassError(error, 'Failed to update issuance') };
  }
};

export const setTicketPassMetadata = async (
  lockAddress: string,
  controllerAddress: string,
  lockName: string,
  lockSymbol: string,
  baseTokenURI: string,
  wallet: any,
  chainId: number,
): Promise<TicketPassActionResult> => {
  try {
    const controller = await getControllerWithSigner(controllerAddress, wallet, chainId);
    const tx = await controller.setPassMetadata(lockAddress, lockName, lockSymbol, baseTokenURI);
    const receipt = await tx.wait();
    if (receipt.status !== 1) throw new Error('Metadata transaction failed.');
    return { success: true, transactionHash: tx.hash };
  } catch (error) {
    return { success: false, error: decodeTicketPassError(error, 'Failed to set pass metadata') };
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
    return { success: false, error: decodeTicketPassError(error, 'Failed to claim pass') };
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

export const getTicketPassBuyerKeyBalance = async (
  lockAddress: string,
  buyerAddress: string,
  chainId: number,
): Promise<number> => {
  if (!ethers.isAddress(lockAddress) || !ethers.isAddress(buyerAddress)) return 0;
  const provider = await getReadProvider(chainId);
  const lock = new ethers.Contract(lockAddress, PUBLIC_LOCK_BALANCE_ABI, provider);
  const balance: bigint = await lock.balanceOf(buyerAddress);
  return Number(balance);
};
