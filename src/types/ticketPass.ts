// Ticket Pass bundles — client-side types.
// These mirror the `ticket_passes` / `ticket_pass_orders` tables. They are declared
// standalone (rather than derived from the generated Supabase types) so the feature
// compiles before `src/integrations/supabase/types.ts` is regenerated.

export type TicketPassStatus = 'ACTIVE' | 'CLOSED' | 'SOLD_OUT';
export type TicketPassOrderStatus =
  | 'PENDING'
  | 'PAID'
  | 'DISPENSED'
  | 'FAILED'
  | 'NEEDS_REVIEW'
  | 'REFUND_PENDING'
  | 'REFUND_NEEDS_ATTENTION'
  | 'REFUND_FAILED'
  | 'REFUNDED';
export type TicketPassRefundStatus = 'pending' | 'processing' | 'needs_attention' | 'failed' | 'processed';
export type TicketPassPaymentProvider = 'paystack' | 'crypto' | 'paycrest';

export interface TicketPass {
  id: string;
  creator_id: string;
  creator_address: string;
  title: string;
  description: string;
  image_url: string | null;
  chain_id: number;
  lock_address: string;
  controller_address: string;
  payout_token_address: string | null;
  payout_token_symbol: string | null;
  token_decimals: number | null;
  token_per_copy_wei: string;
  eth_per_copy_wei: string;
  escrow_token_total_wei: string;
  escrow_eth_total_wei: string;
  max_copies: number;
  max_per_buyer: number;
  key_expiration_duration_seconds: number;
  price_fiat: number;
  price_fiat_kobo: number | null;
  fiat_symbol: string;
  target_event_address: string | null;
  status: TicketPassStatus;
  issuance_enabled: boolean;
  metadata_set: boolean;
  deploy_txn_hash: string | null;
  created_at: string;
  updated_at: string;
}

export interface TicketPassOrder {
  id: string;
  pass_id: string;
  creator_id: string;
  buyer_id: string | null;
  buyer_address: string | null;
  buyer_email: string | null;
  payment_provider: TicketPassPaymentProvider;
  payment_reference: string | null;
  order_ref: string | null;
  amount_fiat: number | null;
  fiat_symbol: string | null;
  chain_id: number;
  lock_address: string;
  status: TicketPassOrderStatus;
  refund_status: TicketPassRefundStatus | null;
  refund_error: string | null;
  refund_requested_at: string | null;
  refund_processed_at: string | null;
  refund_last_synced_at: string | null;
  token_id: string | null;
  grant_dispense_txn_hash: string | null;
  dispensed_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined pass summary (from list-my-ticket-pass-orders).
  ticket_passes?: Pick<
    TicketPass,
    'id' | 'title' | 'image_url' | 'payout_token_symbol' | 'token_per_copy_wei' | 'eth_per_copy_wei' | 'token_decimals' | 'key_expiration_duration_seconds' | 'target_event_address' | 'controller_address'
  > | null;
}

export interface TicketPassOnchainState {
  exists: boolean;
  closed: boolean;
  issuanceEnabled: boolean;
  creator: string;
  payoutToken: string;
  tokenPerCopy: bigint;
  ethPerCopy: bigint;
  maxCopies: bigint;
  redeemedCount: bigint;
  remaining: bigint;
}
