-- DG reward redemption: user bank details, quote intents, payout state, and admin config.

CREATE TABLE public.user_payout_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'paystack',
  provider_recipient_code TEXT,
  provider_recipient_id TEXT,
  account_holder_name TEXT NOT NULL,
  bank_code TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  account_number_last4 TEXT NOT NULL,
  account_number_hash TEXT NOT NULL,
  encrypted_account_number TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'NGN',
  status TEXT NOT NULL DEFAULT 'verified',
  verification_error TEXT,
  verified_at TIMESTAMP WITH TIME ZONE,
  suspended_at TIMESTAMP WITH TIME ZONE,
  provider_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  revealed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT user_payout_accounts_provider_check CHECK (provider IN ('paystack')),
  CONSTRAINT user_payout_accounts_currency_check CHECK (currency = 'NGN'),
  CONSTRAINT user_payout_accounts_status_check CHECK (status IN ('verified', 'verification_failed', 'suspended')),
  CONSTRAINT user_payout_accounts_last4_check CHECK (account_number_last4 ~ '^[0-9]{4}$')
);

CREATE INDEX idx_user_payout_accounts_user_id
  ON public.user_payout_accounts(user_id);
CREATE INDEX idx_user_payout_accounts_provider_code
  ON public.user_payout_accounts(provider_recipient_code)
  WHERE provider_recipient_code IS NOT NULL;
CREATE INDEX idx_user_payout_accounts_status
  ON public.user_payout_accounts(status);
CREATE UNIQUE INDEX idx_user_payout_accounts_unique_verified
  ON public.user_payout_accounts(user_id, provider)
  WHERE status = 'verified';
CREATE UNIQUE INDEX idx_user_payout_accounts_unique_verified_recipient
  ON public.user_payout_accounts(provider_recipient_code)
  WHERE status = 'verified' AND provider_recipient_code IS NOT NULL;

ALTER TABLE public.user_payout_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on user_payout_accounts"
  ON public.user_payout_accounts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE TABLE public.dg_redemption_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  chain_id INTEGER NOT NULL,
  payout_account_id UUID NOT NULL REFERENCES public.user_payout_accounts(id) ON DELETE RESTRICT,
  dg_token_address TEXT NOT NULL,
  up_token_address TEXT NOT NULL,
  vendor_address TEXT NOT NULL,
  redemption_wallet_address TEXT NOT NULL,
  amount_dg_raw TEXT NOT NULL,
  vendor_fee_dg_raw TEXT NOT NULL,
  net_dg_raw TEXT NOT NULL,
  estimated_up_out_raw TEXT NOT NULL,
  gross_ngn_kobo BIGINT NOT NULL,
  service_fee_kobo BIGINT NOT NULL,
  vat_kobo BIGINT NOT NULL DEFAULT 0,
  vat_rate_bps INTEGER NOT NULL DEFAULT 0,
  vat_basis TEXT NOT NULL DEFAULT 'none',
  vat_basis_kobo BIGINT NOT NULL DEFAULT 0,
  total_fee_kobo BIGINT NOT NULL,
  net_payout_kobo BIGINT NOT NULL,
  fee_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  vendor_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  pricing_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  limits_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  payout_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  paystack_reference TEXT NOT NULL UNIQUE,
  paystack_transfer_code TEXT,
  paystack_transfer_id TEXT,
  paystack_status TEXT,
  tx_hash TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'awaiting_transfer',
  lock_id UUID,
  locked_at TIMESTAMP WITH TIME ZONE,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT dg_redemption_intents_status_check CHECK (
    status IN (
      'awaiting_transfer',
      'validating_transfer',
      'payout_pending',
      'payout_processing',
      'completed',
      'expired',
      'cancelled',
      'failed',
      'manual_review'
    )
  ),
  CONSTRAINT dg_redemption_intents_positive_amounts CHECK (
    gross_ngn_kobo >= 0
    AND service_fee_kobo >= 0
    AND vat_kobo >= 0
    AND vat_basis_kobo >= 0
    AND total_fee_kobo >= 0
    AND net_payout_kobo >= 0
  ),
  CONSTRAINT dg_redemption_intents_addresses_check CHECK (
    length(wallet_address) = 42
    AND length(dg_token_address) = 42
    AND length(up_token_address) = 42
    AND length(vendor_address) = 42
    AND length(redemption_wallet_address) = 42
  )
);

CREATE INDEX idx_dg_redemption_intents_user_created
  ON public.dg_redemption_intents(user_id, created_at DESC);
CREATE INDEX idx_dg_redemption_intents_status
  ON public.dg_redemption_intents(status);
CREATE INDEX idx_dg_redemption_intents_chain_status
  ON public.dg_redemption_intents(chain_id, status);
CREATE INDEX idx_dg_redemption_intents_payout_account
  ON public.dg_redemption_intents(payout_account_id);
CREATE INDEX idx_dg_redemption_intents_lock
  ON public.dg_redemption_intents(lock_id)
  WHERE lock_id IS NOT NULL;
CREATE INDEX idx_dg_redemption_intents_expires
  ON public.dg_redemption_intents(expires_at)
  WHERE status IN ('awaiting_transfer', 'validating_transfer');

ALTER TABLE public.dg_redemption_intents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on dg_redemption_intents"
  ON public.dg_redemption_intents
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE TABLE public.dg_redemption_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_id UUID REFERENCES public.dg_redemption_intents(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor_user_id TEXT,
  actor_wallet_address TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dg_redemption_events_intent_id
  ON public.dg_redemption_events(intent_id)
  WHERE intent_id IS NOT NULL;
CREATE INDEX idx_dg_redemption_events_type_created
  ON public.dg_redemption_events(event_type, created_at DESC);

ALTER TABLE public.dg_redemption_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on dg_redemption_events"
  ON public.dg_redemption_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER update_user_payout_accounts_updated_at
  BEFORE UPDATE ON public.user_payout_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_dg_redemption_intents_updated_at
  BEFORE UPDATE ON public.dg_redemption_intents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.platform_config (key, value, description)
VALUES (
  'dg_redemption_config',
  '{
    "enabled": false,
    "supported_chains": [],
    "wallets_by_chain": {},
    "quote_ttl_seconds": 900,
    "required_confirmations": 2,
    "paystack_balance_cap_enabled": true,
    "limits": {
      "min_dg": "1",
      "max_dg": "100000",
      "min_gross_ngn_kobo": 0,
      "per_user_daily_ngn_kobo": 50000000,
      "platform_daily_ngn_kobo": 500000000,
      "manual_review_ngn_kobo": 25000000
    },
    "service_fee": {
      "bps": 300,
      "min_kobo": 50000,
      "max_kobo": 1500000
    },
    "tax": {
      "enabled": false,
      "vat_bps": 750,
      "basis": "service_fee"
    }
  }'::jsonb,
  'DG reward redemption settings, limits, fees, tax, chain wallets, and provider balance gating.'
)
ON CONFLICT (key) DO NOTHING;

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
     AND status NOT IN ('expired', 'cancelled', 'failed');

  IF p_user_daily_limit_kobo > 0 AND user_used_kobo + p_gross_ngn_kobo > p_user_daily_limit_kobo THEN
    RAISE EXCEPTION 'user_daily_limit_exceeded';
  END IF;

  SELECT COALESCE(SUM(gross_ngn_kobo), 0)
    INTO platform_used_kobo
    FROM public.dg_redemption_intents
   WHERE created_at >= day_start
     AND status NOT IN ('expired', 'cancelled', 'failed');

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

CREATE OR REPLACE FUNCTION public.acquire_dg_redemption_intent_lock(
  p_intent_id UUID,
  p_user_id TEXT,
  p_tx_hash TEXT,
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
     SET status = 'validating_transfer',
         tx_hash = COALESCE(tx_hash, lower(btrim(p_tx_hash))),
         lock_id = p_lock_id,
         locked_at = NOW(),
         attempts = attempts + 1,
         last_error = NULL,
         updated_at = NOW()
   WHERE id = p_intent_id
     AND user_id = p_user_id
     AND expires_at > NOW()
     AND status IN ('awaiting_transfer', 'validating_transfer')
     AND (tx_hash IS NULL OR tx_hash = lower(btrim(p_tx_hash)))
     AND (lock_id IS NULL OR locked_at IS NULL OR locked_at < p_stale_before)
   RETURNING * INTO locked;

  IF locked.id IS NOT NULL THEN
    INSERT INTO public.dg_redemption_events (intent_id, event_type, actor_user_id, actor_wallet_address, metadata)
    VALUES (locked.id, 'transfer_validation_started', p_user_id, locked.wallet_address, jsonb_build_object(
      'tx_hash', lower(btrim(p_tx_hash)),
      'lock_id', p_lock_id
    ));
  END IF;

  RETURN locked;
END;
$$;

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
     AND status IN ('failed', 'manual_review', 'payout_pending', 'payout_processing')
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

CREATE OR REPLACE FUNCTION public.replace_user_payout_account(
  p_user_id TEXT,
  p_provider_recipient_code TEXT,
  p_provider_recipient_id TEXT,
  p_account_holder_name TEXT,
  p_bank_code TEXT,
  p_bank_name TEXT,
  p_account_number_last4 TEXT,
  p_account_number_hash TEXT,
  p_encrypted_account_number TEXT,
  p_provider_metadata JSONB
)
RETURNS public.user_payout_accounts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted public.user_payout_accounts;
BEGIN
  IF p_user_id IS NULL OR btrim(p_user_id) = '' THEN
    RAISE EXCEPTION 'user_required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('user_payout_account_' || p_user_id));

  UPDATE public.user_payout_accounts
     SET status = 'suspended',
         suspended_at = NOW(),
         updated_at = NOW()
   WHERE user_id = p_user_id
     AND provider = 'paystack'
     AND status = 'verified';

  INSERT INTO public.user_payout_accounts (
    user_id,
    provider,
    provider_recipient_code,
    provider_recipient_id,
    account_holder_name,
    bank_code,
    bank_name,
    account_number_last4,
    account_number_hash,
    encrypted_account_number,
    currency,
    status,
    verified_at,
    provider_metadata
  )
  VALUES (
    p_user_id,
    'paystack',
    p_provider_recipient_code,
    p_provider_recipient_id,
    p_account_holder_name,
    p_bank_code,
    p_bank_name,
    p_account_number_last4,
    p_account_number_hash,
    p_encrypted_account_number,
    'NGN',
    'verified',
    NOW(),
    COALESCE(p_provider_metadata, '{}'::jsonb)
  )
  RETURNING * INTO inserted;

  INSERT INTO public.dg_redemption_events (event_type, actor_user_id, metadata)
  VALUES ('payout_account_saved', p_user_id, jsonb_build_object(
    'payout_account_id', inserted.id,
    'bank_code', p_bank_code,
    'account_number_last4', p_account_number_last4
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

REVOKE ALL ON FUNCTION public.acquire_dg_redemption_intent_lock(UUID, TEXT, TEXT, UUID, TIMESTAMP WITH TIME ZONE)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_dg_redemption_intent_lock(UUID, TEXT, TEXT, UUID, TIMESTAMP WITH TIME ZONE)
  TO service_role;

REVOKE ALL ON FUNCTION public.acquire_dg_redemption_retry_lock(UUID, TEXT, UUID, TIMESTAMP WITH TIME ZONE)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_dg_redemption_retry_lock(UUID, TEXT, UUID, TIMESTAMP WITH TIME ZONE)
  TO service_role;

REVOKE ALL ON FUNCTION public.replace_user_payout_account(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_user_payout_account(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB
) TO service_role;

COMMENT ON TABLE public.user_payout_accounts IS 'Verified user payout accounts used by DG reward redemption. Bank account numbers are encrypted and only accessed through edge functions.';
COMMENT ON TABLE public.dg_redemption_intents IS 'Immutable quote snapshots and payout state for DG reward redemption through Paystack transfers.';
COMMENT ON TABLE public.dg_redemption_events IS 'Service-side audit log for DG reward redemption state transitions.';
