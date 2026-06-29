-- Add NEEDS_REVIEW to ticket_pass_orders.status. A grant that fails for a reason that means
-- "paid but nothing delivered and a retry won't help" (pass closed/disabled, sold out, granter
-- misconfigured, lock migration required, …) is flagged for manual reconciliation/refund rather
-- than left in a silent retry loop. Refunds are issued out-of-band; this status drives the queue.

ALTER TABLE public.ticket_pass_orders
  DROP CONSTRAINT IF EXISTS ticket_pass_orders_status_check;

ALTER TABLE public.ticket_pass_orders
  ADD CONSTRAINT ticket_pass_orders_status_check
  CHECK (status IN ('PENDING', 'PAID', 'DISPENSED', 'FAILED', 'NEEDS_REVIEW', 'REFUNDED'));
