-- Leaderboards P1: admin-curated game catalog + per-event result ledger.
-- Results mirror verified reward-pool placements (source='reward_pool') and organizer-extended
-- placements below the prize line (source='organizer'). Points are always derived from the
-- game's scoring_profile at read/recompute time and are never stored on result rows, so scoring
-- formula changes never rewrite history.
--
-- Access is fully server-mediated: no anon/authenticated grants. Reads go through the
-- `leaderboards` edge function; writes happen only via service-role ingestion hooks and RPCs.

-- =============================================================================================
-- games (admin-curated catalog)
-- =============================================================================================
CREATE TABLE public.games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  cover_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Pluggable scoring config. `type` discriminates future models (e.g. 'elo') without migration:
  -- {"type":"placement_points","podium":{"1":100,"2":80,"3":65},
  --  "curve":{"kind":"linear","from":55,"floor":1},"participation":5,
  --  "review_window_hours":72,"min_participants":0}
  scoring_profile JSONB NOT NULL DEFAULT '{
    "type": "placement_points",
    "podium": {"1": 100, "2": 80, "3": 65},
    "curve": {"kind": "linear", "from": 55, "floor": 1},
    "participation": 5,
    "review_window_hours": 72,
    "min_participants": 0
  }'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Upsert target for admin-leaderboards upsert-game (must be a non-partial unique index).
CREATE UNIQUE INDEX idx_games_slug_unique ON public.games(slug);
CREATE INDEX idx_games_is_active ON public.games(is_active);

-- =============================================================================================
-- game_results (append-mostly result ledger; points never stored)
-- =============================================================================================
CREATE TABLE public.game_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  game_id UUID REFERENCES public.games(id),              -- NULL until the event has a game set
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  reward_pool_id UUID REFERENCES public.reward_pools(id) ON DELETE CASCADE,

  organizer_id TEXT NOT NULL,                            -- events.creator_id (Privy sub); circuit key
  player_id TEXT,                                        -- resolved Privy sub; NULL until wallet links
  wallet_address TEXT NOT NULL,

  placement INTEGER NOT NULL CHECK (placement >= 1),     -- participation rows use the tied-rank floor
  participant_count INTEGER,

  result_kind TEXT NOT NULL DEFAULT 'placement'
    CHECK (result_kind IN ('placement', 'participation', 'match', 'attendance')),
  source TEXT NOT NULL DEFAULT 'reward_pool'
    CHECK (source IN ('reward_pool', 'organizer', 'attestation', 'manual')),
  status TEXT NOT NULL DEFAULT 'provisional'
    CHECK (status IN ('provisional', 'final', 'voided')),

  -- Ranked-at-ingest snapshot: official (Tier C) boards only ever count rows that were ranked
  -- when they occurred, so events can never be promoted to official retroactively.
  is_ranked BOOLEAN NOT NULL DEFAULT false,

  -- Upsert target (non-partial unique). Formats: rp:{pool_id}:{placement},
  -- org:{event_id}:{wallet}, pt:{event_id}:{wallet}.
  idempotency_key TEXT NOT NULL,

  occurred_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  hold_until TIMESTAMP WITH TIME ZONE,
  finalized_at TIMESTAMP WITH TIME ZONE,
  voided_at TIMESTAMP WITH TIME ZONE,
  void_reason TEXT,

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

  CONSTRAINT valid_game_result_wallet CHECK (length(wallet_address) = 42)
);

CREATE UNIQUE INDEX idx_game_results_idempotency_unique ON public.game_results(idempotency_key);
CREATE INDEX idx_game_results_event_id ON public.game_results(event_id);
CREATE INDEX idx_game_results_reward_pool_id
  ON public.game_results(reward_pool_id) WHERE reward_pool_id IS NOT NULL;
CREATE INDEX idx_game_results_game_status
  ON public.game_results(game_id, status) WHERE game_id IS NOT NULL;
CREATE INDEX idx_game_results_organizer_id ON public.game_results(organizer_id);
CREATE INDEX idx_game_results_player_id
  ON public.game_results(player_id) WHERE player_id IS NOT NULL;
CREATE INDEX idx_game_results_wallet ON public.game_results(wallet_address);
CREATE INDEX idx_game_results_finalize_scan
  ON public.game_results(hold_until) WHERE status = 'provisional';

-- =============================================================================================
-- game_id on events / event_drafts (game selection must survive the draft round-trip)
-- =============================================================================================
ALTER TABLE public.events ADD COLUMN game_id UUID REFERENCES public.games(id);
CREATE INDEX idx_events_game_id ON public.events(game_id) WHERE game_id IS NOT NULL;

ALTER TABLE public.event_drafts ADD COLUMN game_id UUID REFERENCES public.games(id);
CREATE INDEX idx_event_drafts_game_id ON public.event_drafts(game_id) WHERE game_id IS NOT NULL;

-- =============================================================================================
-- 'standings' dispute category: ticket holders report organizer-extended placements through the
-- existing dispute pipeline; open standings disputes block organizer-row finalization.
-- =============================================================================================
ALTER TABLE public.reward_pool_disputes
  DROP CONSTRAINT IF EXISTS reward_pool_disputes_category_check;
ALTER TABLE public.reward_pool_disputes
  ADD CONSTRAINT reward_pool_disputes_category_check
  CHECK (category IN ('wrong_winner', 'rules_breach', 'collusion', 'not_paid', 'standings', 'other'));

-- =============================================================================================
-- RPC: ingest_reward_pool_results
-- Idempotent mirror of assigned reward-pool positions into game_results. A plain upsert cannot
-- express "never clobber final/voided rows", so the transition rules live here.
-- =============================================================================================
CREATE OR REPLACE FUNCTION public.ingest_reward_pool_results(p_rows jsonb)
RETURNS integer
SET search_path = 'public'
LANGUAGE plpgsql
AS $$
DECLARE
  v_item jsonb;
  v_count integer := 0;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_rows, '[]'::jsonb))
  LOOP
    IF COALESCE((v_item->>'reclaimed')::boolean, false) THEN
      UPDATE public.game_results
      SET status = 'voided', void_reason = 'reclaimed', voided_at = now()
      WHERE idempotency_key = v_item->>'idempotency_key'
        AND status = 'provisional';
      CONTINUE;
    END IF;

    INSERT INTO public.game_results (
      game_id, event_id, reward_pool_id, organizer_id, player_id, wallet_address,
      placement, result_kind, source, is_ranked, idempotency_key, occurred_at, hold_until, metadata
    ) VALUES (
      NULLIF(v_item->>'game_id', '')::uuid,
      (v_item->>'event_id')::uuid,
      NULLIF(v_item->>'reward_pool_id', '')::uuid,
      v_item->>'organizer_id',
      NULLIF(v_item->>'player_id', ''),
      lower(v_item->>'wallet_address'),
      (v_item->>'placement')::int,
      'placement',
      'reward_pool',
      COALESCE((v_item->>'is_ranked')::boolean, false),
      v_item->>'idempotency_key',
      COALESCE(NULLIF(v_item->>'occurred_at', '')::timestamptz, now()),
      NULLIF(v_item->>'hold_until', '')::timestamptz,
      COALESCE(v_item->'metadata', '{}'::jsonb)
    )
    ON CONFLICT (idempotency_key) DO UPDATE SET
      game_id = COALESCE(EXCLUDED.game_id, public.game_results.game_id),
      player_id = COALESCE(EXCLUDED.player_id, public.game_results.player_id),
      wallet_address = EXCLUDED.wallet_address,
      occurred_at = EXCLUDED.occurred_at,
      hold_until = EXCLUDED.hold_until,
      metadata = EXCLUDED.metadata
    WHERE public.game_results.status = 'provisional';

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ingest_reward_pool_results(jsonb) TO service_role;

-- =============================================================================================
-- RPC: submit_extended_placements
-- Atomically replaces an event's provisional organizer-extended placements. The prize floor
-- check makes it impossible for an organizer submission to contradict on-chain results.
-- =============================================================================================
CREATE OR REPLACE FUNCTION public.submit_extended_placements(
  p_event_id uuid,
  p_entries jsonb
)
RETURNS integer
SET search_path = 'public'
LANGUAGE plpgsql
AS $$
DECLARE
  v_event public.events%ROWTYPE;
  v_floor integer;
  v_hold_until timestamptz;
  v_review_hours integer := 72;
  v_item jsonb;
  v_placements integer[];
  v_wallets text[];
  v_count integer := 0;
BEGIN
  SELECT * INTO v_event FROM public.events WHERE id = p_event_id;
  IF v_event.id IS NULL THEN
    RAISE EXCEPTION 'event_not_found';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.game_results
    WHERE event_id = p_event_id AND source = 'organizer' AND status = 'final'
  ) THEN
    RAISE EXCEPTION 'standings_already_final';
  END IF;

  -- Prize floor: extended placements must sit strictly below every prize position of every
  -- pool attached to this event's lock (position_count, not assigned winners, so unassigned
  -- prize slots still reserve their placements).
  SELECT COALESCE(MAX(rp.position_count), 0) INTO v_floor
  FROM public.reward_pools rp
  WHERE rp.event_lock_address = lower(v_event.lock_address);

  IF v_floor = 0 THEN
    RAISE EXCEPTION 'no_reward_pool_for_event';
  END IF;

  SELECT array_agg((e->>'placement')::int ORDER BY (e->>'placement')::int),
         array_agg(lower(e->>'wallet'))
  INTO v_placements, v_wallets
  FROM jsonb_array_elements(COALESCE(p_entries, '[]'::jsonb)) e;

  IF v_placements IS NULL OR array_length(v_placements, 1) = 0 THEN
    RAISE EXCEPTION 'entries_required';
  END IF;
  IF (SELECT count(DISTINCT w) FROM unnest(v_wallets) w) <> array_length(v_wallets, 1) THEN
    RAISE EXCEPTION 'duplicate_wallets';
  END IF;
  IF (SELECT count(DISTINCT p) FROM unnest(v_placements) p) <> array_length(v_placements, 1) THEN
    RAISE EXCEPTION 'duplicate_placements';
  END IF;
  -- Contiguous from the prize floor: no gaps that would imply unstated placements.
  IF v_placements[1] <> v_floor + 1
     OR v_placements[array_length(v_placements, 1)] <> v_floor + array_length(v_placements, 1) THEN
    RAISE EXCEPTION 'placements_must_be_contiguous_from_%', v_floor + 1;
  END IF;

  IF EXISTS (
    SELECT 1 FROM unnest(v_wallets) w
    WHERE NOT EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.event_id = p_event_id AND lower(t.owner_wallet) = w AND t.status = 'active'
    )
  ) THEN
    RAISE EXCEPTION 'wallet_not_a_ticket_holder';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.game_results gr
    WHERE gr.event_id = p_event_id AND gr.source = 'reward_pool' AND gr.status <> 'voided'
      AND gr.wallet_address = ANY (v_wallets)
  ) THEN
    RAISE EXCEPTION 'wallet_already_has_prize_placement';
  END IF;

  IF v_event.game_id IS NOT NULL THEN
    SELECT COALESCE((g.scoring_profile->>'review_window_hours')::int, 72)
    INTO v_review_hours
    FROM public.games g WHERE g.id = v_event.game_id;
  END IF;
  v_hold_until := now() + make_interval(hours => v_review_hours);

  -- Replace the provisional sheet atomically; voided rows for resubmitted wallets are
  -- resurrected via the idempotency-key upsert so audit history is never duplicated.
  DELETE FROM public.game_results
  WHERE event_id = p_event_id AND source = 'organizer' AND status = 'provisional';

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_entries)
  LOOP
    INSERT INTO public.game_results (
      game_id, event_id, organizer_id, player_id, wallet_address,
      placement, result_kind, source, idempotency_key, occurred_at, hold_until
    ) VALUES (
      v_event.game_id,
      p_event_id,
      v_event.creator_id,
      NULLIF(v_item->>'player_id', ''),
      lower(v_item->>'wallet'),
      (v_item->>'placement')::int,
      'placement',
      'organizer',
      'org:' || p_event_id::text || ':' || lower(v_item->>'wallet'),
      now(),
      v_hold_until
    )
    ON CONFLICT (idempotency_key) DO UPDATE SET
      game_id = EXCLUDED.game_id,
      player_id = COALESCE(EXCLUDED.player_id, public.game_results.player_id),
      placement = EXCLUDED.placement,
      status = 'provisional',
      void_reason = NULL,
      voided_at = NULL,
      finalized_at = NULL,
      occurred_at = EXCLUDED.occurred_at,
      hold_until = EXCLUDED.hold_until
    WHERE public.game_results.status <> 'final';

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_extended_placements(uuid, jsonb) TO service_role;

-- =============================================================================================
-- RPC: finalize_game_results
-- One transaction: void tainted rows, finalize rows past their hold, backfill event context,
-- then materialize Participated rows for settled events.
-- =============================================================================================
CREATE OR REPLACE FUNCTION public.finalize_game_results()
RETURNS jsonb
SET search_path = 'public'
LANGUAGE plpgsql
AS $$
DECLARE
  v_voided integer := 0;
  v_finalized integer := 0;
  v_participation integer := 0;
  v_tmp integer;
BEGIN
  -- Void reward-pool rows whose position was reclaimed on-chain.
  UPDATE public.game_results gr
  SET status = 'voided', void_reason = 'reclaimed', voided_at = now()
  FROM public.reward_pool_positions rpp
  WHERE gr.source = 'reward_pool' AND gr.status = 'provisional'
    AND rpp.reward_pool_id = gr.reward_pool_id AND rpp.placement = gr.placement
    AND rpp.reclaimed;
  GET DIAGNOSTICS v_tmp = ROW_COUNT; v_voided := v_voided + v_tmp;

  -- Void reward-pool rows hit by an upheld placement-level dispute.
  UPDATE public.game_results gr
  SET status = 'voided', void_reason = 'dispute_upheld', voided_at = now()
  FROM public.reward_pool_disputes d
  WHERE gr.source = 'reward_pool' AND gr.status = 'provisional'
    AND d.reward_pool_id = gr.reward_pool_id AND d.status = 'upheld'
    AND d.category <> 'standings' AND d.placement = gr.placement;
  GET DIAGNOSTICS v_tmp = ROW_COUNT; v_voided := v_voided + v_tmp;

  -- An upheld pool-level dispute taints the pool's whole result set.
  UPDATE public.game_results gr
  SET status = 'voided', void_reason = 'dispute_upheld', voided_at = now()
  FROM public.reward_pool_disputes d
  WHERE gr.source = 'reward_pool' AND gr.status = 'provisional'
    AND d.reward_pool_id = gr.reward_pool_id AND d.status = 'upheld'
    AND d.category <> 'standings' AND d.placement IS NULL;
  GET DIAGNOSTICS v_tmp = ROW_COUNT; v_voided := v_voided + v_tmp;

  -- Upheld standings or pool-level disputes taint the organizer-extended sheet.
  UPDATE public.game_results gr
  SET status = 'voided', void_reason = 'dispute_upheld', voided_at = now()
  WHERE gr.source = 'organizer' AND gr.status = 'provisional'
    AND EXISTS (
      SELECT 1
      FROM public.reward_pool_disputes d
      JOIN public.reward_pools rp ON rp.id = d.reward_pool_id
      JOIN public.events e ON lower(e.lock_address) = rp.event_lock_address
      WHERE e.id = gr.event_id AND d.status = 'upheld'
        AND (d.category = 'standings' OR d.placement IS NULL)
    );
  GET DIAGNOSTICS v_tmp = ROW_COUNT; v_voided := v_voided + v_tmp;

  -- The prize floor can grow after submission (a bigger pool added); void any overlap.
  UPDATE public.game_results gr
  SET status = 'voided', void_reason = 'prize_floor_overlap', voided_at = now()
  WHERE gr.source = 'organizer' AND gr.status = 'provisional'
    AND gr.placement <= (
      SELECT COALESCE(MAX(rp.position_count), 0)
      FROM public.reward_pools rp
      JOIN public.events e ON lower(e.lock_address) = rp.event_lock_address
      WHERE e.id = gr.event_id
    );
  GET DIAGNOSTICS v_tmp = ROW_COUNT; v_voided := v_voided + v_tmp;

  -- Finalize reward-pool rows past their hold: pool must not be frozen (frozen extends the
  -- hold on-chain, so the mirrored hold_until can be stale) and no live dispute may touch them.
  UPDATE public.game_results gr
  SET status = 'final', finalized_at = now(),
      game_id = COALESCE(gr.game_id, e.game_id)
  FROM public.reward_pools rp, public.events e
  WHERE gr.source = 'reward_pool' AND gr.status = 'provisional'
    AND rp.id = gr.reward_pool_id AND e.id = gr.event_id
    AND gr.hold_until IS NOT NULL AND gr.hold_until < now()
    AND NOT rp.frozen
    AND NOT EXISTS (
      SELECT 1 FROM public.reward_pool_disputes d
      WHERE d.reward_pool_id = gr.reward_pool_id
        AND d.status IN ('open', 'under_review')
        AND d.category <> 'standings'
        AND (d.placement IS NULL OR d.placement = gr.placement)
    );
  GET DIAGNOSTICS v_tmp = ROW_COUNT; v_finalized := v_finalized + v_tmp;

  -- Finalize organizer rows past their review window: blocked by any live standings dispute
  -- or pool-level dispute on the event's pools (either could void the sheet if upheld).
  UPDATE public.game_results gr
  SET status = 'final', finalized_at = now(),
      game_id = COALESCE(gr.game_id, e.game_id)
  FROM public.events e
  WHERE gr.source = 'organizer' AND gr.status = 'provisional'
    AND e.id = gr.event_id
    AND gr.hold_until IS NOT NULL AND gr.hold_until < now()
    AND NOT EXISTS (
      SELECT 1
      FROM public.reward_pool_disputes d
      JOIN public.reward_pools rp ON rp.id = d.reward_pool_id
      WHERE lower(e.lock_address) = rp.event_lock_address
        AND d.status IN ('open', 'under_review')
        AND (d.category = 'standings' OR d.placement IS NULL)
    );
  GET DIAGNOSTICS v_tmp = ROW_COUNT; v_finalized := v_finalized + v_tmp;

  -- Materialize the Participated tier once an event's sheet is settled (has final placements,
  -- nothing still provisional). Wallets with a live placement row are excluded.
  INSERT INTO public.game_results (
    game_id, event_id, organizer_id, wallet_address, placement, participant_count,
    result_kind, source, status, idempotency_key, occurred_at, finalized_at
  )
  SELECT
    e.game_id, e.id, e.creator_id, lower(t.owner_wallet),
    stats.max_placement + 1,
    stats.ticket_count,
    'participation', 'organizer', 'final',
    'pt:' || e.id::text || ':' || lower(t.owner_wallet),
    now(), now()
  FROM public.events e
  JOIN LATERAL (
    SELECT MAX(gr.placement) AS max_placement,
           (SELECT count(*) FROM public.tickets tc
             WHERE tc.event_id = e.id AND tc.status = 'active') AS ticket_count
    FROM public.game_results gr
    WHERE gr.event_id = e.id AND gr.result_kind = 'placement' AND gr.status = 'final'
  ) stats ON stats.max_placement IS NOT NULL
  JOIN public.tickets t ON t.event_id = e.id AND t.status = 'active'
  WHERE NOT EXISTS (
      SELECT 1 FROM public.game_results p
      WHERE p.event_id = e.id AND p.result_kind = 'placement' AND p.status = 'provisional'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.game_results x
      WHERE x.event_id = e.id AND x.result_kind = 'placement' AND x.status <> 'voided'
        AND x.wallet_address = lower(t.owner_wallet)
    )
  ON CONFLICT (idempotency_key) DO NOTHING;
  GET DIAGNOSTICS v_participation = ROW_COUNT;

  -- Stamp participant_count on rows finalized without one.
  UPDATE public.game_results gr
  SET participant_count = (
    SELECT count(*) FROM public.tickets tc
    WHERE tc.event_id = gr.event_id AND tc.status = 'active'
  )
  WHERE gr.status = 'final' AND gr.participant_count IS NULL;

  RETURN jsonb_build_object(
    'voided', v_voided,
    'finalized', v_finalized,
    'participation_rows', v_participation
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.finalize_game_results() TO service_role;

-- =============================================================================================
-- RLS + grants (server-only; all client access via service-role edge functions)
-- =============================================================================================
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_results ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.games TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.game_results TO service_role;

CREATE POLICY "Service role full access on games"
  ON public.games FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on game_results"
  ON public.game_results FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =============================================================================================
-- updated_at triggers (reuse existing shared function)
-- =============================================================================================
CREATE TRIGGER update_games_updated_at
  BEFORE UPDATE ON public.games
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_game_results_updated_at
  BEFORE UPDATE ON public.game_results
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================================================
-- Seed the currently-supported games (admin can edit via /admin/games)
-- =============================================================================================
INSERT INTO public.games (slug, name, category) VALUES
  ('codm', 'Call of Duty: Mobile', 'shooter'),
  ('chess', 'Chess', 'strategy')
ON CONFLICT (slug) DO NOTHING;

COMMENT ON TABLE public.games IS 'Admin-curated game catalog; scoring_profile drives derived leaderboard points.';
COMMENT ON TABLE public.game_results IS 'Per-event result ledger (reward-pool placements, organizer-extended placements, participation); points derived, never stored.';
COMMENT ON COLUMN public.game_results.is_ranked IS 'Snapshot at ingest; official boards only count rows ranked when they occurred.';
