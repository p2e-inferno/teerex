-- Track Paystack refund settlement explicitly for ticket pass orders.

ALTER TABLE public.ticket_pass_orders
  ADD COLUMN IF NOT EXISTS refund_status TEXT,
  ADD COLUMN IF NOT EXISTS refund_reference TEXT,
  ADD COLUMN IF NOT EXISTS refund_id TEXT,
  ADD COLUMN IF NOT EXISTS refund_amount_kobo BIGINT,
  ADD COLUMN IF NOT EXISTS refund_error TEXT,
  ADD COLUMN IF NOT EXISTS refund_requested_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS refund_processed_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS refund_last_synced_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.ticket_pass_orders
  DROP CONSTRAINT IF EXISTS ticket_pass_orders_status_check;

ALTER TABLE public.ticket_pass_orders
  ADD CONSTRAINT ticket_pass_orders_status_check
  CHECK (
    status IN (
      'PENDING',
      'PAID',
      'DISPENSED',
      'FAILED',
      'NEEDS_REVIEW',
      'REFUND_PENDING',
      'REFUND_NEEDS_ATTENTION',
      'REFUND_FAILED',
      'REFUNDED'
    )
  );

ALTER TABLE public.ticket_pass_orders
  DROP CONSTRAINT IF EXISTS ticket_pass_orders_refund_status_check;

ALTER TABLE public.ticket_pass_orders
  ADD CONSTRAINT ticket_pass_orders_refund_status_check
  CHECK (
    refund_status IS NULL
    OR refund_status IN ('pending', 'processing', 'needs_attention', 'failed', 'processed')
  );

ALTER TABLE public.ticket_pass_orders
  DROP CONSTRAINT IF EXISTS ticket_pass_orders_refund_amount_check;

ALTER TABLE public.ticket_pass_orders
  ADD CONSTRAINT ticket_pass_orders_refund_amount_check
  CHECK (refund_amount_kobo IS NULL OR refund_amount_kobo >= 0);

CREATE INDEX IF NOT EXISTS idx_ticket_pass_orders_refund_status
  ON public.ticket_pass_orders(refund_status)
  WHERE refund_status IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ticket_pass_orders_refund_id
  ON public.ticket_pass_orders(refund_id)
  WHERE refund_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ticket_pass_orders_refund_reference
  ON public.ticket_pass_orders(refund_reference)
  WHERE refund_reference IS NOT NULL;
