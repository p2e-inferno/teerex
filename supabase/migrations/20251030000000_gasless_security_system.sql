-- Gasless Attestation Security System
-- Provides database-configurable rate limiting, whitelists, and monitoring

-- ============================================================================
-- 1. Global Configuration Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.gasless_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    daily_global_limit_per_user INTEGER NOT NULL DEFAULT 100,
    log_sensitive_data BOOLEAN NOT NULL DEFAULT false,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default configuration
INSERT INTO public.gasless_config (daily_global_limit_per_user, log_sensitive_data, enabled)
VALUES (100, false, true)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 2. Chain Whitelist Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.gasless_chains (
    chain_id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    rpc_url_override TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default chains
INSERT INTO public.gasless_chains (chain_id, name, enabled) VALUES
(84532, 'Base Sepolia', true),
(8453, 'Base Mainnet', true)
ON CONFLICT (chain_id) DO NOTHING;

-- ============================================================================
-- 3. Schema Whitelist Table with Categories
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.gasless_schemas (
    schema_uid TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    daily_limit_per_user INTEGER, -- null = unlimited
    exempt_from_global_limit BOOLEAN NOT NULL DEFAULT false,
    allow_revocations BOOLEAN NOT NULL DEFAULT false,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on category for filtering
CREATE INDEX IF NOT EXISTS idx_gasless_schemas_category ON public.gasless_schemas(category);
CREATE INDEX IF NOT EXISTS idx_gasless_schemas_enabled ON public.gasless_schemas(enabled);

-- Insert example schemas (these should be configured by admin)
-- Event Attendance Schema (from your app)
INSERT INTO public.gasless_schemas (
    schema_uid,
    name,
    category,
    daily_limit_per_user,
    exempt_from_global_limit,
    allow_revocations,
    enabled
) VALUES
-- Add your actual schema UIDs here
('0x16958320594b2f8aa79dac3b6367910768a06ced3cf64f6d7480febd90157fae', 'Event Attendance', 'event_attendance', 20, false, false, true)
ON CONFLICT (schema_uid) DO NOTHING;

-- ============================================================================
-- 4. Attestation Log Table (for rate limiting and monitoring)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.gasless_attestation_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL, -- Privy user ID
    schema_uid TEXT NOT NULL,
    recipient TEXT NOT NULL,
    chain_id INTEGER NOT NULL,
    event_id TEXT, -- references events(id) - nullable
    gas_used NUMERIC,
    gas_cost_usd NUMERIC,
    tx_hash TEXT,
    attestation_uid TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for efficient rate limiting queries
CREATE INDEX IF NOT EXISTS idx_gasless_log_user_date
    ON public.gasless_attestation_log(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_gasless_log_user_schema_date
    ON public.gasless_attestation_log(user_id, schema_uid, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_gasless_log_user_event_schema_date
    ON public.gasless_attestation_log(user_id, event_id, schema_uid, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_gasless_log_chain_date
    ON public.gasless_attestation_log(chain_id, created_at DESC);

-- ============================================================================
-- 5. Alerts Configuration Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.gasless_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_type TEXT NOT NULL, -- 'low_balance', 'high_gas_cost', 'daily_limit_reached'
    threshold_value NUMERIC NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    alert_emails TEXT[], -- Array of email addresses
    last_triggered_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create unique index on alert_type
CREATE UNIQUE INDEX IF NOT EXISTS idx_gasless_alerts_type ON public.gasless_alerts(alert_type);

-- Insert default alert configurations
INSERT INTO public.gasless_alerts (alert_type, threshold_value, enabled, alert_emails) VALUES
('low_balance', 0.01, true, ARRAY[]::TEXT[]), -- Alert when service wallet < 0.01 ETH
('high_gas_cost', 100.0, true, ARRAY[]::TEXT[]), -- Alert when daily gas cost > $100
('daily_limit_reached', 1000, true, ARRAY[]::TEXT[]) -- Alert when 1000 attestations/day
ON CONFLICT (alert_type) DO NOTHING;

-- ============================================================================
-- RLS (Row Level Security) Policies
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.gasless_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gasless_chains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gasless_schemas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gasless_attestation_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gasless_alerts ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (for edge functions)
CREATE POLICY "Service role has full access to gasless_config"
    ON public.gasless_config FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Service role has full access to gasless_chains"
    ON public.gasless_chains FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Service role has full access to gasless_schemas"
    ON public.gasless_schemas FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Service role has full access to gasless_attestation_log"
    ON public.gasless_attestation_log FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Service role has full access to gasless_alerts"
    ON public.gasless_alerts FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Authenticated users can read their own attestation logs
CREATE POLICY "Users can read their own attestation logs"
    ON public.gasless_attestation_log FOR SELECT
    TO authenticated
    USING (auth.uid()::text = user_id);

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Function to get user's attestation count for today (global)
CREATE OR REPLACE FUNCTION get_user_daily_attestation_count(p_user_id TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*)
    INTO v_count
    FROM public.gasless_attestation_log
    WHERE user_id = p_user_id
    AND created_at >= CURRENT_DATE
    AND created_at < CURRENT_DATE + INTERVAL '1 day';

    RETURN COALESCE(v_count, 0);
END;
$$;

-- Function to get user's attestation count for today per schema
CREATE OR REPLACE FUNCTION get_user_schema_daily_attestation_count(
    p_user_id TEXT,
    p_schema_uid TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*)
    INTO v_count
    FROM public.gasless_attestation_log
    WHERE user_id = p_user_id
    AND schema_uid = p_schema_uid
    AND created_at >= CURRENT_DATE
    AND created_at < CURRENT_DATE + INTERVAL '1 day';

    RETURN COALESCE(v_count, 0);
END;
$$;

-- Function to check if user is within rate limits
CREATE OR REPLACE FUNCTION check_gasless_rate_limit(
    p_user_id TEXT,
    p_schema_uid TEXT,
    OUT allowed BOOLEAN,
    OUT reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_config RECORD;
    v_schema RECORD;
    v_global_count INTEGER;
    v_schema_count INTEGER;
BEGIN
    -- Get configuration
    SELECT * INTO v_config FROM public.gasless_config ORDER BY created_at DESC LIMIT 1;

    -- Check if system is enabled
    IF NOT v_config.enabled THEN
        allowed := false;
        reason := 'Gasless attestation system is currently disabled';
        RETURN;
    END IF;

    -- Get schema configuration
    SELECT * INTO v_schema FROM public.gasless_schemas WHERE schema_uid = p_schema_uid;

    -- Check if schema exists and is enabled
    IF v_schema IS NULL THEN
        allowed := false;
        reason := 'Schema not whitelisted for gasless attestations';
        RETURN;
    END IF;

    IF NOT v_schema.enabled THEN
        allowed := false;
        reason := 'Schema is currently disabled for gasless attestations';
        RETURN;
    END IF;

    -- Check global daily limit (unless exempt)
    IF NOT v_schema.exempt_from_global_limit THEN
        v_global_count := get_user_daily_attestation_count(p_user_id);
        IF v_global_count >= v_config.daily_global_limit_per_user THEN
            allowed := false;
            reason := format('Daily global limit exceeded (%s/%s)', v_global_count, v_config.daily_global_limit_per_user);
            RETURN;
        END IF;
    END IF;

    -- Check per-schema daily limit (if set)
    IF v_schema.daily_limit_per_user IS NOT NULL THEN
        v_schema_count := get_user_schema_daily_attestation_count(p_user_id, p_schema_uid);
        IF v_schema_count >= v_schema.daily_limit_per_user THEN
            allowed := false;
            reason := format('Daily limit for this schema exceeded (%s/%s)', v_schema_count, v_schema.daily_limit_per_user);
            RETURN;
        END IF;
    END IF;

    -- All checks passed
    allowed := true;
    reason := 'Rate limit check passed';
END;
$$;

-- ============================================================================
-- Updated_at Triggers
-- ============================================================================

-- Create trigger function for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers to tables with updated_at
CREATE TRIGGER update_gasless_config_updated_at BEFORE UPDATE ON public.gasless_config
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_gasless_chains_updated_at BEFORE UPDATE ON public.gasless_chains
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_gasless_schemas_updated_at BEFORE UPDATE ON public.gasless_schemas
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_gasless_alerts_updated_at BEFORE UPDATE ON public.gasless_alerts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Comments for Documentation
-- ============================================================================

COMMENT ON TABLE public.gasless_config IS 'Global configuration for gasless attestation system';
COMMENT ON TABLE public.gasless_chains IS 'Whitelisted blockchain networks for gasless attestations';
COMMENT ON TABLE public.gasless_schemas IS 'Whitelisted attestation schemas with rate limits and categories';
COMMENT ON TABLE public.gasless_attestation_log IS 'Log of all gasless attestations for rate limiting and monitoring';
COMMENT ON TABLE public.gasless_alerts IS 'Alert configuration for monitoring service wallet and costs';

COMMENT ON FUNCTION get_user_daily_attestation_count IS 'Returns total attestations made by user today';
COMMENT ON FUNCTION get_user_schema_daily_attestation_count IS 'Returns attestations made by user today for specific schema';
COMMENT ON FUNCTION check_gasless_rate_limit IS 'Checks if user is within rate limits for a schema. Returns allowed boolean and reason text.';
