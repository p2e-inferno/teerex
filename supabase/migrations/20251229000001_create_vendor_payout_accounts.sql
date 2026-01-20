-- Create vendor_payout_accounts table for Paystack subaccounts integration
-- Provider-agnostic design for future extensibility (Stripe, M-Pesa, mobile money)

CREATE TABLE public.vendor_payout_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id TEXT NOT NULL,                    -- Privy user ID (creator_id)

  -- Provider-agnostic fields
  provider TEXT NOT NULL DEFAULT 'paystack',  -- paystack|stripe|mpesa|mobile_money
  provider_account_id TEXT,                   -- Provider's numeric account identifier
  provider_account_code TEXT UNIQUE,          -- e.g., "ACCT_8f4s1eq7ml6rlzj" for Paystack

  -- Common payout fields
  business_name TEXT NOT NULL,
  account_holder_name TEXT,                   -- Verified account holder name from provider
  currency TEXT NOT NULL DEFAULT 'NGN',

  -- Bank-specific fields (Paystack/Stripe)
  settlement_bank_code TEXT,                  -- e.g., "044" (Access Bank)
  settlement_bank_name TEXT,                  -- Human-readable bank name
  account_number TEXT,                        -- Bank account number

  -- Mobile money fields (future: M-Pesa, etc.)
  phone_number TEXT,                          -- For mobile money providers
  mobile_network TEXT,                        -- e.g., "safaricom", "mtn"

  -- Platform configuration
  percentage_charge NUMERIC DEFAULT 5,        -- Platform commission (0-100)

  -- Status & verification (automated, not manual approval)
  status TEXT NOT NULL DEFAULT 'pending_verification',
  is_verified BOOLEAN DEFAULT false,          -- Provider verification status
  verification_status TEXT,                   -- Provider-specific verification state
  verification_error TEXT,                    -- Error message if verification failed

  -- Timestamps
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  verified_at TIMESTAMP WITH TIME ZONE,       -- When verification succeeded

  -- Admin oversight (optional, for suspensions)
  suspended_by TEXT,                          -- Admin Privy user ID who suspended
  suspended_at TIMESTAMP WITH TIME ZONE,
  suspension_reason TEXT,                     -- If status = suspended

  -- Provider metadata
  provider_metadata JSONB,                    -- Full provider response data
  settlement_schedule TEXT DEFAULT 'auto',    -- auto|weekly|monthly|manual

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_provider CHECK (provider IN ('paystack', 'stripe', 'mpesa', 'mobile_money')),
  CONSTRAINT valid_status CHECK (status IN ('pending_verification', 'verified', 'verification_failed', 'suspended'))
);

-- Indexes for performance
CREATE INDEX idx_vendor_payout_accounts_vendor_id ON public.vendor_payout_accounts(vendor_id);
CREATE INDEX idx_vendor_payout_accounts_provider_code ON public.vendor_payout_accounts(provider_account_code) WHERE provider_account_code IS NOT NULL;
CREATE INDEX idx_vendor_payout_accounts_status ON public.vendor_payout_accounts(status);
CREATE INDEX idx_vendor_payout_accounts_provider ON public.vendor_payout_accounts(provider);

-- Unique constraint: One verified account per vendor per provider
CREATE UNIQUE INDEX idx_vendor_payout_accounts_unique_verified
  ON public.vendor_payout_accounts(vendor_id, provider)
  WHERE status = 'verified';

-- RLS Policies (with proper SELECT subquery wrapping per CLAUDE.md guidelines)
ALTER TABLE public.vendor_payout_accounts ENABLE ROW LEVEL SECURITY;

-- Vendors can view their own payout accounts
CREATE POLICY "Vendors can view own payout accounts"
  ON public.vendor_payout_accounts
  FOR SELECT
  USING (vendor_id = (SELECT current_setting('request.jwt.claims', true)::json->>'sub'));

-- Vendors can insert their own payout accounts (for submission)
CREATE POLICY "Vendors can submit payout accounts"
  ON public.vendor_payout_accounts
  FOR INSERT
  WITH CHECK (vendor_id = (SELECT current_setting('request.jwt.claims', true)::json->>'sub'));

-- Service role full access (for edge functions and admin operations)
CREATE POLICY "Service role full access on vendor_payout_accounts"
  ON public.vendor_payout_accounts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Updated_at trigger (function already exists from prior migrations)
CREATE TRIGGER update_vendor_payout_accounts_updated_at
  BEFORE UPDATE ON public.vendor_payout_accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add comment for documentation
COMMENT ON TABLE public.vendor_payout_accounts IS 'Stores vendor payout account information for fiat payment routing. Supports multiple providers (Paystack, Stripe, M-Pesa).';
