ALTER TABLE public.app_user_profiles
  ADD COLUMN IF NOT EXISTS telegram_chat_id BIGINT,
  ADD COLUMN IF NOT EXISTS telegram_notifications_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS telegram_linked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS telegram_disabled_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_app_user_profiles_telegram_chat_id
  ON public.app_user_profiles (telegram_chat_id)
  WHERE telegram_chat_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.telegram_activation_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  privy_user_id TEXT NOT NULL REFERENCES public.app_user_profiles(privy_user_id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_telegram_activation_tokens_active_token
  ON public.telegram_activation_tokens (token)
  WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_telegram_activation_tokens_user_active
  ON public.telegram_activation_tokens (privy_user_id, expires_at DESC)
  WHERE used_at IS NULL;

ALTER TABLE public.telegram_activation_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages telegram activation tokens"
  ON public.telegram_activation_tokens
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.telegram_activation_tokens TO service_role;

CREATE TABLE IF NOT EXISTS public.social_link_map (
  provider TEXT NOT NULL,
  account_key TEXT NOT NULL,
  privy_user_id TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'unknown',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  released_at TIMESTAMPTZ,
  released_by TEXT,
  PRIMARY KEY (provider, account_key)
);

CREATE INDEX IF NOT EXISTS idx_social_link_map_privy_user_id
  ON public.social_link_map (privy_user_id);

ALTER TABLE public.social_link_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages social link map"
  ON public.social_link_map
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.social_link_map TO service_role;

CREATE TABLE IF NOT EXISTS public.social_link_conflict_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  account_key TEXT NOT NULL,
  attempted_privy_user_id TEXT NOT NULL,
  bound_privy_user_id TEXT,
  source TEXT NOT NULL DEFAULT 'unknown',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_link_conflicts_account
  ON public.social_link_conflict_attempts (provider, account_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_link_conflicts_attempted_user
  ON public.social_link_conflict_attempts (attempted_privy_user_id, created_at DESC);

ALTER TABLE public.social_link_conflict_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages social link conflicts"
  ON public.social_link_conflict_attempts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT ON TABLE public.social_link_conflict_attempts TO service_role;

CREATE TABLE IF NOT EXISTS public.telegram_organizer_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_privy_user_id TEXT NOT NULL,
  organizer_privy_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  unsubscribed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_telegram_organizer_subscriptions_active
  ON public.telegram_organizer_subscriptions (subscriber_privy_user_id, organizer_privy_user_id)
  WHERE unsubscribed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_telegram_organizer_subscriptions_organizer_active
  ON public.telegram_organizer_subscriptions (organizer_privy_user_id, created_at DESC)
  WHERE unsubscribed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_telegram_organizer_subscriptions_subscriber_active
  ON public.telegram_organizer_subscriptions (subscriber_privy_user_id, created_at DESC)
  WHERE unsubscribed_at IS NULL;

ALTER TABLE public.telegram_organizer_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages telegram organizer subscriptions"
  ON public.telegram_organizer_subscriptions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.telegram_organizer_subscriptions TO service_role;

CREATE TABLE IF NOT EXISTS public.telegram_notification_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_key TEXT NOT NULL,
  recipient_privy_user_id TEXT,
  chat_id BIGINT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  error TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (notification_key, chat_id)
);

CREATE INDEX IF NOT EXISTS idx_telegram_deliveries_recipient
  ON public.telegram_notification_deliveries (recipient_privy_user_id, created_at DESC)
  WHERE recipient_privy_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_telegram_deliveries_status
  ON public.telegram_notification_deliveries (status, created_at DESC);

ALTER TABLE public.telegram_notification_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages telegram deliveries"
  ON public.telegram_notification_deliveries
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.telegram_notification_deliveries TO service_role;

CREATE OR REPLACE FUNCTION public.claim_social_link(
  p_provider TEXT,
  p_account_key TEXT,
  p_privy_user_id TEXT,
  p_source TEXT DEFAULT 'unknown'
)
RETURNS TABLE(claimed BOOLEAN, conflict BOOLEAN, bound_privy_user_id TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_existing public.social_link_map%ROWTYPE;
BEGIN
  SELECT *
    INTO v_existing
    FROM public.social_link_map
   WHERE provider = p_provider
     AND account_key = p_account_key
   FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.social_link_map (provider, account_key, privy_user_id, source)
    VALUES (p_provider, p_account_key, p_privy_user_id, COALESCE(NULLIF(p_source, ''), 'unknown'));

    RETURN QUERY SELECT true, false, p_privy_user_id;
    RETURN;
  END IF;

  IF v_existing.released_at IS NOT NULL THEN
    UPDATE public.social_link_map
       SET privy_user_id = p_privy_user_id,
           source = COALESCE(NULLIF(p_source, ''), 'unknown'),
           updated_at = now(),
           released_at = NULL,
           released_by = NULL
     WHERE provider = p_provider
       AND account_key = p_account_key;

    RETURN QUERY SELECT true, false, p_privy_user_id;
    RETURN;
  END IF;

  IF v_existing.privy_user_id = p_privy_user_id THEN
    UPDATE public.social_link_map
       SET source = COALESCE(NULLIF(p_source, ''), source),
           updated_at = now()
     WHERE provider = p_provider
       AND account_key = p_account_key;

    RETURN QUERY SELECT true, false, p_privy_user_id;
    RETURN;
  END IF;

  INSERT INTO public.social_link_conflict_attempts (
    provider,
    account_key,
    attempted_privy_user_id,
    bound_privy_user_id,
    source
  )
  VALUES (
    p_provider,
    p_account_key,
    p_privy_user_id,
    v_existing.privy_user_id,
    COALESCE(NULLIF(p_source, ''), 'unknown')
  );

  RETURN QUERY SELECT false, true, v_existing.privy_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_social_link(
  p_provider TEXT,
  p_account_key TEXT,
  p_released_by TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  UPDATE public.social_link_map
     SET released_at = now(),
         released_by = p_released_by,
         updated_at = now()
   WHERE provider = p_provider
     AND account_key = p_account_key
     AND released_at IS NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_social_link(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_social_link(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_social_link(TEXT, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_social_link(TEXT, TEXT, TEXT) TO service_role;
