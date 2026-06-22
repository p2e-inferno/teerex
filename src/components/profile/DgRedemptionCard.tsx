import React, { useCallback, useEffect, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { CheckCircle2, Clock, Copy, Gift, Loader2, RefreshCw, Send, Trash2 } from 'lucide-react';
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

interface DgRedemptionCardProps {
  address: string;
  chainId: number;
}

interface RedemptionQuote {
  intent_id: string;
  expires_at: string;
  chain_id: number;
  redemption_wallet_address: string;
  amount_dg: string;
  amount_dg_raw: string;
  gross_value_kobo: number;
  estimated_receive_kobo: number;
  service_fee_kobo: number;
  vendor_fee_kobo: number;
  vat_kobo: number;
  total_fee_kobo: number;
  required_confirmations: number;
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
  expires_at?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

interface RedemptionLimits {
  min_dg: string;
  max_dg: string;
}

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

const statusHelp = (value: string) => {
  if (value === 'manual_review') return 'An admin needs to approve this payout before it can continue.';
  if (value === 'payout_pending' || value === 'payout_processing') return 'Your payout has been sent to Paystack and is waiting for confirmation.';
  if (value === 'completed') return 'Paystack has confirmed the payout.';
  if (value === 'failed') return 'Support can review and retry this payout.';
  return null;
};

const statusVariant = (status: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
  if (status === 'completed') return 'default';
  if (['failed', 'expired', 'cancelled'].includes(status)) return 'destructive';
  if (['manual_review', 'payout_processing', 'payout_pending'].includes(status)) return 'secondary';
  return 'outline';
};

export const DgRedemptionCard: React.FC<DgRedemptionCardProps> = ({ address, chainId }) => {
  const { getAccessToken } = usePrivy();
  const { payoutAccount, isLoading: isBankLoading } = useUserPayoutAccount();
  const [amount, setAmount] = useState('');
  const [preview, setPreview] = useState<RedemptionQuote | null>(null);
  const [quote, setQuote] = useState<RedemptionQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [maxRedeemable, setMaxRedeemable] = useState<string | null>(null);
  const [txHash, setTxHash] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [redemptionStatus, setRedemptionStatus] = useState<RedemptionStatus | null>(null);
  const [recentRedemptions, setRecentRedemptions] = useState<RedemptionStatus[]>([]);
  const [limits, setLimits] = useState<RedemptionLimits | null>(null);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isQuoting, setIsQuoting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelIntentId, setCancelIntentId] = useState<string | null>(null);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [, setNowTick] = useState(0);

  useEffect(() => {
    if (!quote) return;
    const id = window.setInterval(() => setNowTick((value) => value + 1), 1000);
    return () => window.clearInterval(id);
  }, [quote]);

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
  }, [getAccessToken, quote?.intent_id]);

  const loadHistory = useCallback(async () => {
    setIsHistoryLoading(true);
    try {
      const token = await getAccessToken();
      const data = await callEdgeFunction<any>('list-user-dg-redemptions', {}, {
        privyToken: token,
        withAnonKey: true,
        method: 'GET',
      });
      setRecentRedemptions(data.redemptions || []);
      setLimits(data.limits || null);
    } finally {
      setIsHistoryLoading(false);
    }
  }, [getAccessToken]);

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

  const expired = quote ? new Date(quote.expires_at).getTime() <= Date.now() : false;
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

  const copyAddress = async () => {
    if (!quote?.redemption_wallet_address) return;
    await navigator.clipboard.writeText(quote.redemption_wallet_address);
    toast.success('Address copied');
  };

  const submit = async () => {
    if (!quote) return;
    if (expired) {
      toast.error('Quote has expired');
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
    toast.success('Redeem DG request resumed');
  };

  const disabled = isBankLoading || !payoutAccount;
  const serviceAndConversionFee = quote ? quote.service_fee_kobo + quote.vendor_fee_kobo : 0;

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

            <Button onClick={getQuote} disabled={isQuoting} className="w-full">
              {isQuoting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Get Quote to Redeem
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
              <Badge variant={expired ? 'destructive' : 'secondary'}>
                {expired ? 'Expired' : formatCountdown(quote.expires_at)}
              </Badge>
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

            <div className="space-y-2">
              <Label>Send DG to</Label>
              <div className="flex gap-2">
                <Input readOnly value={quote.redemption_wallet_address} className="font-mono text-xs" />
                <Button variant="outline" size="icon" onClick={copyAddress} type="button">
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Send exactly {quote.amount_dg} DG from {shortAddress(address)}, then submit the transaction hash.
              </p>
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
                <Button onClick={submit} disabled={isSubmitting || expired} className="flex-grow">
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
                      {redemptionStatus?.last_error && (
                        <span className="block text-destructive">{redemptionStatus.last_error}</span>
                      )}
                      {redemptionStatus?.completed_at && (
                        <span className="block text-muted-foreground">Completed {new Date(redemptionStatus.completed_at).toLocaleString()}</span>
                      )}
                    </div>
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
              onClick={() => loadHistory().catch((error) => {
                console.error('Failed to refresh Redeem DG history:', error);
                toast.error(error instanceof Error ? error.message : 'Failed to refresh Redeem DG requests');
              })}
              disabled={isHistoryLoading}
            >
              {isHistoryLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Refresh
            </Button>
          </div>
          {recentRedemptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No Redeem DG requests yet.</p>
          ) : (
            <div className="space-y-2">
              {recentRedemptions.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium">{formatNairaFromKobo(item.estimated_receive_kobo)}</div>
                    <div className="text-xs text-muted-foreground">
                      {item.created_at ? new Date(item.created_at).toLocaleString() : 'Recently'}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant={statusVariant(item.status)}>{formatStatus(item.status)}</Badge>
                    {canResume(item) && (
                      <Button type="button" size="sm" variant="outline" onClick={() => resumeRedemption(item)}>
                        Resume
                      </Button>
                    )}
                    {item.status === 'awaiting_transfer' && !canResume(item) && (
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
          )}
        </div>
      </CardContent>

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
