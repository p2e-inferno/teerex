import { useState } from 'react';
import { ethers } from 'ethers';
import { useWallets } from '@privy-io/react-auth';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { getDivviBrowserProvider, getDivviEip1193Provider } from '@/lib/wallet/provider';
import { getTokenAddressAsync, getExplorerTxUrl } from '@/lib/config/network-config';
import { ExternalLink } from 'lucide-react';
import type { CryptoCurrency } from '@/types/currency';

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

        tx = await signer.sendTransaction({
          to: recipient,
          value: parsedAmount,
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

        // Execute transfer
        tx = await transferContract.transfer(recipient, parsedAmount);
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
        description: (
          <div className="flex flex-col gap-1">
            <p>Sent {amount} {tokenSymbol} to {recipient.slice(0, 6)}...{recipient.slice(-4)}.</p>
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-violet-600 hover:text-violet-700 underline flex items-center gap-1 font-medium"
            >
              View transaction <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        ),
      });

      // Invalidate balance caches
      queryClient.invalidateQueries({ queryKey: ['native-balance'] });
      queryClient.invalidateQueries({ queryKey: ['erc20-balance'] });

    } catch (err: any) {
      console.error('Transfer error:', err);

      let errorMessage = 'Failed to transfer tokens';

      if (err.message?.includes('User rejected') || err.message?.includes('user rejected')) {
        errorMessage = 'Transfer cancelled';
      } else if (err.message?.includes('insufficient funds')) {
        errorMessage = 'Insufficient funds to complete transfer';
      } else if (err.message) {
        errorMessage = err.message;
      }

      setError(errorMessage);
      toast({
        title: 'Transfer Failed',
        description: errorMessage,
        variant: 'destructive',
      });

      throw err;
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
