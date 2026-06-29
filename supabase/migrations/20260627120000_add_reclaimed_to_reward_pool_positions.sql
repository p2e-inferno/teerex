-- Mirror the on-chain per-position `reclaimed` flag so off-chain reads (lists, badges, and the
-- card's degraded fallback) never present a reclaimed prize as still live. Defaults to false;
-- sync-reward-pool backfills the true on-chain value on the next sync.
ALTER TABLE public.reward_pool_positions
  ADD COLUMN reclaimed BOOLEAN NOT NULL DEFAULT false;
