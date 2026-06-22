DROP INDEX IF EXISTS public.idx_ticket_pass_orders_payment_reference;

ALTER TABLE public.ticket_pass_orders
  ADD COLUMN IF NOT EXISTS issuance_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS issuance_lock_id TEXT,
  ADD COLUMN IF NOT EXISTS issuance_locked_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ticket_pass_orders_payment_reference
  ON public.ticket_pass_orders(payment_reference);

CREATE INDEX IF NOT EXISTS idx_ticket_pass_orders_issuance_locked_at
  ON public.ticket_pass_orders(issuance_locked_at)
  WHERE issuance_locked_at IS NOT NULL;

COMMENT ON INDEX public.idx_ticket_pass_orders_payment_reference
  IS 'Unique index for payment_reference to support ON CONFLICT upserts in edge functions.';

NOTIFY pgrst, 'reload schema';
