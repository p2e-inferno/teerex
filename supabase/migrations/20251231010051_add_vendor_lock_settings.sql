-- Add vendor lock settings and purchase tracking
-- This enables admin-configurable vendor access via Unlock Protocol NFT keys
-- Replaces hardcoded VENDOR_LOCK_ADDRESS environment variable

-- ============================================================================
-- Table: vendor_lock_settings
-- ============================================================================
-- Stores vendor lock configuration (only one active lock allowed at a time)

CREATE TABLE public.vendor_lock_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lock_address TEXT NOT NULL CHECK (length(lock_address) = 42 AND lock_address LIKE '0x%'),
  chain_id BIGINT NOT NULL,
  lock_name TEXT NOT NULL,
  lock_symbol TEXT,
  key_price_wei TEXT NOT NULL,
  key_price_display NUMERIC NOT NULL CHECK (key_price_display >= 0),
  currency TEXT NOT NULL,
  currency_address TEXT NOT NULL CHECK (length(currency_address) = 42 AND currency_address LIKE '0x%'),
  expiration_duration_seconds INTEGER CHECK (expiration_duration_seconds IS NULL OR expiration_duration_seconds > 0),
  max_keys_per_address INTEGER DEFAULT 1 CHECK (max_keys_per_address > 0),
  is_transferable BOOLEAN NOT NULL DEFAULT true,
  description TEXT,
  image_url TEXT,
  benefits JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  created_by TEXT
);

-- Indexes for vendor_lock_settings
CREATE UNIQUE INDEX idx_vendor_lock_settings_active
  ON public.vendor_lock_settings(is_active)
  WHERE is_active = true;

CREATE INDEX idx_vendor_lock_settings_lock_address
  ON public.vendor_lock_settings(lock_address);

CREATE INDEX idx_vendor_lock_settings_chain_id
  ON public.vendor_lock_settings(chain_id);

-- Comments
COMMENT ON TABLE public.vendor_lock_settings IS 'Vendor lock configuration. Only one active lock allowed at a time.';
COMMENT ON COLUMN public.vendor_lock_settings.lock_address IS 'Unlock Protocol lock address (immutable after creation)';
COMMENT ON COLUMN public.vendor_lock_settings.chain_id IS 'Blockchain chain ID (immutable after creation)';
COMMENT ON COLUMN public.vendor_lock_settings.key_price_wei IS 'Key price in wei (BigInt as string)';
COMMENT ON COLUMN public.vendor_lock_settings.key_price_display IS 'Human-readable price for display';
COMMENT ON COLUMN public.vendor_lock_settings.currency IS 'Currency type (ETH, USDC, DG, etc.)';
COMMENT ON COLUMN public.vendor_lock_settings.currency_address IS 'Token address or 0x0 for native currency';
COMMENT ON COLUMN public.vendor_lock_settings.benefits IS 'Array of benefit strings for vendor access';
COMMENT ON COLUMN public.vendor_lock_settings.is_active IS 'Only one lock can be active at a time';

-- ============================================================================
-- Table: vendor_lock_purchases
-- ============================================================================
-- Tracks vendor lock purchases for analytics and support

CREATE TABLE public.vendor_lock_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_lock_id UUID NOT NULL REFERENCES public.vendor_lock_settings(id) ON DELETE CASCADE,
  purchaser_id TEXT NOT NULL,
  wallet_address TEXT NOT NULL CHECK (length(wallet_address) = 42 AND wallet_address LIKE '0x%'),
  tx_hash TEXT NOT NULL UNIQUE CHECK (length(tx_hash) = 66 AND tx_hash LIKE '0x%'),
  chain_id BIGINT NOT NULL,
  lock_address TEXT NOT NULL CHECK (length(lock_address) = 42 AND lock_address LIKE '0x%'),
  price_paid_wei TEXT,
  currency TEXT,
  purchase_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Indexes for vendor_lock_purchases (including FK per CLAUDE.md requirement)
CREATE INDEX idx_vendor_lock_purchases_vendor_lock_id
  ON public.vendor_lock_purchases(vendor_lock_id);

CREATE INDEX idx_vendor_lock_purchases_purchaser_id
  ON public.vendor_lock_purchases(purchaser_id);

CREATE INDEX idx_vendor_lock_purchases_wallet
  ON public.vendor_lock_purchases(wallet_address);

CREATE INDEX idx_vendor_lock_purchases_tx_hash
  ON public.vendor_lock_purchases(tx_hash);

-- Comments
COMMENT ON TABLE public.vendor_lock_purchases IS 'Tracks vendor lock purchases for analytics and support';
COMMENT ON COLUMN public.vendor_lock_purchases.purchaser_id IS 'Privy user ID of purchaser';
COMMENT ON COLUMN public.vendor_lock_purchases.wallet_address IS 'Wallet address that made the purchase (lowercase)';
COMMENT ON COLUMN public.vendor_lock_purchases.tx_hash IS 'Transaction hash of the purchase';

-- ============================================================================
-- RLS Policies
-- ============================================================================

-- Enable RLS
ALTER TABLE public.vendor_lock_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_lock_purchases ENABLE ROW LEVEL SECURITY;

-- vendor_lock_settings policies
-- Anyone can view active vendor lock (for "Become Vendor" page)
CREATE POLICY "Anyone can view active vendor lock"
  ON public.vendor_lock_settings
  FOR SELECT
  USING (is_active = true);

-- Service role full access (admin operations via edge functions)
CREATE POLICY "Service role full access on vendor_lock_settings"
  ON public.vendor_lock_settings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- vendor_lock_purchases policies
-- Users can view their own purchases (with SELECT wrapping per CLAUDE.md)
CREATE POLICY "Users view own purchases"
  ON public.vendor_lock_purchases
  FOR SELECT
  USING (purchaser_id = (SELECT current_setting('request.jwt.claims', true)::json->>'sub'));

-- Service role full access
CREATE POLICY "Service role full access on vendor_lock_purchases"
  ON public.vendor_lock_purchases
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- Triggers
-- ============================================================================

-- Updated_at trigger for vendor_lock_settings
CREATE TRIGGER update_vendor_lock_settings_updated_at
  BEFORE UPDATE ON public.vendor_lock_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
