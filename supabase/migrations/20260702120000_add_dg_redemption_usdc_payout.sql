-- USDC payout variant for DG redemption: method column, on-chain payout tracking,
-- and per-currency daily limit enforcement in the intent-creation RPC.

ALTER TABLE public.dg_redemption_intents
  ADD COLUMN payout_method TEXT NOT NULL DEFAULT 'ngn',
  ADD COLUMN gross_usdc_micro BIGINT,
  ADD COLUMN service_fee_usdc_micro BIGINT,
  ADD COLUMN total_fee_usdc_micro BIGINT,
  ADD COLUMN net_payout_usdc_micro BIGINT,
  ADD COLUMN payout_wallet_address TEXT,
  ADD COLUMN payout_token_address TEXT,
  ADD COLUMN payout_tx_hash TEXT,
  ADD COLUMN payout_raw_tx TEXT,
  ADD COLUMN fee_transfer_status TEXT NOT NULL DEFAULT 'not_required',
  ADD COLUMN fee_transfer_tx_hash TEXT,
  ADD COLUMN fee_transfer_raw_tx TEXT,
  ADD COLUMN fee_transfer_last_error TEXT,
  ADD COLUMN fee_transfer_completed_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.dg_redemption_intents
  ALTER COLUMN payout_account_id DROP NOT NULL;

ALTER TABLE public.dg_redemption_intents
  ADD CONSTRAINT dg_redemption_intents_payout_method_check
    CHECK (payout_method IN ('ngn', 'usdc')),
  ADD CONSTRAINT dg_redemption_intents_fee_transfer_status_check
    CHECK (fee_transfer_status IN ('not_required', 'pending', 'processing', 'completed', 'manual_review')),
  ADD CONSTRAINT dg_redemption_intents_ngn_payout_account_check
    CHECK (payout_method <> 'ngn' OR payout_account_id IS NOT NULL),
  ADD CONSTRAINT dg_redemption_intents_usdc_payout_check
    CHECK (
      payout_method <> 'usdc'
      OR (
        payout_wallet_address IS NOT NULL
        AND length(payout_wallet_address) = 42
        AND payout_token_address IS NOT NULL
        AND length(payout_token_address) = 42
        AND gross_usdc_micro IS NOT NULL
        AND gross_usdc_micro >= 0
        AND service_fee_usdc_micro IS NOT NULL
        AND service_fee_usdc_micro >= 0
        AND total_fee_usdc_micro IS NOT NULL
        AND total_fee_usdc_micro >= 0
        AND net_payout_usdc_micro IS NOT NULL
        AND net_payout_usdc_micro >= 0
      )
    );

-- Guards against two intents ever recording the same on-chain payout.
CREATE UNIQUE INDEX idx_dg_redemption_intents_payout_tx_hash
  ON public.dg_redemption_intents(payout_tx_hash)
  WHERE payout_tx_hash IS NOT NULL;

-- Guards against two intents ever recording the same service-fee sweep.
CREATE UNIQUE INDEX idx_dg_redemption_intents_fee_transfer_tx_hash
  ON public.dg_redemption_intents(fee_transfer_tx_hash)
  WHERE fee_transfer_tx_hash IS NOT NULL;

-- Serves the per-chain committed-USDC sum used to gate quotes against the payout wallet balance.
CREATE INDEX idx_dg_redemption_intents_usdc_open
  ON public.dg_redemption_intents(chain_id)
  WHERE payout_method = 'usdc'
    AND status IN ('awaiting_transfer', 'validating_transfer', 'payout_pending', 'payout_processing', 'manual_review');

-- Serves completed user payouts whose platform-fee sweep is still outstanding.
CREATE INDEX idx_dg_redemption_intents_usdc_completed_fee_transfer
  ON public.dg_redemption_intents(chain_id)
  WHERE payout_method = 'usdc'
    AND status = 'completed'
    AND fee_transfer_status IN ('pending', 'processing', 'manual_review');

-- Drop the old signature before recreating: CREATE OR REPLACE with a different
-- argument list would leave an ambiguous overload behind.
DROP FUNCTION IF EXISTS public.create_dg_redemption_intent(
  TEXT, TEXT, INTEGER, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
  BIGINT, BIGINT, BIGINT, INTEGER, TEXT, BIGINT, BIGINT, BIGINT, JSONB, JSONB, JSONB,
  JSONB, JSONB, TEXT, TIMESTAMP WITH TIME ZONE, BIGINT, BIGINT
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
  p_platform_daily_limit_usdc_micro BIGINT DEFAULT 0
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
  TEXT, TEXT, TEXT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_dg_redemption_intent(
  TEXT, TEXT, INTEGER, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
  BIGINT, BIGINT, BIGINT, INTEGER, TEXT, BIGINT, BIGINT, BIGINT, JSONB, JSONB, JSONB,
  JSONB, JSONB, TEXT, TIMESTAMP WITH TIME ZONE, BIGINT, BIGINT,
  TEXT, TEXT, TEXT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT
) TO service_role;

CREATE OR REPLACE FUNCTION public.acquire_dg_redemption_retry_lock(
  p_intent_id UUID,
  p_admin_user_id TEXT,
  p_lock_id UUID,
  p_stale_before TIMESTAMP WITH TIME ZONE
)
RETURNS public.dg_redemption_intents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  locked public.dg_redemption_intents;
BEGIN
  UPDATE public.dg_redemption_intents
     SET lock_id = p_lock_id,
         locked_at = NOW(),
         attempts = attempts + 1,
         last_error = NULL,
         updated_at = NOW()
   WHERE id = p_intent_id
     AND tx_hash IS NOT NULL
     AND (
       status IN ('failed', 'manual_review', 'payout_pending', 'payout_processing')
       OR (
         payout_method = 'usdc'
         AND status = 'completed'
         AND fee_transfer_status IN ('pending', 'processing', 'manual_review')
       )
     )
     AND (lock_id IS NULL OR locked_at IS NULL OR locked_at < p_stale_before)
   RETURNING * INTO locked;

  IF locked.id IS NOT NULL THEN
    INSERT INTO public.dg_redemption_events (intent_id, event_type, actor_user_id, actor_wallet_address, metadata)
    VALUES (locked.id, 'admin_retry_lock_acquired', p_admin_user_id, locked.wallet_address, jsonb_build_object(
      'lock_id', p_lock_id
    ));
  END IF;

  RETURN locked;
END;
$$;
