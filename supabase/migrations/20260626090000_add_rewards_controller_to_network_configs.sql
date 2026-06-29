-- Per-chain address of the deployed TeeRexRewardsControllerV1 contract.
-- The controller custodies prefunded tournament prize pools and pays out to declared winners
-- via pull-based claims. It is a pure escrow: it never deploys or manages event locks.

ALTER TABLE public.network_configs
  ADD COLUMN IF NOT EXISTS rewards_controller_address TEXT;

COMMENT ON COLUMN public.network_configs.rewards_controller_address
  IS 'Deployed TeeRexRewardsControllerV1 address for this chain (prize-pool escrow + winner claims).';
