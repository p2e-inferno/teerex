-- Reward pools: prefunded tournament prize escrow held on-chain by TeeRexRewardsControllerV1.
-- These tables are an indexed MIRROR of on-chain state. Every row is written by a service-role
-- edge function only after the field is verified against the contract; the chain is the source of
-- truth and the DB follows. Wei-denominated amounts are stored as TEXT (exact uint256).
--
-- Access is fully server-mediated: no anon/authenticated grants. Public reward data (terms,
-- declared winners) is served through read edge functions; dispute rows carry reporter identity
-- and free-text and must never be client-readable.

-- =============================================================================================
-- reward_pools
-- =============================================================================================
CREATE TABLE public.reward_pools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  chain_id BIGINT NOT NULL,
  controller_address TEXT NOT NULL,            -- TeeRexRewardsControllerV1 holding the escrow
  pool_id BIGINT NOT NULL,                      -- on-chain sequential pool id

  creator_id TEXT NOT NULL,                     -- Privy user id (sub)
  creator_address TEXT NOT NULL,                -- on-chain creator wallet (lock manager of the event)

  event_lock_address TEXT NOT NULL,             -- associated event's Unlock lock (read-only link)
  attendance_controller_address TEXT,           -- NULL = non-protected; else the early-exit oracle

  payout_token_address TEXT,                    -- ERC20 paid out; NULL = native ETH
  payout_token_symbol TEXT,
  token_decimals INTEGER,

  total_funded_wei TEXT NOT NULL,               -- == sum(position amounts)
  claimed_amount_wei TEXT NOT NULL DEFAULT '0', -- running total paid to winners

  claim_start TIMESTAMP WITH TIME ZONE NOT NULL,
  claim_end TIMESTAMP WITH TIME ZONE NOT NULL,  -- base end; effective end extends by frozen duration
  challenge_window_secs BIGINT NOT NULL,
  frozen_accrued_secs BIGINT NOT NULL DEFAULT 0,

  position_count INTEGER NOT NULL CHECK (position_count > 0),

  rules_hash TEXT NOT NULL,                      -- bytes32 hex anchoring the off-chain rules doc
  rules_uri TEXT,

  status TEXT NOT NULL DEFAULT 'funded'
    CHECK (status IN ('funded', 'results_pending', 'claiming', 'frozen', 'expired', 'closed')),
  frozen BOOLEAN NOT NULL DEFAULT false,

  tx_hash TEXT,                                 -- pool creation tx

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

  CONSTRAINT valid_reward_controller_address CHECK (length(controller_address) = 42),
  CONSTRAINT valid_reward_creator_address CHECK (length(creator_address) = 42),
  CONSTRAINT valid_reward_event_lock_address CHECK (length(event_lock_address) = 42),
  CONSTRAINT valid_reward_attendance_address
    CHECK (attendance_controller_address IS NULL OR length(attendance_controller_address) = 42),
  CONSTRAINT valid_reward_payout_token
    CHECK (payout_token_address IS NULL OR length(payout_token_address) = 42)
);

-- Upsert target for create/sync edge functions (must be a non-partial unique index).
CREATE UNIQUE INDEX idx_reward_pools_onchain_unique
  ON public.reward_pools(controller_address, chain_id, pool_id);
CREATE INDEX idx_reward_pools_event_lock ON public.reward_pools(event_lock_address, chain_id, status);
CREATE INDEX idx_reward_pools_creator_id ON public.reward_pools(creator_id);
CREATE INDEX idx_reward_pools_creator_address ON public.reward_pools(creator_address);
CREATE INDEX idx_reward_pools_status ON public.reward_pools(status);

-- =============================================================================================
-- reward_pool_positions
-- =============================================================================================
CREATE TABLE public.reward_pool_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  reward_pool_id UUID NOT NULL REFERENCES public.reward_pools(id) ON DELETE CASCADE,
  placement INTEGER NOT NULL CHECK (placement >= 1),   -- 1-based
  amount_wei TEXT NOT NULL,

  winner_address TEXT,                           -- NULL until assigned
  assigned_at TIMESTAMP WITH TIME ZONE,
  hold_until TIMESTAMP WITH TIME ZONE,           -- free dispute hold expiry

  claimed BOOLEAN NOT NULL DEFAULT false,
  claimed_at TIMESTAMP WITH TIME ZONE,
  claim_tx_hash TEXT,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

  CONSTRAINT valid_reward_position_winner
    CHECK (winner_address IS NULL OR length(winner_address) = 42)
);

CREATE UNIQUE INDEX idx_reward_positions_pool_placement_unique
  ON public.reward_pool_positions(reward_pool_id, placement);
CREATE INDEX idx_reward_positions_pool_id ON public.reward_pool_positions(reward_pool_id);
CREATE INDEX idx_reward_positions_winner
  ON public.reward_pool_positions(winner_address)
  WHERE winner_address IS NOT NULL;

-- =============================================================================================
-- reward_pool_managers
-- =============================================================================================
CREATE TABLE public.reward_pool_managers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  reward_pool_id UUID NOT NULL REFERENCES public.reward_pools(id) ON DELETE CASCADE,
  manager_address TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  tx_hash TEXT,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

  CONSTRAINT valid_reward_manager_address CHECK (length(manager_address) = 42)
);

CREATE UNIQUE INDEX idx_reward_managers_pool_addr_unique
  ON public.reward_pool_managers(reward_pool_id, manager_address);
CREATE INDEX idx_reward_managers_pool_id ON public.reward_pool_managers(reward_pool_id);

-- =============================================================================================
-- reward_pool_disputes
-- =============================================================================================
CREATE TABLE public.reward_pool_disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  reward_pool_id UUID NOT NULL REFERENCES public.reward_pools(id) ON DELETE CASCADE,
  placement INTEGER,                             -- NULL = pool-level dispute

  disputer_id TEXT NOT NULL,                     -- Privy user id (sub)
  disputer_address TEXT NOT NULL,

  category TEXT NOT NULL DEFAULT 'other'
    CHECK (category IN ('wrong_winner', 'rules_breach', 'collusion', 'not_paid', 'other')),
  reason_text TEXT,
  evidence_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  reason_hash TEXT NOT NULL,                     -- bytes32 hex anchoring this record on-chain

  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'under_review', 'upheld', 'rejected')),
  resolution_note TEXT,
  resolution_hash TEXT,
  resolved_by TEXT,                              -- arbitrator/admin Privy id
  resolved_at TIMESTAMP WITH TIME ZONE,

  onchain_tx_hash TEXT,                          -- optional client-sent raiseDispute tx

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

  CONSTRAINT valid_reward_disputer_address CHECK (length(disputer_address) = 42)
);

CREATE INDEX idx_reward_disputes_pool_id ON public.reward_pool_disputes(reward_pool_id);
CREATE INDEX idx_reward_disputes_status ON public.reward_pool_disputes(status);
CREATE INDEX idx_reward_disputes_disputer_id ON public.reward_pool_disputes(disputer_id);

-- =============================================================================================
-- RLS + grants (server-only; all client access via service-role edge functions)
-- =============================================================================================
ALTER TABLE public.reward_pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_pool_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_pool_managers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_pool_disputes ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.reward_pools TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.reward_pool_positions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.reward_pool_managers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.reward_pool_disputes TO service_role;

CREATE POLICY "Service role full access on reward_pools"
  ON public.reward_pools FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on reward_pool_positions"
  ON public.reward_pool_positions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on reward_pool_managers"
  ON public.reward_pool_managers FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on reward_pool_disputes"
  ON public.reward_pool_disputes FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =============================================================================================
-- updated_at triggers (reuse existing shared function)
-- =============================================================================================
CREATE TRIGGER update_reward_pools_updated_at
  BEFORE UPDATE ON public.reward_pools
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_reward_pool_positions_updated_at
  BEFORE UPDATE ON public.reward_pool_positions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_reward_pool_managers_updated_at
  BEFORE UPDATE ON public.reward_pool_managers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_reward_pool_disputes_updated_at
  BEFORE UPDATE ON public.reward_pool_disputes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.reward_pools IS 'On-chain mirror of TeeRexRewardsControllerV1 prize pools; chain is source of truth.';
COMMENT ON TABLE public.reward_pool_positions IS 'Per-placement prize amounts and assigned winners for a reward pool.';
COMMENT ON TABLE public.reward_pool_managers IS 'Delegated assign-only managers per reward pool (mirror of on-chain isManager).';
COMMENT ON TABLE public.reward_pool_disputes IS 'Ticket-holder dispute records; service-role only (carries reporter identity + free text).';
COMMENT ON COLUMN public.reward_pools.rules_hash IS 'keccak256 of the off-chain reward-rules doc rendered in the UI; tamper-evident.';
