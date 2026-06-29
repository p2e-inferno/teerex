-- Ticket Pass bundles: creator-funded passes that deliver on-chain value (ERC20 and/or native)
-- to buyers after a verified fiat payment. Each pass is backed by its own Unlock lock and an
-- on-chain escrow held by the TeeRexTicketPassControllerV1 contract.
--
-- Wei-denominated amounts are stored as TEXT (exact uint256, no float/NUMERIC precision loss).
-- Fiat amounts mirror the gaming-bundle convention (NUMERIC + *_kobo BIGINT minor units).

-- =============================================================================================
-- ticket_passes
-- =============================================================================================
CREATE TABLE public.ticket_passes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  creator_id TEXT NOT NULL,                 -- Privy user id (sub)
  creator_address TEXT NOT NULL,            -- on-chain pass owner / creator wallet

  title TEXT NOT NULL,
  description TEXT NOT NULL,
  image_url TEXT,

  chain_id BIGINT NOT NULL,
  lock_address TEXT NOT NULL,               -- the pass's Unlock lock
  controller_address TEXT NOT NULL,         -- TeeRexTicketPassControllerV1 that owns the escrow

  -- Payout composition (per redeemed pass). At least one of token/eth amounts is > 0.
  payout_token_address TEXT,                -- ERC20 dispensed; NULL = native-only
  payout_token_symbol TEXT,
  token_decimals INTEGER,
  token_per_copy_wei TEXT NOT NULL DEFAULT '0',
  eth_per_copy_wei TEXT NOT NULL DEFAULT '0',

  -- Total escrow funded at creation (per_copy * max_copies), recorded for display/reconciliation.
  escrow_token_total_wei TEXT NOT NULL DEFAULT '0',
  escrow_eth_total_wei TEXT NOT NULL DEFAULT '0',

  max_copies INTEGER NOT NULL CHECK (max_copies > 0),       -- == lock maxNumberOfKeys
  max_per_buyer INTEGER NOT NULL DEFAULT 1 CHECK (max_per_buyer > 0), -- == lock maxKeysPerAddress
  key_expiration_duration_seconds BIGINT NOT NULL,

  -- Fiat pricing (Paystack NGN first; provider-agnostic).
  price_fiat NUMERIC NOT NULL DEFAULT 0,
  price_fiat_kobo BIGINT,
  fiat_symbol TEXT NOT NULL DEFAULT 'NGN',

  -- Optional link to an event, addressed by the event's lock address (web3-native routing).
  target_event_address TEXT,

  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CLOSED', 'SOLD_OUT')),
  issuance_enabled BOOLEAN NOT NULL DEFAULT true,  -- creator kill-switch for platform issuance
  metadata_set BOOLEAN NOT NULL DEFAULT false,

  deploy_txn_hash TEXT,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

  CONSTRAINT valid_pass_lock_address CHECK (length(lock_address) = 42),
  CONSTRAINT valid_pass_controller_address CHECK (length(controller_address) = 42),
  CONSTRAINT valid_pass_creator_address CHECK (length(creator_address) = 42),
  CONSTRAINT valid_pass_payout_token CHECK (payout_token_address IS NULL OR length(payout_token_address) = 42),
  CONSTRAINT valid_pass_target_event CHECK (target_event_address IS NULL OR length(target_event_address) = 42),
  CONSTRAINT pass_has_payout CHECK (token_per_copy_wei <> '0' OR eth_per_copy_wei <> '0')
);

CREATE UNIQUE INDEX idx_ticket_passes_lock_address_unique
  ON public.ticket_passes(lock_address);
CREATE INDEX idx_ticket_passes_creator_id ON public.ticket_passes(creator_id);
CREATE INDEX idx_ticket_passes_creator_address ON public.ticket_passes(creator_address);
CREATE INDEX idx_ticket_passes_chain_id ON public.ticket_passes(chain_id);
CREATE INDEX idx_ticket_passes_status ON public.ticket_passes(status);
CREATE INDEX idx_ticket_passes_target_event_address
  ON public.ticket_passes(target_event_address)
  WHERE target_event_address IS NOT NULL;

-- =============================================================================================
-- ticket_pass_orders
-- =============================================================================================
CREATE TABLE public.ticket_pass_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  pass_id UUID NOT NULL REFERENCES public.ticket_passes(id) ON DELETE CASCADE,
  creator_id TEXT NOT NULL,                 -- denormalized from pass for access checks
  buyer_id TEXT,                            -- Privy user id of the buyer (when authenticated)
  buyer_address TEXT,
  buyer_email TEXT,

  payment_provider TEXT NOT NULL DEFAULT 'paystack'
    CHECK (payment_provider IN ('paystack', 'crypto', 'paycrest')),
  payment_reference TEXT,
  order_ref TEXT,                           -- bytes32 hex used on-chain for idempotency (grantAndDispense)

  amount_fiat NUMERIC,
  fiat_symbol TEXT DEFAULT 'NGN',

  chain_id BIGINT NOT NULL,
  lock_address TEXT NOT NULL,

  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'PAID', 'DISPENSED', 'FAILED', 'REFUNDED')),

  token_id TEXT,                            -- minted pass key id
  grant_dispense_txn_hash TEXT,             -- single atomic grant+dispense tx

  -- Issuance idempotency / locking (mirrors gaming-bundle issuance).
  issuance_attempts INTEGER NOT NULL DEFAULT 0,
  issuance_lock_id TEXT,
  issuance_locked_at TIMESTAMP WITH TIME ZONE,

  gateway_response JSONB,
  last_error TEXT,
  verified_at TIMESTAMP WITH TIME ZONE,
  dispensed_at TIMESTAMP WITH TIME ZONE,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

  CONSTRAINT valid_pass_order_lock_address CHECK (length(lock_address) = 42),
  CONSTRAINT valid_pass_order_buyer_address CHECK (buyer_address IS NULL OR length(buyer_address) = 42)
);

CREATE INDEX idx_ticket_pass_orders_pass_id ON public.ticket_pass_orders(pass_id);
CREATE INDEX idx_ticket_pass_orders_creator_id ON public.ticket_pass_orders(creator_id);
CREATE INDEX idx_ticket_pass_orders_buyer_id
  ON public.ticket_pass_orders(buyer_id)
  WHERE buyer_id IS NOT NULL;
CREATE INDEX idx_ticket_pass_orders_buyer_address
  ON public.ticket_pass_orders(buyer_address)
  WHERE buyer_address IS NOT NULL;
CREATE INDEX idx_ticket_pass_orders_status ON public.ticket_pass_orders(status);
CREATE INDEX idx_ticket_pass_orders_lock_address ON public.ticket_pass_orders(lock_address);
CREATE UNIQUE INDEX idx_ticket_pass_orders_payment_reference
  ON public.ticket_pass_orders(payment_reference)
  WHERE payment_reference IS NOT NULL;
CREATE UNIQUE INDEX idx_ticket_pass_orders_order_ref
  ON public.ticket_pass_orders(order_ref)
  WHERE order_ref IS NOT NULL;

-- =============================================================================================
-- RLS
-- =============================================================================================
ALTER TABLE public.ticket_passes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_pass_orders ENABLE ROW LEVEL SECURITY;

-- Passes are publicly readable (active, closed and sold-out cards stay visible in the explorer).
-- All writes go exclusively through service-role edge functions.
CREATE POLICY "Anyone can view ticket passes"
  ON public.ticket_passes
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Service role full access on ticket_passes"
  ON public.ticket_passes
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Orders are never read or written directly by clients; edge functions (service role) own them.
CREATE POLICY "Service role full access on ticket_pass_orders"
  ON public.ticket_pass_orders
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================================
-- updated_at triggers
-- =============================================================================================
CREATE TRIGGER update_ticket_passes_updated_at
  BEFORE UPDATE ON public.ticket_passes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ticket_pass_orders_updated_at
  BEFORE UPDATE ON public.ticket_pass_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.ticket_passes IS 'Creator-funded Ticket Pass bundles backed by a dedicated Unlock lock + on-chain escrow.';
COMMENT ON TABLE public.ticket_pass_orders IS 'Fiat (and future crypto/paycrest) orders for ticket passes, with atomic grant+dispense fulfilment tracking.';
COMMENT ON COLUMN public.ticket_pass_orders.order_ref IS 'bytes32 hex passed to grantAndDispense for on-chain idempotency; unique per order.';
COMMENT ON COLUMN public.ticket_passes.target_event_address IS 'Optional linked event, addressed by the event lock address (web3-native routing).';
