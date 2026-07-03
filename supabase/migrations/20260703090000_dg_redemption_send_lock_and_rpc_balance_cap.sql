-- Closes two Redeem DG race windows:
-- 1. dg_payout_wallet_locks serializes the nonce-sensitive send section (nonce fetch,
--    sign, persist, broadcast) across concurrent USDC payouts and fee sweeps that
--    share one payout wallet per chain.
-- 2. create_dg_redemption_intent enforces the USDC payout-wallet balance cap inside
--    the advisory-locked transaction, so concurrent quotes cannot both pass a cap
--    check that was read before either intent existed.

CREATE TABLE public.dg_payout_wallet_locks (
  chain_id INTEGER PRIMARY KEY,
  lock_id UUID,
  locked_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.dg_payout_wallet_locks ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.dg_payout_wallet_locks TO service_role;

CREATE POLICY "Service role full access" ON public.dg_payout_wallet_locks
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

INSERT INTO public.dg_payout_wallet_locks (chain_id)
SELECT chain_id FROM public.network_configs
ON CONFLICT (chain_id) DO NOTHING;

-- Drop the old signature before recreating: CREATE OR REPLACE with a different
-- argument list would leave an ambiguous overload behind.
DROP FUNCTION IF EXISTS public.create_dg_redemption_intent(
  TEXT, TEXT, INTEGER, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
  BIGINT, BIGINT, BIGINT, INTEGER, TEXT, BIGINT, BIGINT, BIGINT, JSONB, JSONB, JSONB,
  JSONB, JSONB, TEXT, TIMESTAMP WITH TIME ZONE, BIGINT, BIGINT,
  TEXT, TEXT, TEXT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT
);

CREATE FUNCTION public.create_dg_redemption_intent(
  p_user_id TEXT,
  p_wallet_address TEXT,
  p_chain_id INTEGER,
  p_payout_account_id UUID,
  p_dg_token_address TEXT,
  p_up_token_address TEXT,
  p_vendor_address TEXT,
  p_redemption_wallet_address TEXT,
  p_amount_dg_raw TEXT,
  p_vendor_fee_dg_raw TEXT,
  p_net_dg_raw TEXT,
  p_estimated_up_out_raw TEXT,
  p_gross_ngn_kobo BIGINT,
  p_service_fee_kobo BIGINT,
  p_vat_kobo BIGINT,
  p_vat_rate_bps INTEGER,
  p_vat_basis TEXT,
  p_vat_basis_kobo BIGINT,
  p_total_fee_kobo BIGINT,
  p_net_payout_kobo BIGINT,
  p_fee_breakdown JSONB,
  p_vendor_snapshot JSONB,
  p_pricing_snapshot JSONB,
  p_limits_snapshot JSONB,
  p_payout_snapshot JSONB,
  p_paystack_reference TEXT,
  p_expires_at TIMESTAMP WITH TIME ZONE,
  p_user_daily_limit_kobo BIGINT,
  p_platform_daily_limit_kobo BIGINT,
  p_payout_method TEXT DEFAULT 'ngn',
  p_payout_wallet_address TEXT DEFAULT NULL,
  p_payout_token_address TEXT DEFAULT NULL,
  p_gross_usdc_micro BIGINT DEFAULT NULL,
  p_service_fee_usdc_micro BIGINT DEFAULT NULL,
  p_total_fee_usdc_micro BIGINT DEFAULT NULL,
  p_net_payout_usdc_micro BIGINT DEFAULT NULL,
  p_user_daily_limit_usdc_micro BIGINT DEFAULT 0,
  p_platform_daily_limit_usdc_micro BIGINT DEFAULT 0,
  p_payout_wallet_balance_usdc_micro BIGINT DEFAULT NULL
)
RETURNS public.dg_redemption_intents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted public.dg_redemption_intents;
  user_used BIGINT;
  platform_used BIGINT;
  committed_usdc_micro BIGINT;
  day_start TIMESTAMP WITH TIME ZONE;
  v_method TEXT;
BEGIN
  IF p_user_id IS NULL OR btrim(p_user_id) = '' THEN
    RAISE EXCEPTION 'user_required';
  END IF;

  v_method := COALESCE(NULLIF(btrim(p_payout_method), ''), 'ngn');
  IF v_method NOT IN ('ngn', 'usdc') THEN
    RAISE EXCEPTION 'invalid_payout_method';
  END IF;

  IF v_method = 'ngn' THEN
    IF p_payout_account_id IS NULL THEN
      RAISE EXCEPTION 'payout_account_required';
    END IF;
    IF p_gross_ngn_kobo <= 0 OR p_net_payout_kobo <= 0 THEN
      RAISE EXCEPTION 'invalid_redemption_amount';
    END IF;
  ELSE
    IF p_payout_wallet_address IS NULL OR length(btrim(p_payout_wallet_address)) <> 42 THEN
      RAISE EXCEPTION 'payout_wallet_required';
    END IF;
    IF p_payout_token_address IS NULL OR length(btrim(p_payout_token_address)) <> 42 THEN
      RAISE EXCEPTION 'payout_token_required';
    END IF;
    IF COALESCE(p_gross_usdc_micro, 0) <= 0 OR COALESCE(p_net_payout_usdc_micro, 0) <= 0 THEN
      RAISE EXCEPTION 'invalid_redemption_amount';
    END IF;
  END IF;

  day_start := date_trunc('day', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';

  PERFORM pg_advisory_xact_lock(hashtext('dg_redemption_user_' || p_user_id));
  PERFORM pg_advisory_xact_lock(hashtext('dg_redemption_platform_' || to_char(day_start, 'YYYYMMDD')));

  IF v_method = 'ngn' THEN
    SELECT COALESCE(SUM(gross_ngn_kobo), 0)
      INTO user_used
      FROM public.dg_redemption_intents
     WHERE user_id = p_user_id
       AND payout_method = 'ngn'
       AND created_at >= day_start
       AND status NOT IN ('expired', 'cancelled', 'failed')
       AND (
         status NOT IN ('awaiting_transfer', 'validating_transfer')
         OR expires_at IS NULL
         OR expires_at > NOW()
       );

    IF p_user_daily_limit_kobo > 0 AND user_used + p_gross_ngn_kobo > p_user_daily_limit_kobo THEN
      RAISE EXCEPTION 'user_daily_limit_exceeded';
    END IF;

    SELECT COALESCE(SUM(gross_ngn_kobo), 0)
      INTO platform_used
      FROM public.dg_redemption_intents
     WHERE payout_method = 'ngn'
       AND created_at >= day_start
       AND status NOT IN ('expired', 'cancelled', 'failed')
       AND (
         status NOT IN ('awaiting_transfer', 'validating_transfer')
         OR expires_at IS NULL
         OR expires_at > NOW()
       );

    IF p_platform_daily_limit_kobo > 0 AND platform_used + p_gross_ngn_kobo > p_platform_daily_limit_kobo THEN
      RAISE EXCEPTION 'platform_daily_limit_exceeded';
    END IF;
  ELSE
    SELECT COALESCE(SUM(gross_usdc_micro), 0)
      INTO user_used
      FROM public.dg_redemption_intents
     WHERE user_id = p_user_id
       AND payout_method = 'usdc'
       AND created_at >= day_start
       AND status NOT IN ('expired', 'cancelled', 'failed')
       AND (
         status NOT IN ('awaiting_transfer', 'validating_transfer')
         OR expires_at IS NULL
         OR expires_at > NOW()
       );

    IF p_user_daily_limit_usdc_micro > 0 AND user_used + p_gross_usdc_micro > p_user_daily_limit_usdc_micro THEN
      RAISE EXCEPTION 'user_daily_limit_exceeded';
    END IF;

    SELECT COALESCE(SUM(gross_usdc_micro), 0)
      INTO platform_used
      FROM public.dg_redemption_intents
     WHERE payout_method = 'usdc'
       AND created_at >= day_start
       AND status NOT IN ('expired', 'cancelled', 'failed')
       AND (
         status NOT IN ('awaiting_transfer', 'validating_transfer')
         OR expires_at IS NULL
         OR expires_at > NOW()
       );

    IF p_platform_daily_limit_usdc_micro > 0 AND platform_used + p_gross_usdc_micro > p_platform_daily_limit_usdc_micro THEN
      RAISE EXCEPTION 'platform_daily_limit_exceeded';
    END IF;

    -- Balance-cap enforcement must happen under the advisory lock: open intents count
    -- their net payout plus any outstanding fee sweep; completed intents count only the
    -- outstanding fee sweep. Mirrors getUsdcPayoutAvailability in the edge functions.
    IF p_payout_wallet_balance_usdc_micro IS NOT NULL THEN
      SELECT COALESCE(SUM(
               CASE WHEN status = 'completed' THEN 0 ELSE COALESCE(net_payout_usdc_micro, 0) END
               + CASE WHEN fee_transfer_status IN ('pending', 'processing', 'manual_review')
                      THEN COALESCE(service_fee_usdc_micro, 0)
                      ELSE 0 END
             ), 0)
        INTO committed_usdc_micro
        FROM public.dg_redemption_intents
       WHERE payout_method = 'usdc'
         AND chain_id = p_chain_id
         AND (
           (
             status IN ('awaiting_transfer', 'validating_transfer', 'payout_pending', 'payout_processing', 'manual_review')
             AND NOT (
               status IN ('awaiting_transfer', 'validating_transfer')
               AND expires_at IS NOT NULL
               AND expires_at <= NOW()
             )
           )
           OR (
             status = 'completed'
             AND fee_transfer_status IN ('pending', 'processing', 'manual_review')
           )
         );

      IF committed_usdc_micro + p_net_payout_usdc_micro + COALESCE(p_service_fee_usdc_micro, 0)
         > p_payout_wallet_balance_usdc_micro THEN
        RAISE EXCEPTION 'payout_wallet_liquidity_exceeded';
      END IF;
    END IF;
  END IF;

  INSERT INTO public.dg_redemption_intents (
    user_id,
    wallet_address,
    chain_id,
    payout_account_id,
    dg_token_address,
    up_token_address,
    vendor_address,
    redemption_wallet_address,
    amount_dg_raw,
    vendor_fee_dg_raw,
    net_dg_raw,
    estimated_up_out_raw,
    gross_ngn_kobo,
    service_fee_kobo,
    vat_kobo,
    vat_rate_bps,
    vat_basis,
    vat_basis_kobo,
    total_fee_kobo,
    net_payout_kobo,
    fee_breakdown,
    vendor_snapshot,
    pricing_snapshot,
    limits_snapshot,
    payout_snapshot,
    paystack_reference,
    expires_at,
    payout_method,
    payout_wallet_address,
    payout_token_address,
    gross_usdc_micro,
    service_fee_usdc_micro,
    total_fee_usdc_micro,
    net_payout_usdc_micro,
    fee_transfer_status
  )
  VALUES (
    p_user_id,
    lower(p_wallet_address),
    p_chain_id,
    p_payout_account_id,
    lower(p_dg_token_address),
    lower(p_up_token_address),
    lower(p_vendor_address),
    lower(p_redemption_wallet_address),
    p_amount_dg_raw,
    p_vendor_fee_dg_raw,
    p_net_dg_raw,
    p_estimated_up_out_raw,
    p_gross_ngn_kobo,
    p_service_fee_kobo,
    p_vat_kobo,
    p_vat_rate_bps,
    p_vat_basis,
    p_vat_basis_kobo,
    p_total_fee_kobo,
    p_net_payout_kobo,
    COALESCE(p_fee_breakdown, '{}'::jsonb),
    COALESCE(p_vendor_snapshot, '{}'::jsonb),
    COALESCE(p_pricing_snapshot, '{}'::jsonb),
    COALESCE(p_limits_snapshot, '{}'::jsonb) || CASE
      WHEN v_method = 'ngn' THEN jsonb_build_object(
        'user_daily_used_before_kobo', user_used,
        'platform_daily_used_before_kobo', platform_used
      )
      ELSE jsonb_build_object(
        'user_daily_used_before_usdc_micro', user_used,
        'platform_daily_used_before_usdc_micro', platform_used
      )
    END,
    COALESCE(p_payout_snapshot, '{}'::jsonb),
    p_paystack_reference,
    p_expires_at,
    v_method,
    lower(p_payout_wallet_address),
    lower(p_payout_token_address),
    p_gross_usdc_micro,
    p_service_fee_usdc_micro,
    p_total_fee_usdc_micro,
    p_net_payout_usdc_micro,
    CASE
      WHEN v_method = 'usdc' AND COALESCE(p_service_fee_usdc_micro, 0) > 0 THEN 'pending'
      ELSE 'not_required'
    END
  )
  RETURNING * INTO inserted;

  INSERT INTO public.dg_redemption_events (intent_id, event_type, actor_user_id, actor_wallet_address, metadata)
  VALUES (inserted.id, 'quote_created', p_user_id, lower(p_wallet_address), CASE
    WHEN v_method = 'ngn' THEN jsonb_build_object(
      'payout_method', v_method,
      'gross_ngn_kobo', p_gross_ngn_kobo,
      'net_payout_kobo', p_net_payout_kobo
    )
    ELSE jsonb_build_object(
      'payout_method', v_method,
      'gross_usdc_micro', p_gross_usdc_micro,
      'net_payout_usdc_micro', p_net_payout_usdc_micro,
      'payout_wallet_address', lower(p_payout_wallet_address)
    )
  END);

  RETURN inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.create_dg_redemption_intent(
  TEXT, TEXT, INTEGER, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
  BIGINT, BIGINT, BIGINT, INTEGER, TEXT, BIGINT, BIGINT, BIGINT, JSONB, JSONB, JSONB,
  JSONB, JSONB, TEXT, TIMESTAMP WITH TIME ZONE, BIGINT, BIGINT,
  TEXT, TEXT, TEXT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_dg_redemption_intent(
  TEXT, TEXT, INTEGER, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
  BIGINT, BIGINT, BIGINT, INTEGER, TEXT, BIGINT, BIGINT, BIGINT, JSONB, JSONB, JSONB,
  JSONB, JSONB, TEXT, TIMESTAMP WITH TIME ZONE, BIGINT, BIGINT,
  TEXT, TEXT, TEXT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT
) TO service_role;
