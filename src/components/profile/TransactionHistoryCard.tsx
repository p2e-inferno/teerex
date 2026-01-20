import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { TransactionRow } from './TransactionRow';
import { useTransactionHistory } from '@/hooks/useTransactionHistory';
import { History, RefreshCw, Loader2, AlertCircle, Inbox } from 'lucide-react';

interface TransactionHistoryCardProps {
  address: string;
}

/**
 * Transaction history card with infinite scroll pagination
 * Shows both sent and received transfers across all active networks
 */
export const TransactionHistoryCard: React.FC<TransactionHistoryCardProps> = ({ address }) => {
  const {
    transactions,
    isLoading,
    isLoadingMore,
    hasMore,
    error,
    refetch,
    loadMoreRef,
  } = useTransactionHistory(address);

  const handleRefresh = () => {
    refetch();
  };

  // Loading state - show skeleton placeholders
  if (isLoading) {
    return (
      <Card className="border-0 shadow-lg bg-gradient-to-b from-white to-slate-50/80 dark:from-slate-900 dark:to-slate-900/80 rounded-2xl">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/20">
                <History className="h-5 w-5 text-white" />
              </div>
              <div>
                <CardTitle className="text-xl font-semibold">Transfer History</CardTitle>
                <CardDescription className="text-sm mt-0.5">
                  Your recent transfers across all networks
                </CardDescription>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-start gap-3 p-3 sm:p-4">
                <Skeleton className="w-10 h-10 rounded-xl flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="flex justify-between">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                  <Skeleton className="h-3 w-48" />
                  <Skeleton className="h-6 w-40" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Error state - show error message with retry button
  if (error) {
    return (
      <Card className="border-0 shadow-lg bg-gradient-to-b from-white to-slate-50/80 dark:from-slate-900 dark:to-slate-900/80 rounded-2xl">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/20">
                <History className="h-5 w-5 text-white" />
              </div>
              <div>
                <CardTitle className="text-xl font-semibold">Transfer History</CardTitle>
                <CardDescription className="text-sm mt-0.5">
                  Your recent transfers across all networks
                </CardDescription>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              className="h-8 w-8 p-0"
              aria-label="Refresh transactions"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          <Alert variant="destructive" className="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="ml-2">
              <div className="space-y-2">
                <p className="font-medium">Failed to load transaction history</p>
                <p className="text-sm text-red-600 dark:text-red-400">
                  {error.message || 'An error occurred while fetching transactions'}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefresh}
                  className="mt-2 h-8 text-xs"
                >
                  Try Again
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  // Empty state - no transactions yet
  if (transactions.length === 0) {
    return (
      <Card className="border-0 shadow-lg bg-gradient-to-b from-white to-slate-50/80 dark:from-slate-900 dark:to-slate-900/80 rounded-2xl">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/20">
                <History className="h-5 w-5 text-white" />
              </div>
              <div>
                <CardTitle className="text-xl font-semibold">Transfer History</CardTitle>
                <CardDescription className="text-sm mt-0.5">
                  Your recent transfers across all networks
                </CardDescription>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              className="h-8 w-8 p-0"
              aria-label="Refresh transactions"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          <div className="py-12 text-center">
            <div className="flex justify-center mb-4">
              <div className="p-4 rounded-2xl bg-slate-100 dark:bg-slate-800">
                <Inbox className="h-8 w-8 text-slate-400" />
              </div>
            </div>
            <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">
              No Transactions Yet
            </h3>
            <p className="text-sm text-slate-500 max-w-sm mx-auto">
              Your transaction history will appear here once you send or receive tokens.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Success state - show transactions with infinite scroll
  return (
    <Card className="border-0 shadow-lg bg-gradient-to-b from-white to-slate-50/80 dark:from-slate-900 dark:to-slate-900/80 rounded-2xl">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/20">
              <History className="h-5 w-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-xl font-semibold">Transfer History</CardTitle>
              <CardDescription className="text-sm mt-0.5">
                {transactions.length} transaction{transactions.length !== 1 ? 's' : ''} found
              </CardDescription>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            className="h-8 w-8 p-0"
            aria-label="Refresh transactions"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {/* Scrollable transaction list */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="max-h-[500px] sm:max-h-[600px] overflow-y-auto">
            {transactions.map((tx) => (
              <TransactionRow key={`${tx.hash}-${tx.tokenAddress}`} transaction={tx} />
            ))}

            {/* Intersection Observer Sentinel */}
            <div ref={loadMoreRef} className="h-4" />

            {/* Loading more indicator */}
            {isLoadingMore && (
              <div className="py-4 flex items-center justify-center border-t border-slate-100 dark:border-slate-800">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400 mr-2" />
                <span className="text-sm text-slate-500">Loading more...</span>
              </div>
            )}

            {/* End of history message */}
            {!hasMore && !isLoadingMore && transactions.length > 0 && (
              <div className="py-4 text-center border-t border-slate-100 dark:border-slate-800">
                <p className="text-xs text-slate-400">End of transaction history</p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
