-- Audit trail for offline claim-code rotations (hash-only; no plaintext secrets)

CREATE TABLE IF NOT EXISTS public.gaming_bundle_claim_code_rotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.gaming_bundle_orders(id) ON DELETE CASCADE,
  vendor_id TEXT NOT NULL,
  vendor_address TEXT NOT NULL,
  old_claim_code_hash TEXT NOT NULL,
  new_claim_code_hash TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT valid_vendor_address_claim_code_rotation CHECK (length(vendor_address) = 42)
);

-- Index ALL foreign keys
CREATE INDEX IF NOT EXISTS idx_gaming_bundle_claim_code_rotations_order_id
  ON public.gaming_bundle_claim_code_rotations(order_id);

CREATE INDEX IF NOT EXISTS idx_gaming_bundle_claim_code_rotations_vendor_id
  ON public.gaming_bundle_claim_code_rotations(vendor_id);

ALTER TABLE public.gaming_bundle_claim_code_rotations ENABLE ROW LEVEL SECURITY;

-- Service role full access (edge functions)
CREATE POLICY "Service role full access on gaming_bundle_claim_code_rotations"
  ON public.gaming_bundle_claim_code_rotations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

