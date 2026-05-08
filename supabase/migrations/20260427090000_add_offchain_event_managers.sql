-- Add app user profile cache and offchain event managers.
-- Manager permissions are enforced by Edge Functions; wallet address remains
-- the authorization source of truth.

CREATE TABLE IF NOT EXISTS public.app_user_profiles (
  privy_user_id TEXT PRIMARY KEY,
  email TEXT,
  primary_wallet_address TEXT,
  wallet_addresses TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_app_user_profiles_email
  ON public.app_user_profiles (lower(email))
  WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_app_user_profiles_wallets
  ON public.app_user_profiles USING gin (wallet_addresses);

CREATE TABLE IF NOT EXISTS public.event_managers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  privy_user_id TEXT,
  email TEXT,
  label TEXT,
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  added_by TEXT NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT event_managers_wallet_address_format
    CHECK (wallet_address ~ '^0x[a-f0-9]{40}$'),
  CONSTRAINT event_managers_email_format
    CHECK (email IS NULL OR email = lower(email)),
  CONSTRAINT event_managers_permissions_object
    CHECK (jsonb_typeof(permissions) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_event_managers_active_wallet
  ON public.event_managers(event_id, wallet_address)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_event_managers_event_id
  ON public.event_managers(event_id);

CREATE INDEX IF NOT EXISTS idx_event_managers_wallet_active
  ON public.event_managers(wallet_address)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_event_managers_privy_user_active
  ON public.event_managers(privy_user_id)
  WHERE privy_user_id IS NOT NULL AND revoked_at IS NULL;

ALTER TABLE public.app_user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_managers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages app user profiles"
  ON public.app_user_profiles
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can view own app user profile"
  ON public.app_user_profiles
  FOR SELECT
  TO authenticated
  USING (privy_user_id = (SELECT current_setting('request.jwt.claims', true)::json->>'sub'));

CREATE POLICY "Service role manages event managers"
  ON public.event_managers
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Event creators view event managers"
  ON public.event_managers
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.events
      WHERE events.id = event_managers.event_id
        AND events.creator_id = (SELECT current_setting('request.jwt.claims', true)::json->>'sub')
    )
  );

COMMENT ON TABLE public.app_user_profiles
  IS 'Minimal Privy profile cache used for exact email-to-wallet lookup when adding offchain event managers.';

COMMENT ON COLUMN public.app_user_profiles.email
  IS 'Lowercase email from Privy when available. Used only for exact lookup, not public search.';

COMMENT ON TABLE public.event_managers
  IS 'Offchain event-scoped managers with Teerex-controlled permissions. Does not grant Unlock lock manager powers.';

COMMENT ON COLUMN public.event_managers.email
  IS 'Email shown only when the manager was added by email or matched an app profile during add.';

COMMENT ON COLUMN public.event_managers.permissions
  IS 'Allowed boolean keys: manage_access, manage_waitlist, manage_discussions.';
