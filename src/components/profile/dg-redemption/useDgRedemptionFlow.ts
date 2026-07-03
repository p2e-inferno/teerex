import { useCallback, useEffect, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { toast } from 'sonner';
import { callEdgeFunction } from '@/lib/edgeFunctions';
import {
  amountNumber,
  canSubmitTransferForStatus,
  formatDgLimit,
  formatMaxRedeemable,
  payoutMethodOf,
  sanitizeDgAmount,
  unavailableQuoteButtonLabel,
  type DgPayoutMethod,
  type RedemptionLimits,
  type RedemptionQuote,
  type RedemptionStatus,
} from './types';

interface UseDgRedemptionFlowParams {
  payoutMethod: DgPayoutMethod;
  address: string;
  chainId: number;
  payoutWalletAddress?: string;
  limits: RedemptionLimits | null;
  hasPayoutAccount: boolean;
  onHistoryChanged: () => void;
  rememberNotifyCooldowns: (redemptions: RedemptionStatus[] | null | undefined) => void;
}

export function useDgRedemptionFlow({
  payoutMethod,
  address,
  chainId,
  payoutWalletAddress,
  limits,
  hasPayoutAccount,
  onHistoryChanged,
  rememberNotifyCooldowns,
}: UseDgRedemptionFlowParams) {
  const { getAccessToken } = usePrivy();
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
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isQuoting, setIsQuoting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRequestingExpiredReview, setIsRequestingExpiredReview] = useState(false);
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
    rememberNotifyCooldowns(data.redemption ? [data.redemption] : []);
  }, [getAccessToken, quote?.intent_id, rememberNotifyCooldowns]);

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

  const updateAmount = useCallback((value: string) => {
    setAmount(sanitizeDgAmount(value));
    setPreview(null);
    setPreviewCanRedeem(true);
    setQuoteButtonLabel(null);
    setQuote(null);
    setQuoteError(null);
    setMaxRedeemable(null);
  }, []);

  const validateBeforeRequest = useCallback(() => {
    if (payoutMethod === 'ngn' && !hasPayoutAccount) {
      document.getElementById('bank-details')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      toast.error('Save bank details before redeeming DG');
      return false;
    }
    if (payoutMethod === 'usdc' && !payoutWalletAddress) {
      toast.error('Choose a payout wallet before redeeming DG');
      return false;
    }
    if (!limits) {
      toast.error('Redeem DG limits are still loading');
      return false;
    }
    if (amountValidationMessage || !isAmountValid) {
      toast.error(amountValidationMessage || 'Enter a DG amount');
      return false;
    }
    return true;
  }, [payoutMethod, hasPayoutAccount, payoutWalletAddress, limits, amountValidationMessage, isAmountValid]);

  const quoteRequestBody = useCallback((previewOnly: boolean) => ({
    amount_dg: amount,
    chain_id: chainId,
    wallet_address: address,
    preview_only: previewOnly,
    payout_method: payoutMethod,
    ...(payoutMethod === 'usdc' ? { payout_wallet_address: payoutWalletAddress } : {}),
  }), [amount, chainId, address, payoutMethod, payoutWalletAddress]);

  const applyUnavailableQuote = useCallback((data: any) => {
    if (data.quote) setPreview(data.quote);
    setPreviewCanRedeem(false);
    setQuoteButtonLabel(unavailableQuoteButtonLabel(data));
    setQuoteError(data.error || 'Redeem DG is not available for this amount');
    setMaxRedeemable(formatMaxRedeemable(data.max_redeemable));
  }, []);

  const getPreview = useCallback(async () => {
    setPreview(null);
    setPreviewCanRedeem(true);
    setQuoteButtonLabel(null);
    setQuote(null);
    setStatus(null);
    setRedemptionStatus(null);
    setQuoteError(null);
    setMaxRedeemable(null);
    if (!validateBeforeRequest()) return;
    setIsPreviewing(true);
    try {
      const token = await getAccessToken();
      const data = await callEdgeFunction<any>('quote-dg-redemption', quoteRequestBody(true), {
        privyToken: token,
        withAnonKey: true,
      });
      if (data.can_redeem === false) {
        applyUnavailableQuote(data);
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
  }, [validateBeforeRequest, getAccessToken, quoteRequestBody, applyUnavailableQuote]);

  const getQuote = useCallback(async () => {
    setQuote(null);
    setStatus(null);
    setRedemptionStatus(null);
    setQuoteError(null);
    setMaxRedeemable(null);
    setQuoteButtonLabel(null);
    if (!validateBeforeRequest()) return;
    setIsQuoting(true);
    try {
      const token = await getAccessToken();
      const data = await callEdgeFunction<any>('quote-dg-redemption', quoteRequestBody(false), {
        privyToken: token,
        withAnonKey: true,
      });
      if (data.can_redeem === false) {
        applyUnavailableQuote(data);
        return;
      }
      setQuote(data.quote);
      setPreview(null);
      setPreviewCanRedeem(true);
      setQuoteButtonLabel(null);
      setTxHash('');
      onHistoryChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to quote Redeem DG');
    } finally {
      setIsQuoting(false);
    }
  }, [validateBeforeRequest, getAccessToken, quoteRequestBody, applyUnavailableQuote, onHistoryChanged]);

  const submit = useCallback(async () => {
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
      onHistoryChanged();
      toast.success(data.status === 'completed' ? 'Redeem DG completed' : 'Redeem DG request submitted');
    } catch (error) {
      await refreshStatus().catch(() => undefined);
      onHistoryChanged();
      toast.error(error instanceof Error ? error.message : 'Failed to submit transaction');
    } finally {
      setIsSubmitting(false);
    }
  }, [quote, expired, status, txHash, getAccessToken, refreshStatus, onHistoryChanged]);

  const requestExpiredReviewFor = useCallback(async (intentId: string, hash: string) => {
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
      if (quote?.intent_id === intentId) {
        setStatus(data.status || 'manual_review');
        await refreshStatus().catch(() => undefined);
      }
      onHistoryChanged();
      toast.success(data.message || 'Redeem DG transfer sent for admin review');
      return true;
    } catch (error) {
      if (quote?.intent_id === intentId) {
        await refreshStatus().catch(() => undefined);
      }
      onHistoryChanged();
      toast.error(error instanceof Error ? error.message : 'Failed to request admin review');
      return false;
    } finally {
      setIsRequestingExpiredReview(false);
    }
  }, [getAccessToken, quote?.intent_id, refreshStatus, onHistoryChanged]);

  const requestExpiredReview = useCallback(async () => {
    if (!quote?.intent_id) return;
    await requestExpiredReviewFor(quote.intent_id, txHash);
  }, [quote?.intent_id, requestExpiredReviewFor, txHash]);

  const resume = useCallback((item: RedemptionStatus) => {
    setQuote({
      intent_id: item.id,
      expires_at: item.expires_at as string,
      payout_method: payoutMethodOf(item),
      chain_id: item.chain_id || chainId,
      redemption_wallet_address: item.redemption_wallet_address as string,
      payout_wallet_address: item.payout_wallet_address || null,
      amount_dg: item.amount_dg || item.amount_dg_raw || '',
      amount_dg_raw: item.amount_dg_raw || '',
      gross_value_kobo: Number(item.gross_value_kobo || 0),
      estimated_receive_kobo: Number(item.estimated_receive_kobo || 0),
      service_fee_kobo: Number(item.service_fee_kobo || 0),
      vendor_fee_kobo: Number(item.vendor_fee_kobo || 0),
      vat_kobo: Number(item.vat_kobo || 0),
      total_fee_kobo: Number(item.total_fee_kobo || 0),
      gross_value_usdc_micro: item.gross_value_usdc_micro ?? null,
      estimated_receive_usdc_micro: item.estimated_receive_usdc_micro ?? null,
      service_fee_usdc_micro: item.service_fee_usdc_micro ?? null,
      vendor_fee_usdc_micro: item.vendor_fee_usdc_micro ?? null,
      total_fee_usdc_micro: item.total_fee_usdc_micro ?? null,
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
  }, [chainId]);

  const clearQuote = useCallback((intentId?: string) => {
    if (intentId && quote?.intent_id !== intentId) return;
    setQuote(null);
    setPreview(null);
    setStatus(null);
    setRedemptionStatus(null);
    setTxHash('');
  }, [quote?.intent_id]);

  return {
    payoutMethod,
    amount,
    updateAmount,
    preview,
    previewCanRedeem,
    quoteButtonLabel,
    quote,
    quoteError,
    maxRedeemable,
    txHash,
    setTxHash,
    status,
    setStatus,
    redemptionStatus,
    expired,
    amountValidationMessage,
    isAmountValid,
    minDg,
    maxDg,
    isPreviewing,
    isQuoting,
    isSubmitting,
    isRequestingExpiredReview,
    getPreview,
    getQuote,
    submit,
    requestExpiredReview,
    requestExpiredReviewFor,
    refreshStatus,
    resume,
    clearQuote,
  };
}

export type DgRedemptionFlow = ReturnType<typeof useDgRedemptionFlow>;
