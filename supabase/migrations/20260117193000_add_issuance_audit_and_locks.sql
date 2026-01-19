-- Add auditing + issuance locking for bundle orders and Paystack transactions
-- This supports deterministic, idempotent webhook processing and vendor retries.

ALTER TABLE public.gaming_bundle_orders
  ADD COLUMN IF NOT EXISTS gateway_response JSONB,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS issuance_lock_id TEXT,
  ADD COLUMN IF NOT EXISTS issuance_locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS issuance_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS issuance_last_error TEXT;

ALTER TABLE public.paystack_transactions
  ADD COLUMN IF NOT EXISTS issuance_lock_id TEXT,
  ADD COLUMN IF NOT EXISTS issuance_locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS issuance_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS issuance_last_error TEXT;

-- Optional operational indexes (stuck issuance inspection)
CREATE INDEX IF NOT EXISTS idx_gaming_bundle_orders_issuance_locked_at
  ON public.gaming_bundle_orders(issuance_locked_at)
  WHERE issuance_locked_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_paystack_transactions_issuance_locked_at
  ON public.paystack_transactions(issuance_locked_at)
  WHERE issuance_locked_at IS NOT NULL;

