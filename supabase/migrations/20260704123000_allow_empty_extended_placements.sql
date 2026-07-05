-- Allow organizers to clear their provisional extended standings by submitting an empty set.
-- This preserves the existing atomic replace semantics and keeps final sheets locked.

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

  IF v_placements IS NOT NULL AND array_length(v_placements, 1) > 0 THEN
    IF (SELECT count(DISTINCT w) FROM unnest(v_wallets) w) <> array_length(v_wallets, 1) THEN
      RAISE EXCEPTION 'duplicate_wallets';
    END IF;
    IF (SELECT count(DISTINCT p) FROM unnest(v_placements) p) <> array_length(v_placements, 1) THEN
      RAISE EXCEPTION 'duplicate_placements';
    END IF;
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
  END IF;

  DELETE FROM public.game_results
  WHERE event_id = p_event_id AND source = 'organizer' AND status = 'provisional';

  IF v_placements IS NULL OR array_length(v_placements, 1) = 0 THEN
    RETURN 0;
  END IF;

  IF v_event.game_id IS NOT NULL THEN
    SELECT COALESCE((g.scoring_profile->>'review_window_hours')::int, 72)
    INTO v_review_hours
    FROM public.games g WHERE g.id = v_event.game_id;
  END IF;
  v_hold_until := now() + make_interval(hours => v_review_hours);

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_entries, '[]'::jsonb))
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
