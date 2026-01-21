import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useMultiNetworkBalances } from '@/hooks/useMultiNetworkBalances';
import { RefreshCw, Wallet2, Coins } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TokenBalancesCardProps {
  address: string;
}

export const TokenBalancesCard: React.FC<TokenBalancesCardProps> = ({ address }) => {
  const { balancesByChain, isLoading, hasError, refetchAll } = useMultiNetworkBalances(address);

  const chainIds = Object.keys(balancesByChain).map(Number).sort();
  const [selectedChain, setSelectedChain] = useState<number>(chainIds[0] || 0);

  // Auto-select first chain when available
  React.useEffect(() => {
    if (chainIds.length > 0 && !chainIds.includes(selectedChain)) {
      setSelectedChain(chainIds[0]);
    }
  }, [chainIds, selectedChain]);

  const currentNetwork = balancesByChain[selectedChain];

  if (!address) {
    return (
      <Card className="overflow-hidden border-0 shadow-xl bg-gradient-to-b from-white to-slate-50/80 dark:from-slate-900 dark:to-slate-900/80">
        <div className="px-6 py-8 text-center">
          <Wallet2 className="h-12 w-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
          <p className="text-slate-500">Connect wallet to view balances</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="h-full overflow-hidden border-0 shadow-xl bg-gradient-to-b from-white to-slate-50/80 dark:from-slate-900 dark:to-slate-900/80 flex flex-col">
      {/* Header */}
      <div className="px-6 pt-6 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/20">
              <Coins className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-slate-900 dark:text-white">Balances</h3>
              <p className="text-sm text-slate-500 mt-0.5">Your token holdings</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={refetchAll}
            disabled={isLoading}
            className="h-9 px-3 text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      <CardContent className="px-6 pb-6 flex-1">
        {hasError && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription className="text-sm">
              Failed to load some balances. Try refreshing.
            </AlertDescription>
          </Alert>
        )}

        {/* Network Tabs */}
        {chainIds.length > 0 && (
          <div className="mb-4">
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-700">
              {chainIds.map((chainId) => {
                const network = balancesByChain[chainId];
                const isActive = selectedChain === chainId;
                return (
                  <button
                    key={chainId}
                    onClick={() => setSelectedChain(chainId)}
                    className={cn(
                      'px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all duration-200',
                      isActive
                        ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-md'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
                    )}
                  >
                    {network?.chainName || `Chain ${chainId}`}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Token List */}
        {currentNetwork ? (
          <div className="space-y-2">
            {/* Native Token */}
            <TokenRow
              symbol={currentNetwork.native.symbol}
              name={currentNetwork.native.name}
              balance={currentNetwork.native.formatted}
              isNative
              isLoading={isLoading}
            />

            {/* ERC-20 Tokens */}
            {currentNetwork.tokens.map((token) => (
              <TokenRow
                key={token.address}
                symbol={token.symbol}
                name={token.name}
                balance={token.formatted}
                isLoading={isLoading}
              />
            ))}

            {/* Empty state for tokens */}
            {currentNetwork.tokens.length === 0 && (
              <div className="py-6 text-center text-sm text-slate-400">
                No other tokens on this network
              </div>
            )}
          </div>
        ) : chainIds.length === 0 && !isLoading ? (
          <div className="py-8 text-center">
            <Coins className="h-10 w-10 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
            <p className="text-sm text-slate-500">No networks configured</p>
          </div>
        ) : null}

        {/* Loading state */}
        {isLoading && chainIds.length === 0 && (
          <div className="py-8 text-center">
            <RefreshCw className="h-8 w-8 mx-auto text-slate-300 animate-spin mb-3" />
            <p className="text-sm text-slate-500">Loading balances...</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// Token Row Component
interface TokenRowProps {
  symbol: string;
  name: string;
  balance: string;
  isNative?: boolean;
  isLoading?: boolean;
}

const TokenRow: React.FC<TokenRowProps> = ({ symbol, name, balance, isNative, isLoading }) => {
  return (
    <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50/50 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'w-10 h-10 rounded-full flex items-center justify-center',
            isNative
              ? 'bg-gradient-to-br from-amber-400 to-orange-500 shadow-md shadow-amber-500/20'
              : 'bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-600 dark:to-slate-700'
          )}
        >
          <span className="text-xs font-bold text-white">{symbol.slice(0, 2)}</span>
        </div>
        <div>
          <div className="font-medium text-slate-900 dark:text-white">{symbol}</div>
          {isNative ? (
            <div className="text-xs text-slate-400">Native token</div>
          ) : (
            <div className="text-xs text-slate-400">{name}</div>
          )}
        </div>
      </div>
      <div className="text-right">
        {isLoading ? (
          <div className="w-16 h-5 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
        ) : (
          <div className="font-semibold text-slate-900 dark:text-white tabular-nums">
            {balance}
          </div>
        )}
        <div className="text-xs text-slate-400">{symbol}</div>
      </div>
    </div>
  );
};
