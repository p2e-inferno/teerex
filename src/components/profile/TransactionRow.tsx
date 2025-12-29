import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowUpRight, ArrowDownLeft, ExternalLink, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import type { TransactionRecord } from '@/hooks/useTransactionHistory';

interface TransactionRowProps {
  transaction: TransactionRecord;
}

/**
 * Formats timestamp to relative time (e.g., "5m", "2h", "3d")
 */
function formatRelativeTime(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;

  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  if (diff < 2592000) return `${Math.floor(diff / 604800)}w`;
  return new Date(timestamp * 1000).toLocaleDateString();
}

/**
 * Truncates address for display (0x1234...5678)
 */
function truncateAddress(address: string, startChars = 6, endChars = 4): string {
  if (address.length <= startChars + endChars) return address;
  return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
}

/**
 * Formats transaction value for display
 */
function formatValue(value: string, tokenSymbol: string): string {
  const num = parseFloat(value);
  if (num === 0) return `0 ${tokenSymbol}`;
  if (num < 0.0001) return `<0.0001 ${tokenSymbol}`;

  // Show up to 4 decimals, but remove trailing zeros
  const formatted = num.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4
  });
  return `${formatted} ${tokenSymbol}`;
}

/**
 * Mobile-first transaction row component
 * Displays transaction details with direction indicator, amount, network, and explorer link
 */
export const TransactionRow: React.FC<TransactionRowProps> = ({ transaction }) => {
  const { toast } = useToast();
  const [copied, setCopied] = React.useState(false);

  const isSent = transaction.direction === 'sent';
  const otherAddress = isSent ? transaction.to : transaction.from;

  const handleCopyHash = async () => {
    try {
      await navigator.clipboard.writeText(transaction.hash);
      setCopied(true);
      toast({
        title: 'Copied',
        description: 'Transaction hash copied to clipboard',
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast({
        title: 'Copy Failed',
        description: 'Could not copy transaction hash',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="p-3 sm:p-4 border-b border-slate-100 dark:border-slate-800 last:border-b-0 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
      <div className="flex items-start gap-3">
        {/* Direction Icon */}
        <div
          className={cn(
            'flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center shadow-sm',
            isSent
              ? 'bg-gradient-to-br from-orange-100 to-red-100 dark:from-orange-900/30 dark:to-red-900/30'
              : 'bg-gradient-to-br from-green-100 to-emerald-100 dark:from-green-900/30 dark:to-emerald-900/30'
          )}
        >
          {isSent ? (
            <ArrowUpRight className="w-5 h-5 text-red-600 dark:text-red-400" />
          ) : (
            <ArrowDownLeft className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          )}
        </div>

        {/* Transaction Details */}
        <div className="flex-1 min-w-0 space-y-2">
          {/* Top Row: Amount + Time + Network */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div
                className={cn(
                  'text-base sm:text-lg font-semibold truncate',
                  isSent
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-emerald-600 dark:text-emerald-400'
                )}
              >
                {isSent ? '- ' : '+ '}
                {formatValue(transaction.value, transaction.tokenSymbol)}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                {isSent ? 'Sent to' : 'Received from'}{' '}
                <span className="font-mono">{truncateAddress(otherAddress)}</span>
              </div>
            </div>

            <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
              <span className="text-xs text-slate-400">
                {formatRelativeTime(transaction.timestamp)}
              </span>
              <Badge
                variant="secondary"
                className="text-xs px-2 py-0.5 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
              >
                {transaction.chainName}
              </Badge>
            </div>
          </div>

          {/* Bottom Row: Hash + Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800/50 flex-shrink-0">
              <span className="text-xs font-mono text-slate-600 dark:text-slate-400">
                {truncateAddress(transaction.hash, 8, 6)}
              </span>
              <button
                onClick={handleCopyHash}
                className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors touch-manipulation"
                aria-label="Copy transaction hash"
              >
                {copied ? (
                  <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <Copy className="w-3 h-3 text-slate-500" />
                )}
              </button>
            </div>

            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300"
              onClick={() => window.open(transaction.explorerUrl, '_blank', 'noopener,noreferrer')}
            >
              <ExternalLink className="w-3 h-3 mr-1" />
              Explorer
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
