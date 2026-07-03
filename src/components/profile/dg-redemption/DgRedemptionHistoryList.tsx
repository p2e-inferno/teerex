import React from 'react';
import { Bell, Copy, ExternalLink, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { getExplorerTxUrl } from '@/lib/config/network-config';
import {
  canCancelRedemption,
  canRequestExpiredReview,
  canResumeRedemption,
  formatDgAmount,
  formatReceiveAmount,
  formatStatus,
  payoutMethodOf,
  shortAddress,
  statusVariant,
  type RedemptionPagination,
  type RedemptionStatus,
} from './types';

interface DgRedemptionHistoryListProps {
  items: RedemptionStatus[];
  pagination: RedemptionPagination;
  isLoading: boolean;
  isPageLoading: boolean;
  chainId: number;
  onRefresh: () => void;
  onLoadMore: () => void;
  onResume: (item: RedemptionStatus) => void;
  onRequestExpiredReview: (item: RedemptionStatus) => void;
  onRequestCancel: (intentId: string) => void;
  notifyAdmin: (intentId: string) => void;
  notifyingIntentId: string | null;
  getNotifyCooldownMs: (intentId?: string | null) => number;
  notifyButtonContent: (intentId?: string | null) => string;
  isCancelling: boolean;
  cancelIntentId: string | null;
}

export const DgRedemptionHistoryList: React.FC<DgRedemptionHistoryListProps> = ({
  items,
  pagination,
  isLoading,
  isPageLoading,
  chainId,
  onRefresh,
  onLoadMore,
  onResume,
  onRequestExpiredReview,
  onRequestCancel,
  notifyAdmin,
  notifyingIntentId,
  getNotifyCooldownMs,
  notifyButtonContent,
  isCancelling,
  cancelIntentId,
}) => {
  const copyText = async (label: string, value?: string | null) => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  };

  const openTxExplorer = async (item: RedemptionStatus, txHash?: string | null) => {
    if (!txHash) return;
    try {
      const url = await getExplorerTxUrl(item.chain_id || chainId, txHash);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      console.error('Failed to open Redeem DG transaction explorer:', error);
      toast.error('Could not open transaction in block explorer');
    }
  };

  const txChip = (item: RedemptionStatus, label: string, txHash?: string | null) => (
    txHash ? (
      <span className="inline-flex min-w-0 items-center gap-1 rounded-md bg-muted/50 px-2 py-1">
        <span>{label}</span>
        <button
          type="button"
          className="font-mono text-foreground hover:underline"
          onClick={() => openTxExplorer(item, txHash)}
        >
          {shortAddress(txHash)}
        </button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-6 w-6 text-muted-foreground"
          onClick={() => copyText(`${label} transaction hash`, txHash)}
          title={`Copy ${label.toLowerCase()} transaction hash`}
        >
          <Copy className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-6 w-6 text-muted-foreground"
          onClick={() => openTxExplorer(item, txHash)}
          title={`View ${label.toLowerCase()} transaction on block explorer`}
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </Button>
      </span>
    ) : null
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <Label>Recent Redeem DG requests</Label>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onRefresh}
          disabled={isLoading || isPageLoading}
        >
          {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Refresh
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No Redeem DG requests yet.</p>
      ) : (
        <div className="space-y-3">
          <div className="max-h-[360px] overflow-y-auto pr-1">
            <div className="space-y-2">
              {items.map((item) => (
                <div key={item.id} className="flex flex-col gap-3 rounded-md border p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                      <div>
                        <span className="text-xs text-muted-foreground">Receive</span>
                        <span className="ml-2 font-semibold">{formatReceiveAmount(item)}</span>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground">Redeem</span>
                        <span className="ml-2 font-medium">{formatDgAmount(item.amount_dg)}</span>
                      </div>
                      <Badge variant="outline" className="text-[10px] uppercase">
                        {payoutMethodOf(item) === 'usdc' ? 'Crypto' : 'Fiat'}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>{item.created_at ? new Date(item.created_at).toLocaleString() : 'Recently'}</span>
                      {txChip(item, 'Tx', item.tx_hash)}
                      {payoutMethodOf(item) === 'usdc' && txChip(item, 'Payout', item.payout_tx_hash)}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                    <Badge variant={statusVariant(item.status)}>{formatStatus(item.status)}</Badge>
                    {canResumeRedemption(item) && (
                      <Button type="button" size="sm" variant="outline" onClick={() => onResume(item)}>
                        Resume
                      </Button>
                    )}
                    {canRequestExpiredReview(item) && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => onRequestExpiredReview(item)}
                      >
                        <Bell className="mr-2 h-4 w-4" />
                        Request Review
                      </Button>
                    )}
                    {item.status === 'manual_review' && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => notifyAdmin(item.id)}
                        disabled={notifyingIntentId === item.id || getNotifyCooldownMs(item.id) > 0}
                      >
                        {notifyingIntentId === item.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bell className="mr-2 h-4 w-4" />}
                        {notifyButtonContent(item.id)}
                      </Button>
                    )}
                    {canCancelRedemption(item) && (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive flex items-center justify-center"
                        onClick={() => onRequestCancel(item.id)}
                        disabled={isCancelling}
                        title="Delete request"
                      >
                        {isCancelling && cancelIntentId === item.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
          {(pagination.total > items.length || pagination.has_more) && (
            <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>{items.length} of {pagination.total} shown</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onLoadMore}
                disabled={isLoading || isPageLoading}
              >
                {isPageLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Load More
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
