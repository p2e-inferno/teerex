import React, { useCallback, useEffect, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { Bell, CheckCircle2, Clock, Copy, ExternalLink, Gift, Loader2, RefreshCw, Send, Trash2, Info } from 'lucide-react';
import { toast } from 'sonner';
import { callEdgeFunction } from '@/lib/edgeFunctions';
import { useUserPayoutAccount } from '@/hooks/useUserPayoutAccount';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { formatNairaFromKobo } from '@/lib/currency';
import { getExplorerTxUrl } from '@/lib/config/network-config';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface DgRedemptionCardProps {
  address: string;
  chainId: number;
}

interface RedemptionQuote {
  intent_id?: string | null;
  expires_at?: string | null;
  chain_id?: number;
  redemption_wallet_address?: string;
  amount_dg: string;
  amount_dg_raw?: string;
  gross_value_kobo: number;
  estimated_receive_kobo: number;
  service_fee_kobo: number;
  vendor_fee_kobo: number;
  vat_kobo: number;
  total_fee_kobo: number;
  required_confirmations?: number;
}

interface RedemptionStatus {
  id: string;
  status: string;
  chain_id?: number;
  redemption_wallet_address?: string;
  amount_dg?: string;
  amount_dg_raw?: string;
  gross_value_kobo?: number;
  service_fee_kobo?: number;
  vendor_fee_kobo?: number;
  vat_kobo?: number;
  total_fee_kobo?: number;
  estimated_receive_kobo: number;
  required_confirmations?: number;
  last_error?: string | null;
  next_admin_notify_at?: string | null;
  tx_hash?: string | null;
  expires_at?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

interface RedemptionLimits {
  min_dg: string;
  max_dg: string;
}

interface RedemptionPagination {
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

const RECENT_REDEMPTIONS_PAGE_SIZE = 5;

const shortAddress = (value: string) => `${value.slice(0, 6)}...${value.slice(-4)}`;

const formatCountdown = (expiresAt?: string) => {
  if (!expiresAt) return '00:00';
  const ms = Math.max(new Date(expiresAt).getTime() - Date.now(), 0);
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const formatStatus = (value: string) => {
  const labels: Record<string, string> = {
    payout_pending: 'Payout pending',
    payout_processing: 'Payout processing',
    completed: 'Paid',
    failed: 'Payout failed',
    manual_review: 'Under admin review',
    expired: 'Expired',
  };
  return labels[value] || value.replace(/_/g, ' ');
};

const sanitizeDgAmount = (value: string) => {
  const stripped = value.replace(/[^\d.]/g, '');
  const [whole, ...decimalParts] = stripped.split('.');
  return decimalParts.length > 0 ? `${whole}.${decimalParts.join('')}` : whole;
};

const amountNumber = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

const formatDgLimit = (value: string) => `${value} DG`;

const formatDgAmount = (value?: string) => {
  const normalized = String(value || '').trim();
  if (!normalized) return 'DG amount unavailable';
  return `${normalized.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')} DG`;
};

const statusHelp = (value: string) => {
  if (value === 'manual_review') return 'We received your DG transfer, but the payout needs admin review before it can continue.';
  if (value === 'payout_pending' || value === 'payout_processing') return 'Your payout has been sent to Paystack and is waiting for confirmation.';
  if (value === 'completed') return 'Paystack has confirmed the payout.';
  if (value === 'failed') return 'Support can review and retry this payout.';
  return null;
};

const formatUserReviewMessage = (error?: string | null) => {
  const labels: Record<string, string> = {
    paystack_otp_required: 'Pending admin approval.',
    paystack_transfer_failed: 'The payout needs admin review before it can continue.',
    paystack_transfer_reversed: 'The payout needs admin review before it can continue.',
    paystack_transfer_not_found: 'The payout needs admin review before it can continue.',
    paystack_transfer_abandoned: 'The payout needs admin review before it can continue.',
    paystack_transfer_rejected: 'The payout needs admin review before it can continue.',
    paystack_transfer_blocked: 'The payout needs admin review before it can continue.',
    manual_review_required: 'Pending admin review.',
    expired_quote_transfer_submitted: 'We received your expired quote transfer and sent it for admin review.',
  };
  return error ? labels[error] || 'Pending admin review.' : null;
};

const statusVariant = (status: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
  if (status === 'completed') return 'default';
  if (['failed', 'expired', 'cancelled'].includes(status)) return 'destructive';
  if (['manual_review', 'payout_processing', 'payout_pending'].includes(status)) return 'secondary';
  return 'outline';
};

const canSubmitTransferForStatus = (value: string | null) => !value || value === 'awaiting_transfer';

const unavailableQuoteButtonLabel = (data: { error?: string; max_redeemable?: { reason?: string } }) => {
  if (data.max_redeemable?.reason === 'wallet_balance' || data.error?.toLowerCase().includes('dg balance')) {
    return 'Insufficient DG Balance';
  }
  return 'Quote Unavailable';
};

export const DgRedemptionCard: React.FC<DgRedemptionCardProps> = ({ address, chainId }) => {
  const { getAccessToken } = usePrivy();
  const { payoutAccount, isLoading: isBankLoading } = useUserPayoutAccount();
  const [amount, setAmount] = useState('');
  const [preview, setPreview] = useState<RedemptionQuote | null>(null);
  const [previewCanRedeem, setPreviewCanRedeem] = useState(true);
  const [quoteButtonLabel, setQuoteButtonLabel] = useState<string | null>(null);
  const [quote, setQuote] = useState<RedemptionQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [maxRedeemable, setMaxRedeemable] = useState<string | null>(null);
  const [txHash, setTxHash] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [redemptionStatus, setRedemptionStatus] = useState<RedemptionStatus | null>(null);
  const [recentRedemptions, setRecentRedemptions] = useState<RedemptionStatus[]>([]);
  const [recentPagination, setRecentPagination] = useState<RedemptionPagination>({
    total: 0,
    limit: RECENT_REDEMPTIONS_PAGE_SIZE,
    offset: 0,
    has_more: false,
  });
  const [limits, setLimits] = useState<RedemptionLimits | null>(null);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [isHistoryPageLoading, setIsHistoryPageLoading] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isQuoting, setIsQuoting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRequestingExpiredReview, setIsRequestingExpiredReview] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [notifyingIntentId, setNotifyingIntentId] = useState<string | null>(null);
  const [notifyCooldowns, setNotifyCooldowns] = useState<Record<string, string>>({});
  const [cancelIntentId, setCancelIntentId] = useState<string | null>(null);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [expiredReviewTarget, setExpiredReviewTarget] = useState<RedemptionStatus | null>(null);
  const [expiredReviewTxHash, setExpiredReviewTxHash] = useState('');
  const [, setNowTick] = useState(0);

  useEffect(() => {
    if (!quote) return;
    const id = window.setInterval(() => setNowTick((value) => value + 1), 1000);
    return () => window.clearInterval(id);
  }, [quote]);

  useEffect(() => {
    if (Object.keys(notifyCooldowns).length === 0) return;
    const id = window.setInterval(() => {
      setNowTick((value) => value + 1);
      setNotifyCooldowns((current) => {
        const active = Object.fromEntries(
          Object.entries(current).filter(([, nextNotifyAt]) => new Date(nextNotifyAt).getTime() > Date.now())
        );
        return Object.keys(active).length === Object.keys(current).length ? current : active;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [notifyCooldowns]);

  const rememberNotifyCooldowns = useCallback((redemptions: RedemptionStatus[] | null | undefined) => {
    const entries = (redemptions || [])
      .filter((redemption) =>
        redemption.next_admin_notify_at &&
        new Date(redemption.next_admin_notify_at).getTime() > Date.now()
      )
      .map((redemption) => [redemption.id, redemption.next_admin_notify_at as string]);
    if (entries.length === 0) return;
    setNotifyCooldowns((current) => ({ ...current, ...Object.fromEntries(entries) }));
  }, []);

  const refreshStatus = useCallback(async () => {
    if (!quote?.intent_id) return;
    const token = await getAccessToken();
    const data = await callEdgeFunction<any>('get-dg-redemption-status', {
      intent_id: quote.intent_id,
    }, {
      privyToken: token,
      withAnonKey: true,
    });
    setRedemptionStatus(data.redemption);
    setStatus(data.redemption?.status || null);
    rememberNotifyCooldowns(data.redemption ? [data.redemption] : []);
  }, [getAccessToken, quote?.intent_id, rememberNotifyCooldowns]);

  const loadHistory = useCallback(async (options?: { offset?: number; append?: boolean }) => {
    const offset = Math.max(options?.offset || 0, 0);
    const append = Boolean(options?.append);
    if (append) {
      setIsHistoryPageLoading(true);
    } else {
      setIsHistoryLoading(true);
    }
    try {
      const token = await getAccessToken();
      const params = new URLSearchParams({
        limit: String(RECENT_REDEMPTIONS_PAGE_SIZE),
        offset: String(offset),
      });
      const data = await callEdgeFunction<any>(`list-user-dg-redemptions?${params.toString()}`, {}, {
        privyToken: token,
        withAnonKey: true,
        method: 'GET',
      });
      const redemptions = data.redemptions || [];
      setRecentRedemptions((current) => {
        if (!append) return redemptions;
        const existingIds = new Set(current.map((item) => item.id));
        return [...current, ...redemptions.filter((item: RedemptionStatus) => !existingIds.has(item.id))];
      });
      setRecentPagination(data.pagination || {
        total: redemptions.length,
        limit: RECENT_REDEMPTIONS_PAGE_SIZE,
        offset,
        has_more: false,
      });
      setLimits(data.limits || null);
      rememberNotifyCooldowns(redemptions);
    } finally {
      setIsHistoryLoading(false);
      setIsHistoryPageLoading(false);
    }
  }, [getAccessToken, rememberNotifyCooldowns]);

  useEffect(() => {
    loadHistory().catch((error) => {
      console.error('Failed to load Redeem DG history:', error);
    });
  }, [loadHistory]);

  useEffect(() => {
    if (!quote?.intent_id || !status) return;
    if (['completed', 'failed', 'expired', 'cancelled', 'manual_review'].includes(status)) return;
    const id = window.setInterval(() => {
      refreshStatus().catch((error) => {
        console.error('Failed to refresh Redeem DG status:', error);
      });
    }, 5000);
    return () => window.clearInterval(id);
  }, [quote?.intent_id, refreshStatus, status]);

  const expired = quote?.expires_at ? new Date(quote.expires_at).getTime() <= Date.now() : false;
  const parsedAmount = amountNumber(amount);
  const minDg = limits ? amountNumber(limits.min_dg) : Number.NaN;
  const maxDg = limits ? amountNumber(limits.max_dg) : Number.NaN;
  const amountValidationMessage = (() => {
    if (!amount) return null;
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return 'Enter a DG amount';
    if (Number.isFinite(minDg) && parsedAmount < minDg) {
      return `Minimum Redeem DG amount is ${formatDgLimit(limits?.min_dg || '')}`;
    }
    if (Number.isFinite(maxDg) && maxDg > 0 && parsedAmount > maxDg) {
      return `Maximum Redeem DG amount is ${formatDgLimit(limits?.max_dg || '')}`;
    }
    return null;
  })();
  const isAmountValid = Boolean(amount) && Boolean(limits) && !amountValidationMessage;
  const limitsText = limits ? `${formatDgLimit(limits.min_dg)} minimum, ${formatDgLimit(limits.max_dg)} maximum` : null;

  const getPreview = async () => {
    setPreview(null);
    setPreviewCanRedeem(true);
    setQuoteButtonLabel(null);
    setQuote(null);
    setStatus(null);
    setRedemptionStatus(null);
    setQuoteError(null);
    setMaxRedeemable(null);
    if (!payoutAccount) {
      document.getElementById('bank-details')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      toast.error('Save bank details before redeeming DG');
      return;
    }
    if (!limits) {
      toast.error('Redeem DG limits are still loading');
      return;
    }
    if (amountValidationMessage || !isAmountValid) {
      toast.error(amountValidationMessage || 'Enter a DG amount');
      return;
    }
    setIsPreviewing(true);
    try {
      const token = await getAccessToken();
      const data = await callEdgeFunction<any>('quote-dg-redemption', {
        amount_dg: amount,
        chain_id: chainId,
        wallet_address: address,
        preview_only: true,
      }, {
        privyToken: token,
        withAnonKey: true,
      });

      if (data.can_redeem === false) {
        if (data.quote) {
          setPreview(data.quote);
        }
        setPreviewCanRedeem(false);
        setQuoteButtonLabel(unavailableQuoteButtonLabel(data));
        setQuoteError(data.error || 'Redeem DG is not available for this amount');
        if (data.max_redeemable?.amount_dg) {
          setMaxRedeemable(`${data.max_redeemable.amount_dg} DG`);
        } else if (data.max_redeemable?.net_payout_kobo) {
          setMaxRedeemable(formatNairaFromKobo(data.max_redeemable.net_payout_kobo));
        } else if (data.max_redeemable?.gross_value_kobo !== undefined) {
          setMaxRedeemable(formatNairaFromKobo(data.max_redeemable.gross_value_kobo));
        }
        return;
      }

      setPreview(data.quote);
      setPreviewCanRedeem(true);
      setQuoteButtonLabel(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to calculate Redeem DG preview');
    } finally {
      setIsPreviewing(false);
    }
  };

  const getQuote = async () => {
    setQuote(null);
    setStatus(null);
    setRedemptionStatus(null);
    setQuoteError(null);
    setMaxRedeemable(null);
    setQuoteButtonLabel(null);
    if (!payoutAccount) {
      document.getElementById('bank-details')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      toast.error('Save bank details before redeeming DG');
      return;
    }
    if (!limits) {
      toast.error('Redeem DG limits are still loading');
      return;
    }
    if (amountValidationMessage || !isAmountValid) {
      toast.error(amountValidationMessage || 'Enter a DG amount');
      return;
    }
    setIsQuoting(true);
    try {
      const token = await getAccessToken();
      const data = await callEdgeFunction<any>('quote-dg-redemption', {
        amount_dg: amount,
        chain_id: chainId,
        wallet_address: address,
        preview_only: false,
      }, {
        privyToken: token,
        withAnonKey: true,
      });

      if (data.can_redeem === false) {
        if (data.quote) {
          setPreview(data.quote);
        }
        setPreviewCanRedeem(false);
        setQuoteButtonLabel(unavailableQuoteButtonLabel(data));
        setQuoteError(data.error || 'Redeem DG is not available for this amount');
        if (data.max_redeemable?.amount_dg) {
          setMaxRedeemable(`${data.max_redeemable.amount_dg} DG`);
        } else if (data.max_redeemable?.net_payout_kobo) {
          setMaxRedeemable(formatNairaFromKobo(data.max_redeemable.net_payout_kobo));
        } else if (data.max_redeemable?.gross_value_kobo !== undefined) {
          setMaxRedeemable(formatNairaFromKobo(data.max_redeemable.gross_value_kobo));
        }
        return;
      }

      setQuote(data.quote);
      setPreview(null);
      setPreviewCanRedeem(true);
      setQuoteButtonLabel(null);
      setTxHash('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to quote Redeem DG');
    } finally {
      setIsQuoting(false);
    }
  };

  const handleCancel = async (intentId: string) => {
    setIsCancelling(true);
    try {
      const token = await getAccessToken();
      await callEdgeFunction<any>('cancel-dg-redemption', {
        intent_id: intentId,
      }, {
        privyToken: token,
        withAnonKey: true,
      });

      if (quote && quote.intent_id === intentId) {
        setQuote(null);
        setPreview(null);
        setStatus(null);
        setRedemptionStatus(null);
        setTxHash('');
      }

      toast.success('Redeem DG request cancelled');
      loadHistory().catch((error) => {
        console.error('Failed to load history after cancellation:', error);
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to cancel Redeem DG request');
    } finally {
      setIsCancelling(false);
      setShowCancelDialog(false);
      setCancelIntentId(null);
    }
  };

  const getNotifyCooldownMs = (intentId?: string | null) => {
    if (!intentId) return 0;
    const nextNotifyAt = notifyCooldowns[intentId];
    if (!nextNotifyAt) return 0;
    return Math.max(new Date(nextNotifyAt).getTime() - Date.now(), 0);
  };

  const notifyAdmin = async (intentId: string) => {
    if (!intentId) return;
    if (getNotifyCooldownMs(intentId) > 0) return;
    setNotifyingIntentId(intentId);
    try {
      const token = await getAccessToken();
      const data = await callEdgeFunction<any>('notify-dg-redemption-admin', {
        intent_id: intentId,
      }, {
        privyToken: token,
        withAnonKey: true,
      });
      if (data.next_notify_at) {
        setNotifyCooldowns((current) => ({ ...current, [intentId]: data.next_notify_at }));
      }
      if (quote?.intent_id === intentId) {
        setStatus(data.status || 'manual_review');
        setRedemptionStatus(data.redemption || null);
      }
      await loadHistory();
      toast.success('Admin notified');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to notify admin');
    } finally {
      setNotifyingIntentId(null);
    }
  };

  const copyAddress = async () => {
    if (!quote?.redemption_wallet_address) return;
    await navigator.clipboard.writeText(quote.redemption_wallet_address);
    toast.success('Address copied');
  };

  const copyText = async (label: string, value?: string | null) => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  };

  const openTxExplorer = async (item: RedemptionStatus) => {
    if (!item.tx_hash) return;
    try {
      const url = await getExplorerTxUrl(item.chain_id || chainId, item.tx_hash);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      console.error('Failed to open Redeem DG transaction explorer:', error);
      toast.error('Could not open transaction in block explorer');
    }
  };

  const requestExpiredReviewFor = async (intentId: string, hash: string) => {
    if (!/^0x([A-Fa-f0-9]{64})$/.test(hash.trim())) {
      toast.error('Enter a valid transaction hash');
      return false;
    }
    setIsRequestingExpiredReview(true);
    try {
      const token = await getAccessToken();
      const data = await callEdgeFunction<any>('submit-dg-redemption-transfer', {
        intent_id: intentId,
        tx_hash: hash.trim(),
        request_expired_review: true,
      }, {
        privyToken: token,
        withAnonKey: true,
      });
      setStatus(data.status || 'manual_review');
      await Promise.allSettled([
        refreshStatus(),
        loadHistory(),
      ]);
      toast.success(data.message || 'Redeem DG transfer sent for admin review');
      return true;
    } catch (error) {
      await Promise.allSettled([
        refreshStatus(),
        loadHistory(),
      ]);
      toast.error(error instanceof Error ? error.message : 'Failed to request admin review');
      return false;
    } finally {
      setIsRequestingExpiredReview(false);
    }
  };

  const requestExpiredReview = async () => {
    if (!quote?.intent_id) return;
    await requestExpiredReviewFor(quote.intent_id, txHash);
  };

  const submit = async () => {
    if (!quote) return;
    if (expired) {
      toast.error('Quote has expired');
      return;
    }
    if (!canSubmitTransferForStatus(status)) {
      toast.error('This Redeem DG request is no longer waiting for a transfer');
      return;
    }
    if (!/^0x([A-Fa-f0-9]{64})$/.test(txHash.trim())) {
      toast.error('Enter a valid transaction hash');
      return;
    }
    setIsSubmitting(true);
    try {
      const token = await getAccessToken();
      const data = await callEdgeFunction<any>('submit-dg-redemption-transfer', {
        intent_id: quote.intent_id,
        tx_hash: txHash.trim(),
      }, {
        privyToken: token,
        withAnonKey: true,
      });
      setStatus(data.status);
      refreshStatus().catch((error) => {
        console.error('Failed to refresh Redeem DG status:', error);
      });
      loadHistory().catch((error) => {
        console.error('Failed to refresh Redeem DG history:', error);
      });
      toast.success(data.status === 'completed' ? 'Redeem DG completed' : 'Redeem DG request submitted');
    } catch (error) {
      await Promise.allSettled([
        refreshStatus(),
        loadHistory(),
      ]);
      toast.error(error instanceof Error ? error.message : 'Failed to submit transaction');
    } finally {
      setIsSubmitting(false);
    }
  };

  const canResume = (item: RedemptionStatus) =>
    item.status === 'awaiting_transfer' &&
    Boolean(item.expires_at) &&
    new Date(item.expires_at as string).getTime() > Date.now() &&
    Boolean(item.redemption_wallet_address);

  const resumeRedemption = (item: RedemptionStatus) => {
    if (!canResume(item)) {
      toast.error('This Redeem DG request can no longer be resumed');
      return;
    }
    setQuote({
      intent_id: item.id,
      expires_at: item.expires_at as string,
      chain_id: item.chain_id || chainId,
      redemption_wallet_address: item.redemption_wallet_address as string,
      amount_dg: item.amount_dg || item.amount_dg_raw || '',
      amount_dg_raw: item.amount_dg_raw || '',
      gross_value_kobo: Number(item.gross_value_kobo || 0),
      estimated_receive_kobo: Number(item.estimated_receive_kobo || 0),
      service_fee_kobo: Number(item.service_fee_kobo || 0),
      vendor_fee_kobo: Number(item.vendor_fee_kobo || 0),
      vat_kobo: Number(item.vat_kobo || 0),
      total_fee_kobo: Number(item.total_fee_kobo || 0),
      required_confirmations: Number(item.required_confirmations || 0),
    });
    setPreview(null);
    setAmount(item.amount_dg || '');
    setTxHash('');
    setStatus(item.status);
    setRedemptionStatus(item);
    setQuoteError(null);
    setMaxRedeemable(null);
    setQuoteButtonLabel(null);
    toast.success('Redeem DG request resumed');
  };

  const canRequestExpiredReview = (item: RedemptionStatus) =>
    item.status === 'expired' &&
    !item.tx_hash &&
    Boolean(item.expires_at);
  const canCancelRedemption = (item: RedemptionStatus) =>
    (item.status === 'awaiting_transfer' && !canResume(item)) ||
    (item.status === 'expired' && !item.tx_hash);

  const openExpiredReviewDialog = (item: RedemptionStatus) => {
    setExpiredReviewTarget(item);
    setExpiredReviewTxHash('');
  };

  const submitExpiredReviewDialog = async () => {
    if (!expiredReviewTarget) return;
    const submitted = await requestExpiredReviewFor(expiredReviewTarget.id, expiredReviewTxHash);
    if (!submitted) return;
    setExpiredReviewTarget(null);
    setExpiredReviewTxHash('');
  };

  const disabled = isBankLoading || !payoutAccount;
  const serviceAndConversionFee = quote ? quote.service_fee_kobo + quote.vendor_fee_kobo : 0;
  const transferSubmitDisabled = isSubmitting || expired || !canSubmitTransferForStatus(status);

  const notifyButtonContent = (intentId?: string | null) => {
    const cooldownMs = getNotifyCooldownMs(intentId);
    if (cooldownMs > 0) return `Notify Admin (${formatCountdown(new Date(Date.now() + cooldownMs).toISOString())})`;
    return 'Notify Admin';
  };

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gift className="h-5 w-5" />
          Redeem DG
        </CardTitle>
        <CardDescription>Redeem DG rewards to your saved Nigerian bank account.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {!payoutAccount && (
          <Alert>
            <AlertDescription>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span>Save bank details to enable Redeem DG.</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => document.getElementById('bank-details')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                >
                  Save bank details
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px]">
            <div className="space-y-2">
              <Label>DG Amount</Label>
              <Input
                min={Number.isFinite(minDg) ? limits?.min_dg : undefined}
                max={Number.isFinite(maxDg) && maxDg > 0 ? limits?.max_dg : undefined}
                inputMode="decimal"
                value={amount}
                disabled={disabled || isPreviewing || isQuoting}
                onChange={(event) => {
                  setAmount(sanitizeDgAmount(event.target.value));
                  setPreview(null);
                  setPreviewCanRedeem(true);
                  setQuoteButtonLabel(null);
                  setQuote(null);
                  setQuoteError(null);
                  setMaxRedeemable(null);
                }}
                placeholder="121000"
              />
            </div>
            <div className="flex items-end">
              <Button onClick={getPreview} disabled={disabled || isPreviewing || isQuoting || !isAmountValid} className="w-full">
                {isPreviewing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Clock className="h-4 w-4 mr-2" />}
                Preview
              </Button>
            </div>
          </div>
          <p className={`text-xs ${amountValidationMessage ? 'text-destructive' : 'text-muted-foreground'}`}>
            {amountValidationMessage || limitsText || 'Loading Redeem DG limits...'}
          </p>
        </div>

        {quoteError && (
          <Alert>
            <AlertDescription>
              {quoteError}
              {maxRedeemable && <span className="block mt-1 font-medium">Available now: {maxRedeemable}</span>}
            </AlertDescription>
          </Alert>
        )}

        {preview && (
          <div className="space-y-4 rounded-md border p-4 bg-muted/20">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm text-muted-foreground">You will receive</div>
                <div className="text-2xl font-bold text-foreground">{formatNairaFromKobo(preview.estimated_receive_kobo)}</div>
              </div>
              <Badge variant="outline">Preview</Badge>
            </div>

            <div className={`grid gap-3 text-sm ${preview.vat_kobo > 0 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
              <div className="rounded-md bg-muted/50 p-3">
                <div className="text-muted-foreground">Bank</div>
                <div className="font-medium">{payoutAccount?.bank_name}</div>
                <div className="font-mono">******{payoutAccount?.account_number_last4}</div>
              </div>
              <div className="rounded-md bg-muted/50 p-3">
                <div className="text-muted-foreground">Service fee</div>
                <div className="font-medium">{formatNairaFromKobo(preview.service_fee_kobo + preview.vendor_fee_kobo)}</div>
              </div>
              {preview.vat_kobo > 0 && (
                <div className="rounded-md bg-muted/50 p-3">
                  <div className="text-muted-foreground">VAT</div>
                  <div className="font-medium">{formatNairaFromKobo(preview.vat_kobo)}</div>
                </div>
              )}
            </div>

            <Button onClick={getQuote} disabled={isQuoting || !previewCanRedeem} className="w-full">
              {isQuoting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              {quoteButtonLabel || 'Get Quote to Redeem'}
            </Button>
          </div>
        )}

        {quote && (
          <div className="space-y-4 rounded-md border p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm text-muted-foreground">You receive</div>
                <div className="text-2xl font-bold">{formatNairaFromKobo(quote.estimated_receive_kobo)}</div>
              </div>
              <Badge variant={expired ? 'destructive' : 'secondary'}>{expired ? 'Expired' : 'Active quote'}</Badge>
            </div>

            <div className={`flex flex-col gap-2 rounded-md border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
              expired ? 'border-destructive/40 bg-destructive/10' : 'border-primary/25 bg-primary/5'
            }`}>
              <div className="flex items-center gap-2">
                <Clock className={`h-4 w-4 ${expired ? 'text-destructive' : 'text-primary'}`} />
                <span className={`text-sm font-medium ${expired ? 'text-destructive' : 'text-foreground'}`}>
                  {expired ? 'Quote expired' : 'Quote expires in'}
                </span>
              </div>
              <div className={`font-mono text-2xl font-bold tabular-nums ${expired ? 'text-destructive' : 'text-primary'}`}>
                {expired ? '00:00' : formatCountdown(quote.expires_at || undefined)}
              </div>
            </div>

            <div className={`grid gap-3 text-sm ${quote.vat_kobo > 0 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
              <div className="rounded-md bg-muted/50 p-3">
                <div className="text-muted-foreground">Bank</div>
                <div className="font-medium">{payoutAccount?.bank_name}</div>
                <div className="font-mono">******{payoutAccount?.account_number_last4}</div>
              </div>
              <div className="rounded-md bg-muted/50 p-3">
                <div className="text-muted-foreground">Service fee</div>
                <div className="font-medium">{formatNairaFromKobo(serviceAndConversionFee)}</div>
              </div>
              {quote.vat_kobo > 0 && (
                <div className="rounded-md bg-muted/50 p-3">
                  <div className="text-muted-foreground">VAT</div>
                  <div className="font-medium">{formatNairaFromKobo(quote.vat_kobo)}</div>
                </div>
              )}
            </div>

            {!expired ? (
              <>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-violet-700 dark:text-violet-300 bg-violet-50/50 dark:bg-violet-950/20 px-2.5 py-1 rounded-md border border-violet-100 dark:border-violet-900/30 inline-block">
                    Send exactly {quote.amount_dg} DG to
                  </Label>
                  <div className="flex gap-2">
                    <Input readOnly value={quote.redemption_wallet_address} className="font-mono text-xs font-bold" />
                    <Button variant="outline" size="icon" onClick={copyAddress} type="button">
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="rounded-lg border bg-blue-50/50 dark:bg-blue-950/15 border-blue-100 dark:border-blue-900/30 p-3.5 space-y-2 text-xs">
                    <div className="flex items-center gap-2 font-semibold text-blue-800 dark:text-blue-300">
                      <Info className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                      <span>Transfer Guidelines</span>
                    </div>
                    <div className="text-blue-700/80 dark:text-blue-300/80 leading-relaxed pl-[22px]">
                      Send only from this address:{" "}
                      <code className="px-1.5 py-0.5 rounded bg-blue-100/50 dark:bg-blue-900/30 font-mono font-bold text-blue-900 dark:text-blue-200 text-[10px]">
                        {shortAddress(address)}
                      </code>
                      , then submit the transaction hash below.
                    </div>
                    <div className="text-blue-800/90 dark:text-blue-300/90 font-medium pl-[22px]">
                      Note: Sending from a different address may lead to loss of funds.
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px]">
                  <div className="space-y-2">
                    <Label>Transaction Hash</Label>
                    <Input
                      value={txHash}
                      onChange={(event) => setTxHash(event.target.value.trim())}
                      placeholder="0x..."
                      className="font-mono text-xs"
                    />
                  </div>
                  <div className="flex items-end gap-2">
                    <Button onClick={submit} disabled={transferSubmitDisabled} className="flex-grow">
                      {isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                      Submit
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => {
                        if (quote?.intent_id) {
                          setCancelIntentId(quote.intent_id);
                          setShowCancelDialog(true);
                        }
                      }}
                      disabled={isCancelling}
                      className="px-3"
                      title="Cancel Request"
                      type="button"
                    >
                      {isCancelling && cancelIntentId === quote?.intent_id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cancel"}
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-4 rounded-md border border-destructive/30 bg-destructive/10 p-4">
                <div className="space-y-2">
                  <div className="font-semibold text-destructive">Do not send DG for this expired quote.</div>
                  <p className="text-sm text-destructive/90">
                    Get a new quote before transferring. Expired quotes are not processed automatically because the payout value may have changed.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" onClick={getQuote} disabled={isQuoting}>
                      {isQuoting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                      Get New Quote
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        if (quote?.intent_id) {
                          setCancelIntentId(quote.intent_id);
                          setShowCancelDialog(true);
                        }
                      }}
                      disabled={isCancelling}
                    >
                      Cancel Request
                    </Button>
                  </div>
                </div>

                <div className="space-y-3 rounded-md border bg-background/80 p-3">
                  <div>
                    <div className="text-sm font-semibold">Already sent after this quote was created?</div>
                    <p className="text-xs text-muted-foreground">
                      Submit the transaction hash for admin review. We will verify the transfer matches this quote and was made after the quote was created.
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_190px]">
                    <div className="space-y-2">
                      <Label>Transaction Hash</Label>
                      <Input
                        value={txHash}
                        onChange={(event) => setTxHash(event.target.value.trim())}
                        placeholder="0x..."
                        className="font-mono text-xs"
                      />
                    </div>
                    <div className="flex items-end">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={requestExpiredReview}
                        disabled={isRequestingExpiredReview}
                        className="w-full"
                      >
                        {isRequestingExpiredReview ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bell className="mr-2 h-4 w-4" />}
                        Request Review
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {status && (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      Redeem DG status: <span className="font-medium">{formatStatus(status)}</span>
                      {statusHelp(status) && (
                        <span className="block text-muted-foreground">{statusHelp(status)}</span>
                      )}
                      {formatUserReviewMessage(redemptionStatus?.last_error) && (
                        <span className="block text-muted-foreground">{formatUserReviewMessage(redemptionStatus?.last_error)}</span>
                      )}
                      {redemptionStatus?.completed_at && (
                        <span className="block text-muted-foreground">Completed {new Date(redemptionStatus.completed_at).toLocaleString()}</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {status === 'manual_review' && quote.intent_id && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => notifyAdmin(quote.intent_id as string)}
                          disabled={notifyingIntentId === quote.intent_id || getNotifyCooldownMs(quote.intent_id) > 0}
                        >
                          {notifyingIntentId === quote.intent_id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bell className="mr-2 h-4 w-4" />}
                          {notifyButtonContent(quote.intent_id)}
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => refreshStatus().catch((error) => {
                          console.error('Failed to refresh Redeem DG status:', error);
                          toast.error(error instanceof Error ? error.message : 'Failed to refresh Redeem DG status');
                        })}
                      >
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Refresh
                      </Button>
                    </div>
                  </div>
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <Label>Recent Redeem DG requests</Label>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => loadHistory({ offset: 0 }).catch((error) => {
                console.error('Failed to refresh Redeem DG history:', error);
                toast.error(error instanceof Error ? error.message : 'Failed to refresh Redeem DG requests');
              })}
              disabled={isHistoryLoading || isHistoryPageLoading}
            >
              {isHistoryLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Refresh
            </Button>
          </div>
          {recentRedemptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No Redeem DG requests yet.</p>
          ) : (
            <div className="space-y-3">
              <div className="max-h-[360px] overflow-y-auto pr-1">
                <div className="space-y-2">
                  {recentRedemptions.map((item) => (
                    <div key={item.id} className="flex flex-col gap-3 rounded-md border p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                          <div>
                            <span className="text-xs text-muted-foreground">Receive</span>
                            <span className="ml-2 font-semibold">{formatNairaFromKobo(item.estimated_receive_kobo)}</span>
                          </div>
                          <div>
                            <span className="text-xs text-muted-foreground">Redeem</span>
                            <span className="ml-2 font-medium">{formatDgAmount(item.amount_dg)}</span>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span>{item.created_at ? new Date(item.created_at).toLocaleString() : 'Recently'}</span>
                          {item.tx_hash && (
                            <span className="inline-flex min-w-0 items-center gap-1 rounded-md bg-muted/50 px-2 py-1">
                              <span>Tx</span>
                              <button
                                type="button"
                                className="font-mono text-foreground hover:underline"
                                onClick={() => openTxExplorer(item)}
                              >
                                {shortAddress(item.tx_hash)}
                              </button>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 text-muted-foreground"
                                onClick={() => copyText('Transaction hash', item.tx_hash)}
                                title="Copy transaction hash"
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 text-muted-foreground"
                                onClick={() => openTxExplorer(item)}
                                title="View transaction on block explorer"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Button>
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                        <Badge variant={statusVariant(item.status)}>{formatStatus(item.status)}</Badge>
                        {canResume(item) && (
                          <Button type="button" size="sm" variant="outline" onClick={() => resumeRedemption(item)}>
                            Resume
                          </Button>
                        )}
                        {canRequestExpiredReview(item) && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => openExpiredReviewDialog(item)}
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
                            onClick={() => {
                              setCancelIntentId(item.id);
                              setShowCancelDialog(true);
                            }}
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
              {(recentPagination.total > recentRedemptions.length || recentPagination.has_more) && (
                <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span>{recentRedemptions.length} of {recentPagination.total} shown</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => loadHistory({
                      offset: recentPagination.offset + recentPagination.limit,
                      append: true,
                    }).catch((error) => {
                      console.error('Failed to load more Redeem DG requests:', error);
                      toast.error(error instanceof Error ? error.message : 'Failed to load more Redeem DG requests');
                    })}
                    disabled={isHistoryLoading || isHistoryPageLoading}
                  >
                    {isHistoryPageLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Load More
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>

      <Dialog open={Boolean(expiredReviewTarget)} onOpenChange={(open) => {
        if (open) return;
        setExpiredReviewTarget(null);
        setExpiredReviewTxHash('');
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request admin review</DialogTitle>
            <DialogDescription>
              Submit the transaction hash only if you sent this DG transfer after the expired quote was created.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <div className="text-xs text-muted-foreground">Redeem</div>
              <div className="font-medium">{expiredReviewTarget?.amount_dg || expiredReviewTarget?.amount_dg_raw || '0'} DG</div>
              <div className="mt-2 text-xs text-muted-foreground">Quote created</div>
              <div>{expiredReviewTarget?.created_at ? new Date(expiredReviewTarget.created_at).toLocaleString() : 'Unknown'}</div>
            </div>
            <div className="space-y-2">
              <Label>Transaction Hash</Label>
              <Input
                value={expiredReviewTxHash}
                onChange={(event) => setExpiredReviewTxHash(event.target.value.trim())}
                placeholder="0x..."
                className="font-mono text-xs"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setExpiredReviewTarget(null);
                setExpiredReviewTxHash('');
              }}
              disabled={isRequestingExpiredReview}
            >
              Cancel
            </Button>
            <Button type="button" onClick={submitExpiredReviewDialog} disabled={isRequestingExpiredReview}>
              {isRequestingExpiredReview ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bell className="mr-2 h-4 w-4" />}
              Request Review
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Redeem DG Request?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel this request? This action cannot be undone, and any details for this transaction will be removed from your view.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCancelling}>No, keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (cancelIntentId) {
                  handleCancel(cancelIntentId);
                }
              }}
              disabled={isCancelling}
            >
              {isCancelling ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Yes, cancel request
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};
