CREATE OR REPLACE FUNCTION public.create_dg_redemption_intent(
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
  p_platform_daily_limit_kobo BIGINT
)
RETURNS public.dg_redemption_intents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted public.dg_redemption_intents;
  user_used_kobo BIGINT;
  platform_used_kobo BIGINT;
  day_start TIMESTAMP WITH TIME ZONE;
BEGIN
  IF p_user_id IS NULL OR btrim(p_user_id) = '' THEN
    RAISE EXCEPTION 'user_required';
  END IF;

  IF p_gross_ngn_kobo <= 0 OR p_net_payout_kobo <= 0 THEN
    RAISE EXCEPTION 'invalid_redemption_amount';
  END IF;

  day_start := date_trunc('day', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';

  PERFORM pg_advisory_xact_lock(hashtext('dg_redemption_user_' || p_user_id));
  PERFORM pg_advisory_xact_lock(hashtext('dg_redemption_platform_' || to_char(day_start, 'YYYYMMDD')));

  SELECT COALESCE(SUM(gross_ngn_kobo), 0)
    INTO user_used_kobo
    FROM public.dg_redemption_intents
   WHERE user_id = p_user_id
     AND created_at >= day_start
     AND status NOT IN ('expired', 'cancelled', 'failed')
     AND (
       status NOT IN ('awaiting_transfer', 'validating_transfer')
       OR expires_at IS NULL
       OR expires_at > NOW()
     );

  IF p_user_daily_limit_kobo > 0 AND user_used_kobo + p_gross_ngn_kobo > p_user_daily_limit_kobo THEN
    RAISE EXCEPTION 'user_daily_limit_exceeded';
  END IF;

  SELECT COALESCE(SUM(gross_ngn_kobo), 0)
    INTO platform_used_kobo
    FROM public.dg_redemption_intents
   WHERE created_at >= day_start
     AND status NOT IN ('expired', 'cancelled', 'failed')
     AND (
       status NOT IN ('awaiting_transfer', 'validating_transfer')
       OR expires_at IS NULL
       OR expires_at > NOW()
     );

  IF p_platform_daily_limit_kobo > 0 AND platform_used_kobo + p_gross_ngn_kobo > p_platform_daily_limit_kobo THEN
    RAISE EXCEPTION 'platform_daily_limit_exceeded';
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
    expires_at
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
    COALESCE(p_limits_snapshot, '{}'::jsonb) || jsonb_build_object(
      'user_daily_used_before_kobo', user_used_kobo,
      'platform_daily_used_before_kobo', platform_used_kobo
    ),
    COALESCE(p_payout_snapshot, '{}'::jsonb),
    p_paystack_reference,
    p_expires_at
  )
  RETURNING * INTO inserted;

  INSERT INTO public.dg_redemption_events (intent_id, event_type, actor_user_id, actor_wallet_address, metadata)
  VALUES (inserted.id, 'quote_created', p_user_id, lower(p_wallet_address), jsonb_build_object(
    'gross_ngn_kobo', p_gross_ngn_kobo,
    'net_payout_kobo', p_net_payout_kobo
  ));

  RETURN inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.create_dg_redemption_intent(
  TEXT, TEXT, INTEGER, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
  BIGINT, BIGINT, BIGINT, INTEGER, TEXT, BIGINT, BIGINT, BIGINT, JSONB, JSONB, JSONB,
  JSONB, JSONB, TEXT, TIMESTAMP WITH TIME ZONE, BIGINT, BIGINT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_dg_redemption_intent(
  TEXT, TEXT, INTEGER, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
  BIGINT, BIGINT, BIGINT, INTEGER, TEXT, BIGINT, BIGINT, BIGINT, JSONB, JSONB, JSONB,
  JSONB, JSONB, TEXT, TIMESTAMP WITH TIME ZONE, BIGINT, BIGINT
) TO service_role;
