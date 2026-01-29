import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RecipientInput } from './RecipientInput';
import { useTokenTransfer } from '@/hooks/useTokenTransfer';
import { useMultiNetworkBalances } from '@/hooks/useMultiNetworkBalances';
import { validateTransferAmount, getMaxTransferAmount } from '@/utils/transferValidation';
import { Loader2, Send, ChevronDown, Check, Coins } from 'lucide-react';
import { ethers } from 'ethers';
import { cn } from '@/lib/utils';

interface TransferTokenCardProps {
  address: string;
  chainId?: number;
}

interface TokenOption {
  key: string;
  symbol: string;
  chainId: number;
  networkName: string;
  balance: bigint;
  decimals: number;
  isNative: boolean;
}

interface GroupedTokens {
  networkName: string;
  chainId: number;
  tokens: TokenOption[];
}

export const TransferTokenCard: React.FC<TransferTokenCardProps> = ({ address, chainId }) => {
  const [recipient, setRecipient] = useState('');
  const [resolvedAddress, setResolvedAddress] = useState<string | null>(null);
  const [selectedTokenKey, setSelectedTokenKey] = useState<string>('');
  const [amount, setAmount] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState<'bottom' | 'top'>('bottom');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const { transferToken, isTransferring } = useTokenTransfer();
  const { balancesByChain, isLoading: balancesLoading } = useMultiNetworkBalances(address, chainId);

  // Calculate dropdown position to ensure spacing from viewport edges
  useEffect(() => {
    if (isDropdownOpen && buttonRef.current) {
      const buttonRect = buttonRef.current.getBoundingClientRect();
      const maxDropdownHeight = 320; // max height we want
      const viewportHeight = window.innerHeight;
      const minMargin = 20; // Minimum margin from viewport edge

      const spaceBelow = viewportHeight - buttonRect.bottom - minMargin - 8; // 8px for mt-2
      const spaceAbove = buttonRect.top - minMargin - 8; // 8px for mb-2

      // Check if there's enough space below (with margin)
      if (spaceBelow < Math.min(maxDropdownHeight, 200) && spaceAbove > spaceBelow) {
        setDropdownPosition('top');
      } else {
        setDropdownPosition('bottom');
      }
    }
  }, [isDropdownOpen]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside, true);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
    };
  }, [isDropdownOpen]);

  // Build grouped tokens by network
  const groupedTokens: GroupedTokens[] = useMemo(() => {
    const groups: GroupedTokens[] = [];

    Object.values(balancesByChain).forEach((network) => {
      const tokens: TokenOption[] = [];

      // Add native token
      tokens.push({
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
        tokens.push({
          key: `${network.chainId}-${token.symbol}`,
          symbol: token.symbol,
          chainId: network.chainId,
          networkName: network.chainName,
          balance: token.balance,
          decimals: token.decimals,
          isNative: false,
        });
      });

      groups.push({
        networkName: network.chainName,
        chainId: network.chainId,
        tokens,
      });
    });

    return groups;
  }, [balancesByChain]);

  // Flat list for lookup
  const allTokens = useMemo(() => groupedTokens.flatMap((g) => g.tokens), [groupedTokens]);
  const selectedToken = allTokens.find((t) => t.key === selectedTokenKey);

  // Format balance for display
  const formatBalance = (balance: bigint, decimals: number): string => {
    const formatted = ethers.formatUnits(balance, decimals);
    const num = parseFloat(formatted);
    if (num === 0) return '0';
    if (num < 0.0001) return '<0.0001';
    return num.toLocaleString(undefined, { maximumFractionDigits: 4 });
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
      // Reset form on success
      setRecipient('');
      setResolvedAddress(null);
      setSelectedTokenKey('');
      setAmount('');
    } catch (error) {
      // Error handled by hook
    }
  };

  const handleTokenSelect = (tokenKey: string) => {
    setSelectedTokenKey(tokenKey);
    setIsDropdownOpen(false);
  };

  const validation = selectedToken
    ? validateTransferAmount(amount, selectedToken.balance, selectedToken.decimals, selectedToken.isNative)
    : null;

  const canSubmit = resolvedAddress && selectedToken && amount && validation?.valid && !isTransferring;

  return (
    <Card className="h-full border-0 shadow-xl bg-gradient-to-b from-white to-slate-50/80 dark:from-slate-900 dark:to-slate-900/80 flex flex-col rounded-2xl">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg shadow-violet-500/20">
            <Send className="h-5 w-5 text-white" />
          </div>
          <div>
            <CardTitle className="text-xl font-semibold">Send Tokens</CardTitle>
            <CardDescription className="text-sm mt-0.5">
              Transfer to any address or ENS name
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col">
        <div className="space-y-5 flex-1">
          {/* Recipient Input */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">To</Label>
            <RecipientInput
              value={recipient}
              onChange={setRecipient}
              onResolvedAddress={setResolvedAddress}
            />
          </div>

          {/* Token Selection - Custom Grouped Dropdown */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Token</Label>
            <div className="relative" ref={dropdownRef}>
              <button
                ref={buttonRef}
                type="button"
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                disabled={balancesLoading || allTokens.length === 0}
                className={cn(
                  'w-full flex items-center justify-between px-4 py-3 rounded-xl border bg-white dark:bg-slate-800 transition-all duration-200',
                  'hover:border-violet-300 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400',
                  isDropdownOpen && 'ring-2 ring-violet-500/20 border-violet-400',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                {selectedToken ? (
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-600 flex items-center justify-center">
                      <Coins className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                    </div>
                    <div className="text-left">
                      <div className="font-medium text-slate-900 dark:text-white">{selectedToken.symbol}</div>
                      <div className="text-xs text-slate-500">{selectedToken.networkName}</div>
                    </div>
                  </div>
                ) : (
                  <span className="text-slate-400">
                    {balancesLoading ? 'Loading...' : 'Select a token'}
                  </span>
                )}
                <ChevronDown className={cn('w-5 h-5 text-slate-400 transition-transform duration-200', isDropdownOpen && 'rotate-180')} />
              </button>

              {/* Dropdown Menu */}
              {isDropdownOpen && (
                <div
                  className={cn(
                    'absolute z-30 w-full py-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xl overflow-y-auto',
                    'max-h-[min(320px,calc(100vh-40px))]',
                    dropdownPosition === 'bottom' ? 'mt-2 top-full' : 'mb-2 bottom-full'
                  )}
                >
                  {groupedTokens.map((group) => (
                    <div key={group.chainId}>
                      {/* Network Header */}
                      <div className="px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider bg-slate-50 dark:bg-slate-800/50 sticky top-0">
                        {group.networkName}
                      </div>
                      {/* Tokens in this network */}
                      {group.tokens.map((token) => (
                        <button
                          key={token.key}
                          type="button"
                          onClick={() => handleTokenSelect(token.key)}
                          className={cn(
                            'w-full flex items-center justify-between px-4 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors min-h-[68px]',
                            selectedTokenKey === token.key && 'bg-violet-50 dark:bg-violet-900/20'
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-600 flex items-center justify-center flex-shrink-0">
                              <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                                {token.symbol.slice(0, 2)}
                              </span>
                            </div>
                            <div className="text-left flex-1 min-w-0">
                              <div className="font-medium text-slate-900 dark:text-white text-sm">{token.symbol}</div>
                              <div className="text-xs text-slate-500 mt-0.5">
                                {formatBalance(token.balance, token.decimals)} available
                              </div>
                            </div>
                          </div>
                          {selectedTokenKey === token.key && (
                            <Check className="w-4 h-4 text-violet-500 flex-shrink-0" />
                          )}
                        </button>
                      ))}
                    </div>
                  ))}
                  {allTokens.length === 0 && !balancesLoading && (
                    <div className="px-4 py-8 text-center text-sm text-slate-400">
                      No tokens available
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Selected Token Balance */}
            {selectedToken && (
              <div className="flex items-center justify-between px-1 text-xs text-slate-500">
                <span>Available balance</span>
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  {formatBalance(selectedToken.balance, selectedToken.decimals)} {selectedToken.symbol}
                </span>
              </div>
            )}
          </div>

          {/* Amount Input */}
          {selectedToken && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Amount</Label>
                <button
                  type="button"
                  onClick={handleMaxClick}
                  className="text-xs font-medium text-violet-600 hover:text-violet-700 dark:text-violet-400 transition-colors"
                >
                  Use Max
                </button>
              </div>
              <div className="relative">
                <Input
                  type="text"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className={cn(
                    'pr-16 h-12 text-lg font-medium rounded-xl border-slate-200 dark:border-slate-700',
                    'focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400',
                    validation && !validation.valid && 'border-red-300 focus:border-red-400 focus:ring-red-500/20'
                  )}
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-400">
                  {selectedToken.symbol}
                </div>
              </div>
              {validation && !validation.valid && (
                <p className="text-xs text-red-500 px-1">{validation.error}</p>
              )}
            </div>
          )}
        </div>

        {/* Submit Button */}
        <Button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className={cn(
            'w-full h-12 text-base font-medium rounded-xl transition-all duration-200 mt-5',
            'bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700',
            'shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40',
            'disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed'
          )}
        >
          {isTransferring ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <>
              <Send className="w-4 h-4 mr-2" />
              Send {selectedToken?.symbol || 'Tokens'}
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
};
