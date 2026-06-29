import { useState } from 'react';
import { ethers } from 'ethers';
import { useWallets } from '@privy-io/react-auth';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { getDivviBrowserProvider, getDivviEip1193Provider } from '@/lib/wallet/provider';
import { getTokenAddressAsync, getExplorerTxUrl } from '@/lib/config/network-config';
import { ExternalLink, Copy, Check } from 'lucide-react';
import type { CryptoCurrency } from '@/types/currency';

interface TransferSuccessToastProps {
  amount: string;
  tokenSymbol: string;
  recipient: string;
  txHash: string;
  explorerUrl: string;
}

function TransferSuccessToast({
  amount,
  tokenSymbol,
  recipient,
  txHash,
  explorerUrl,
}: TransferSuccessToastProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: { preventDefault: () => void; stopPropagation: () => void }) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(txHash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy tx hash:', err);
    }
  };

  const shortTx = `${txHash.slice(0, 6)}...${txHash.slice(-4)}`;
  const shortRecipient = `${recipient.slice(0, 6)}...${recipient.slice(-4)}`;

  return (
    <div className="flex flex-col gap-2 mt-1 min-w-0">
      <p className="text-sm text-muted-foreground">
        Sent {amount} {tokenSymbol} to {shortRecipient}.
      </p>
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <span className="text-muted-foreground">Tx:</span>
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-violet-600 hover:text-violet-700 dark:text-violet-400 underline font-mono font-medium flex items-center gap-1"
        >
          {shortTx}
          <ExternalLink className="h-3 w-3" />
        </a>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center justify-center gap-1 rounded border bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-foreground hover:bg-muted transition-colors"
          title="Copy transaction hash"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-green-600 dark:text-green-400" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

/**
 * Minimal ERC-20 ABI for transfer
 */
const ERC20_TRANSFER_ABI = [
  {
    inputs: [
      { internalType: 'address', name: 'recipient', type: 'address' },
      { internalType: 'uint256', name: 'amount', type: 'uint256' },
    ],
    name: 'transfer',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

/**
 * Ensures the wallet is connected to the correct network
 * Prompts user to switch if needed, adds network if not present
 */
async function ensureCorrectNetwork(rawProvider: any, chainId: number) {
  const { getNetworkConfigByChainId } = await import('@/lib/config/network-config');
  const networkConfig = await getNetworkConfigByChainId(chainId);

  if (!networkConfig) {
    throw new Error(`Unsupported or inactive chainId ${chainId}`);
  }

  const chain = {
    name: networkConfig.chain_name,
    nativeCurrency: {
      name: networkConfig.native_currency_name || 'Ether',
      symbol: networkConfig.native_currency_symbol,
      decimals: networkConfig.native_currency_decimals || 18,
    },
    rpcUrls: {
      default: { http: networkConfig.rpc_url ? [networkConfig.rpc_url] : [] },
    },
    blockExplorers: networkConfig.block_explorer_url
      ? { default: { url: networkConfig.block_explorer_url } }
      : undefined,
  };

  const targetChainIdHex = `0x${chainId.toString(16)}`;

  try {
    await rawProvider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: targetChainIdHex }],
    });
  } catch (switchError: any) {
    if (switchError?.code === 4902) {
      // Chain not added to wallet, add it
      await rawProvider.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: targetChainIdHex,
            chainName: chain.name,
            nativeCurrency: chain.nativeCurrency,
            rpcUrls: chain.rpcUrls.default.http,
            blockExplorerUrls: chain.blockExplorers?.default?.url
              ? [chain.blockExplorers.default.url]
              : [],
          },
        ],
      });
    } else {
      throw switchError;
    }
  }
}

export interface TransferParams {
  recipient: string; // Already validated/resolved address
  amount: string; // Human-readable amount (e.g., "1.5")
  tokenSymbol: CryptoCurrency | 'ETH';
  chainId: number;
}

export interface UseTokenTransferResult {
  transferToken: (params: TransferParams) => Promise<void>;
  isTransferring: boolean;
  error: string | null;
  txHash: string | null;
}

/**
 * Hook for executing token transfers (native + ERC-20)
 *
 * Handles:
 * - Network switching
 * - Native token transfers (ETH, POL, etc.)
 * - ERC-20 token transfers
 * - Divvi referral tracking
 * - Transaction confirmation
 * - Balance cache invalidation
 * - User-friendly error messages
 *
 * @returns Transfer function and state
 */
export function useTokenTransfer(): UseTokenTransferResult {
  const [isTransferring, setIsTransferring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const { wallets } = useWallets();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const transferToken = async (params: TransferParams) => {
    const { recipient, amount, tokenSymbol, chainId } = params;

    setIsTransferring(true);
    setError(null);
    setTxHash(null);

    try {
      // Get wallet
      const wallet = wallets[0];
      if (!wallet) {
        throw new Error('No wallet connected');
      }

      // Get Divvi-wrapped provider (for referral tracking)
      const rawProvider = await getDivviEip1193Provider(wallet);

      // Ensure correct network
      await ensureCorrectNetwork(rawProvider, chainId);

      // Create signer
      const ethersProvider = await getDivviBrowserProvider(wallet);
      const signer = await ethersProvider.getSigner();

      let tx: any;
      const isNative = tokenSymbol === 'ETH' || !tokenSymbol.match(/^(USDC|DG|G|UP)$/);

      if (isNative) {
        // Native token transfer
        const parsedAmount = ethers.parseEther(amount);

        // Estimate gas with 20% buffer for Base network reliability
        let gasLimit: bigint;
        try {
          const estimated = await signer.estimateGas({
            to: recipient,
            value: parsedAmount,
          });
          gasLimit = (estimated * 120n) / 100n; // Add 20% buffer
        } catch (estimateError) {
          console.warn('Gas estimation failed, using fallback:', estimateError);
          gasLimit = 21000n; // Standard ETH transfer gas limit
        }

        tx = await signer.sendTransaction({
          to: recipient,
          value: parsedAmount,
          gasLimit,
        });
      } else {
        // ERC-20 token transfer
        const tokenAddress = await getTokenAddressAsync(chainId, tokenSymbol as any);
        if (!tokenAddress) {
          throw new Error(`${tokenSymbol} token not configured for this network`);
        }

        // Get token decimals
        const tokenContract = new ethers.Contract(
          tokenAddress,
          ['function decimals() view returns (uint8)'],
          signer
        );
        const decimals = await tokenContract.decimals();

        // Parse amount with correct decimals
        const parsedAmount = ethers.parseUnits(amount, Number(decimals));

        // Create transfer contract
        const transferContract = new ethers.Contract(
          tokenAddress,
          ERC20_TRANSFER_ABI,
          signer
        );

        // Estimate gas with 20% buffer for Base network reliability
        let gasLimit: bigint;
        try {
          const estimated = await transferContract.transfer.estimateGas(recipient, parsedAmount);
          gasLimit = (estimated * 120n) / 100n; // Add 20% buffer
        } catch (estimateError) {
          console.warn('Gas estimation failed, using fallback:', estimateError);
          gasLimit = 65000n; // Standard ERC20 transfer fallback
        }

        // Execute transfer with explicit gas limit
        tx = await transferContract.transfer(recipient, parsedAmount, { gasLimit });
      }

      // Wait for confirmation
      const receipt = await tx.wait();

      if (receipt.status !== 1) {
        throw new Error('Transaction failed');
      }

      setTxHash(tx.hash);

      // Show success toast with explorer link
      const explorerUrl = await getExplorerTxUrl(chainId, tx.hash);
      toast({
        title: 'Transfer Successful!',
        duration: 7000,
        description: (
          <TransferSuccessToast
            amount={amount}
            tokenSymbol={tokenSymbol}
            recipient={recipient}
            txHash={tx.hash}
            explorerUrl={explorerUrl}
          />
        ),
      });

      // Invalidate balance caches
      queryClient.invalidateQueries({ queryKey: ['native-balance'] });
      queryClient.invalidateQueries({ queryKey: ['erc20-balance'] });

    } catch (err: any) {
      console.error('Transfer error:', err);

      let errorMessage = 'Failed to transfer tokens';

      // Handle user rejection (various error codes and messages)
      if (
        err.message?.includes('User rejected') ||
        err.message?.includes('user rejected') ||
        err.code === 4001 ||
        err.code === 'ACTION_REJECTED'
      ) {
        errorMessage = 'Transfer cancelled';
      } else if (err.message?.includes('insufficient funds')) {
        errorMessage = 'Insufficient funds to complete transfer';
      } else if (err.message?.includes('gas required exceeds allowance')) {
        errorMessage = 'Insufficient ETH for gas fees. Please add more ETH to your wallet.';
      } else if (err.message) {
        errorMessage = err.message;
      }

      setError(errorMessage);
      toast({
        title: 'Transfer Failed',
        description: errorMessage,
        variant: 'destructive',
      });

      // Don't re-throw - error is already handled and UI state will reset via finally
    } finally {
      setIsTransferring(false);
    }
  };

  return {
    transferToken,
    isTransferring,
    error,
    txHash,
  };
}
