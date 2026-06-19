-- Per-chain address of the deployed TeeRexTicketPassControllerV1 contract.
-- The controller deploys each pass's Unlock lock, escrows the creator's funding, and
-- atomically grants + dispenses pass value to buyers after a verified payment.

ALTER TABLE public.network_configs
  ADD COLUMN IF NOT EXISTS ticket_pass_controller_address TEXT;

COMMENT ON COLUMN public.network_configs.ticket_pass_controller_address
  IS 'Deployed TeeRexTicketPassControllerV1 address for this chain (escrow + fulfilment for Ticket Pass bundles).';
