-- Store only hashed claim codes for offline bundle orders
-- Requires pgcrypto for digest()

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.gaming_bundle_orders
  ADD COLUMN IF NOT EXISTS claim_code_hash TEXT;

-- Backfill from any existing plaintext claim codes (if present)
UPDATE public.gaming_bundle_orders
SET claim_code_hash = encode(digest(claim_code, 'sha256'), 'hex')
WHERE claim_code IS NOT NULL
  AND claim_code_hash IS NULL;

DROP INDEX IF EXISTS public.idx_gaming_bundle_orders_claim_code;

-- Remove plaintext claim codes
ALTER TABLE public.gaming_bundle_orders
  DROP COLUMN IF EXISTS claim_code;

CREATE UNIQUE INDEX IF NOT EXISTS idx_gaming_bundle_orders_claim_code_hash_unique
  ON public.gaming_bundle_orders(claim_code_hash)
  WHERE claim_code_hash IS NOT NULL;
