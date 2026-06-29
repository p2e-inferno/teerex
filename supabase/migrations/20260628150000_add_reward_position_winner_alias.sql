-- Optional human-readable name for a declared winner. Off-chain only; the on-chain contract stores
-- the address. Preserved across sync-reward-pool because that upsert omits this column.
ALTER TABLE public.reward_pool_positions
  ADD COLUMN IF NOT EXISTS winner_alias TEXT;
