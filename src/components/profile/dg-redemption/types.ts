import { formatNairaFromKobo, formatUsdcFromMicro } from '@/lib/currency';

export type DgPayoutMethod = 'ngn' | 'usdc';

export interface RedemptionQuote {
  intent_id?: string | null;
  expires_at?: string | null;
  payout_method?: DgPayoutMethod;
  chain_id?: number;
  redemption_wallet_address?: string;
  payout_wallet_address?: string | null;
  amount_dg: string;
  amount_dg_raw?: string;
  gross_value_kobo?: number;
  estimated_receive_kobo?: number;
  service_fee_kobo?: number;
  vendor_fee_kobo?: number;
  vat_kobo?: number;
  total_fee_kobo?: number;
  gross_value_usdc_micro?: number | null;
  estimated_receive_usdc_micro?: number | null;
  service_fee_usdc_micro?: number | null;
  vendor_fee_usdc_micro?: number | null;
  total_fee_usdc_micro?: number | null;
  required_confirmations?: number;
}

export interface RedemptionStatus {
  id: string;
  status: string;
  payout_method?: DgPayoutMethod;
  chain_id?: number;
  redemption_wallet_address?: string;
  payout_wallet_address?: string | null;
  payout_tx_hash?: string | null;
  fee_transfer_status?: string | null;
  fee_transfer_tx_hash?: string | null;
  fee_transfer_last_error?: string | null;
  fee_transfer_completed_at?: string | null;
  amount_dg?: string;
  amount_dg_raw?: string;
  gross_value_kobo?: number;
  service_fee_kobo?: number;
  vendor_fee_kobo?: number;
  vat_kobo?: number;
  total_fee_kobo?: number;
  estimated_receive_kobo?: number;
  gross_value_usdc_micro?: number | null;
  estimated_receive_usdc_micro?: number | null;
  service_fee_usdc_micro?: number | null;
  vendor_fee_usdc_micro?: number | null;
  total_fee_usdc_micro?: number | null;
  required_confirmations?: number;
  last_error?: string | null;
  next_admin_notify_at?: string | null;
  tx_hash?: string | null;
  expires_at?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface RedemptionLimits {
  min_dg: string;
  max_dg: string;
}

export interface RedemptionMethods {
  ngn_enabled: boolean;
  usdc_enabled: boolean;
}

export interface RedemptionPagination {
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

export const RECENT_REDEMPTIONS_PAGE_SIZE = 5;

export const shortAddress = (value: string) => `${value.slice(0, 6)}...${value.slice(-4)}`;

export const formatCountdown = (expiresAt?: string) => {
  if (!expiresAt) return '00:00';
  const ms = Math.max(new Date(expiresAt).getTime() - Date.now(), 0);
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

export const formatStatus = (value: string) => {
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

export const sanitizeDgAmount = (value: string) => {
  const stripped = value.replace(/[^\d.]/g, '');
  const [whole, ...decimalParts] = stripped.split('.');
  return decimalParts.length > 0 ? `${whole}.${decimalParts.join('')}` : whole;
};

export const amountNumber = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

export const formatDgLimit = (value: string) => `${value} DG`;

export const formatDgAmount = (value?: string) => {
  const normalized = String(value || '').trim();
  if (!normalized) return 'DG amount unavailable';
  return `${normalized.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')} DG`;
};

export const payoutMethodOf = (item: { payout_method?: DgPayoutMethod }): DgPayoutMethod =>
  item.payout_method === 'usdc' ? 'usdc' : 'ngn';

export const formatReceiveAmount = (item: {
  payout_method?: DgPayoutMethod;
  estimated_receive_kobo?: number | null;
  estimated_receive_usdc_micro?: number | null;
}) =>
  payoutMethodOf(item) === 'usdc'
    ? formatUsdcFromMicro(item.estimated_receive_usdc_micro)
    : formatNairaFromKobo(item.estimated_receive_kobo);

export const statusHelp = (value: string, method: DgPayoutMethod) => {
  if (value === 'manual_review') return 'We received your DG transfer, but the payout needs admin review before it can continue.';
  if (value === 'payout_pending' || value === 'payout_processing') {
    return method === 'usdc'
      ? 'Your USDC payout transaction has been sent and is waiting for onchain confirmation.'
      : 'Your payout has been sent to Paystack and is waiting for confirmation.';
  }
  if (value === 'completed') {
    return method === 'usdc' ? 'The USDC payout has been confirmed onchain.' : 'Paystack has confirmed the payout.';
  }
  if (value === 'failed') return 'Support can review and retry this payout.';
  return null;
};

export const formatUserReviewMessage = (error?: string | null) => {
  const labels: Record<string, string> = {
    paystack_otp_required: 'Pending admin approval.',
    paystack_transfer_failed: 'The payout needs admin review before it can continue.',
    paystack_transfer_reversed: 'The payout needs admin review before it can continue.',
    paystack_transfer_not_found: 'The payout needs admin review before it can continue.',
    paystack_transfer_abandoned: 'The payout needs admin review before it can continue.',
    paystack_transfer_rejected: 'The payout needs admin review before it can continue.',
    paystack_transfer_blocked: 'The payout needs admin review before it can continue.',
    usdc_payout_reverted: 'The payout needs admin review before it can continue.',
    usdc_payout_nonce_conflict: 'The payout needs admin review before it can continue.',
    usdc_payout_insufficient_balance: 'The payout needs admin review before it can continue.',
    usdc_payout_broadcast_failed: 'The payout needs admin review before it can continue.',
    usdc_payout_missing_raw_tx: 'The payout needs admin review before it can continue.',
    manual_review_required: 'Pending admin review.',
    expired_quote_transfer_submitted: 'We received your expired quote transfer and sent it for admin review.',
  };
  return error ? labels[error] || 'Pending admin review.' : null;
};

export const statusVariant = (status: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
  if (status === 'completed') return 'default';
  if (['failed', 'expired', 'cancelled'].includes(status)) return 'destructive';
  if (['manual_review', 'payout_processing', 'payout_pending'].includes(status)) return 'secondary';
  return 'outline';
};

export const canSubmitTransferForStatus = (value: string | null) => !value || value === 'awaiting_transfer';

export const canResumeRedemption = (item: RedemptionStatus) =>
  item.status === 'awaiting_transfer' &&
  Boolean(item.expires_at) &&
  new Date(item.expires_at as string).getTime() > Date.now() &&
  Boolean(item.redemption_wallet_address);

export const canRequestExpiredReview = (item: RedemptionStatus) =>
  item.status === 'expired' &&
  !item.tx_hash &&
  Boolean(item.expires_at);

export const canCancelRedemption = (item: RedemptionStatus) =>
  (item.status === 'awaiting_transfer' && !canResumeRedemption(item)) ||
  (item.status === 'expired' && !item.tx_hash);

export const unavailableQuoteButtonLabel = (data: { error?: string; max_redeemable?: { reason?: string } }) => {
  if (data.max_redeemable?.reason === 'wallet_balance' || data.error?.toLowerCase().includes('dg balance')) {
    return 'Insufficient DG Balance';
  }
  return 'Quote Unavailable';
};

export const formatMaxRedeemable = (
  maxRedeemable: {
    amount_dg?: string;
    net_payout_kobo?: number;
    gross_value_kobo?: number;
    net_payout_usdc_micro?: number;
    gross_value_usdc_micro?: number;
  } | null | undefined,
): string | null => {
  if (!maxRedeemable) return null;
  if (maxRedeemable.amount_dg) return `${maxRedeemable.amount_dg} DG`;
  if (maxRedeemable.net_payout_usdc_micro !== undefined) return formatUsdcFromMicro(maxRedeemable.net_payout_usdc_micro);
  if (maxRedeemable.gross_value_usdc_micro !== undefined) return formatUsdcFromMicro(maxRedeemable.gross_value_usdc_micro);
  if (maxRedeemable.net_payout_kobo !== undefined) return formatNairaFromKobo(maxRedeemable.net_payout_kobo);
  if (maxRedeemable.gross_value_kobo !== undefined) return formatNairaFromKobo(maxRedeemable.gross_value_kobo);
  return null;
};
