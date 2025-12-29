import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RecipientInput } from './RecipientInput';
import { useTokenTransfer } from '@/hooks/useTokenTransfer';
import { useMultiNetworkBalances } from '@/hooks/useMultiNetworkBalances';
import { validateTransferAmount, getMaxTransferAmount } from '@/utils/transferValidation';
import { Loader2, Send } from 'lucide-react';
import { ethers } from 'ethers';

interface TransferTokenDialogProps {
  address: string;
  trigger?: React.ReactNode;
}

/**
 * Token option for the dropdown
 * Combines token info with network info for cross-network selection
 */
interface TokenOption {
  /** Unique key for this token (chainId-symbol) */
  key: string;
  /** Token symbol (ETH, USDC, etc.) */
  symbol: string;
  /** Chain ID where this token exists */
  chainId: number;
  /** Network name for display */
  networkName: string;
  /** User's balance in smallest unit */
  balance: bigint;
  /** Token decimals */
  decimals: number;
  /** Whether this is the native token */
  isNative: boolean;
}

export const TransferTokenDialog: React.FC<TransferTokenDialogProps> = ({
  address,
  trigger,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [recipient, setRecipient] = useState('');
  const [resolvedAddress, setResolvedAddress] = useState<string | null>(null);
  const [selectedTokenKey, setSelectedTokenKey] = useState<string>('');
  const [amount, setAmount] = useState('');

  const { transferToken, isTransferring } = useTokenTransfer();
  const { balancesByChain, isLoading: balancesLoading } = useMultiNetworkBalances(address);

  // Build flat list of all tokens across all active networks
  const tokenOptions: TokenOption[] = useMemo(() => {
    const options: TokenOption[] = [];

    Object.values(balancesByChain).forEach((network) => {
      // Add native token
      options.push({
        key: `${network.chainId}-${network.native.symbol}`,
        symbol: network.native.symbol,
        chainId: network.chainId,
        networkName: network.chainName,
        balance: network.native.balance,
        decimals: 18,
        isNative: true,
      });

      // Add ERC-20 tokens
      network.tokens.forEach((token) => {
        options.push({
          key: `${network.chainId}-${token.symbol}`,
          symbol: token.symbol,
          chainId: network.chainId,
          networkName: network.chainName,
          balance: token.balance,
          decimals: token.decimals,
          isNative: false,
        });
      });
    });

    return options;
  }, [balancesByChain]);

  // Get selected token data
  const selectedToken = tokenOptions.find((t) => t.key === selectedTokenKey);

  // Format balance for display
  const formatBalance = (balance: bigint, decimals: number): string => {
    const formatted = ethers.formatUnits(balance, decimals);
    // Show up to 6 decimal places, trimmed
    const num = parseFloat(formatted);
    if (num === 0) return '0';
    if (num < 0.000001) return '<0.000001';
    return num.toLocaleString(undefined, { maximumFractionDigits: 6 });
  };

  const handleMaxClick = () => {
    if (!selectedToken) return;
    const max = getMaxTransferAmount(selectedToken.balance, selectedToken.isNative);
    setAmount(ethers.formatUnits(max, selectedToken.decimals));
  };

  const handleSubmit = async () => {
    if (!resolvedAddress || !selectedToken || !amount) return;

    try {
      await transferToken({
        recipient: resolvedAddress,
        amount,
        tokenSymbol: selectedToken.symbol as any,
        chainId: selectedToken.chainId,
      });
      setIsOpen(false);
      resetForm();
    } catch (error) {
      // Error handled by hook
    }
  };

  const resetForm = () => {
    setRecipient('');
    setResolvedAddress(null);
    setSelectedTokenKey('');
    setAmount('');
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      resetForm();
    }
  };

  const validation = selectedToken
    ? validateTransferAmount(
        amount,
        selectedToken.balance,
        selectedToken.decimals,
        selectedToken.isNative
      )
    : null;

  const canSubmit =
    resolvedAddress &&
    selectedToken &&
    amount &&
    validation?.valid &&
    !isTransferring;

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger || (
          <Button>
            <Send className="h-4 w-4 mr-2" />
            Send Tokens
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Send Tokens</DialogTitle>
          <DialogDescription className="text-sm">
            Transfer tokens to another address or ENS name
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <RecipientInput
            value={recipient}
            onChange={setRecipient}
            onResolvedAddress={setResolvedAddress}
          />

          <div className="space-y-2">
            <Label>Token</Label>
            <Select
              value={selectedTokenKey}
              onValueChange={setSelectedTokenKey}
              disabled={balancesLoading || tokenOptions.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder={balancesLoading ? 'Loading tokens...' : 'Select token'} />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                {tokenOptions.map((token) => (
                  <SelectItem key={token.key} value={token.key}>
                    <div className="flex items-center justify-between w-full gap-4">
                      <span className="font-medium">{token.symbol}</span>
                      <span className="text-muted-foreground text-xs">
                        on {token.networkName}
                      </span>
                      <span className="text-muted-foreground text-xs ml-auto">
                        {formatBalance(token.balance, token.decimals)}
                      </span>
                    </div>
                  </SelectItem>
                ))}
                {tokenOptions.length === 0 && !balancesLoading && (
                  <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                    No tokens available
                  </div>
                )}
              </SelectContent>
            </Select>
            {selectedToken && (
              <p className="text-xs text-muted-foreground">
                Balance: {formatBalance(selectedToken.balance, selectedToken.decimals)} {selectedToken.symbol} on {selectedToken.networkName}
              </p>
            )}
          </div>

          {selectedTokenKey && (
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label>Amount</Label>
                <Button
                  variant="link"
                  size="sm"
                  onClick={handleMaxClick}
                  className="h-auto p-0 text-xs"
                >
                  Max
                </Button>
              </div>
              <Input
                type="text"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.0"
              />
              {validation && !validation.valid && (
                <p className="text-sm text-red-600">{validation.error}</p>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={() => setIsOpen(false)}
            disabled={isTransferring}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full sm:w-auto"
          >
            {isTransferring ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              'Send'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
