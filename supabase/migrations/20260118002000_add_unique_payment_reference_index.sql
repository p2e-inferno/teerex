-- Ensure upsert on payment_reference works with ON CONFLICT
CREATE UNIQUE INDEX IF NOT EXISTS idx_gaming_bundle_orders_payment_reference_unique
  ON public.gaming_bundle_orders(payment_reference);

COMMENT ON INDEX idx_gaming_bundle_orders_payment_reference_unique
  IS 'Unique index for payment_reference to support ON CONFLICT upserts in edge functions.';
