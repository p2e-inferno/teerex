CREATE OR REPLACE FUNCTION public.create_reward_pool_mirror(
  p_pool jsonb,
  p_positions jsonb,
  p_managers jsonb
)
RETURNS public.reward_pools
SET search_path = 'public'
LANGUAGE plpgsql
AS $$
DECLARE
  v_pool public.reward_pools;
  v_item jsonb;
BEGIN
  INSERT INTO public.reward_pools (
    chain_id, controller_address, pool_id, creator_id, creator_address,
    event_lock_address, attendance_controller_address, payout_token_address,
    payout_token_symbol, token_decimals, total_funded_wei, claimed_amount_wei,
    claim_start, claim_end, challenge_window_secs, frozen_accrued_secs,
    position_count, rules_hash, rules_uri, status, frozen, tx_hash
  ) VALUES (
    (p_pool->>'chain_id')::bigint,
    p_pool->>'controller_address',
    (p_pool->>'pool_id')::bigint,
    p_pool->>'creator_id',
    p_pool->>'creator_address',
    p_pool->>'event_lock_address',
    NULLIF(p_pool->>'attendance_controller_address', ''),
    NULLIF(p_pool->>'payout_token_address', ''),
    NULLIF(p_pool->>'payout_token_symbol', ''),
    NULLIF(p_pool->>'token_decimals', '')::int,
    p_pool->>'total_funded_wei',
    COALESCE(NULLIF(p_pool->>'claimed_amount_wei', ''), '0'),
    (p_pool->>'claim_start')::timestamptz,
    (p_pool->>'claim_end')::timestamptz,
    (p_pool->>'challenge_window_secs')::bigint,
    COALESCE(NULLIF(p_pool->>'frozen_accrued_secs', ''), '0')::bigint,
    (p_pool->>'position_count')::int,
    p_pool->>'rules_hash',
    NULLIF(p_pool->>'rules_uri', ''),
    COALESCE(NULLIF(p_pool->>'status', ''), 'funded'),
    COALESCE((p_pool->>'frozen')::boolean, false),
    NULLIF(p_pool->>'tx_hash', '')
  )
  RETURNING * INTO v_pool;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_positions, '[]'::jsonb))
  LOOP
    INSERT INTO public.reward_pool_positions (
      reward_pool_id,
      placement,
      amount_wei,
      winner_address,
      assigned_at,
      hold_until,
      claimed,
      reclaimed,
      claimed_at
    ) VALUES (
      v_pool.id,
      (v_item->>'placement')::int,
      v_item->>'amount_wei',
      NULLIF(v_item->>'winner_address', ''),
      (NULLIF(v_item->>'assigned_at', ''))::timestamptz,
      (NULLIF(v_item->>'hold_until', ''))::timestamptz,
      COALESCE((v_item->>'claimed')::boolean, false),
      COALESCE((v_item->>'reclaimed')::boolean, false),
      (NULLIF(v_item->>'claimed_at', ''))::timestamptz
    );
  END LOOP;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_managers, '[]'::jsonb))
  LOOP
    INSERT INTO public.reward_pool_managers (reward_pool_id, manager_address, active, tx_hash)
    VALUES (
      v_pool.id,
      v_item->>'manager_address',
      true,
      NULLIF(p_pool->>'tx_hash', '')
    )
    ON CONFLICT (reward_pool_id, manager_address) DO NOTHING;
  END LOOP;

  RETURN v_pool;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_reward_pool_mirror(jsonb, jsonb, jsonb) TO service_role;
