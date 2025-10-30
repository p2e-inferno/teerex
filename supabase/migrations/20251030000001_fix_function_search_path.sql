-- Fix Security Advisory: Function Search Path Mutable
-- Adds explicit search_path to all SECURITY DEFINER functions to prevent
-- search path manipulation attacks

-- ============================================================================
-- Fix Gasless Attestation Functions
-- ============================================================================

-- Fix get_user_daily_attestation_count
CREATE OR REPLACE FUNCTION get_user_daily_attestation_count(p_user_id TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

-- Fix get_user_schema_daily_attestation_count
CREATE OR REPLACE FUNCTION get_user_schema_daily_attestation_count(
    p_user_id TEXT,
    p_schema_uid TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

-- Fix check_gasless_rate_limit
CREATE OR REPLACE FUNCTION check_gasless_rate_limit(
    p_user_id TEXT,
    p_schema_uid TEXT,
    OUT allowed BOOLEAN,
    OUT reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

-- Fix update_updated_at_column trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- ============================================================================
-- Fix Existing Functions (from other migrations)
-- ============================================================================

-- Fix populate_attestation_addresses (trigger function for attestations table)
CREATE OR REPLACE FUNCTION public.populate_attestation_addresses()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If event_id is provided, populate lock_address and creator_address
  IF NEW.event_id IS NOT NULL THEN
    SELECT e.lock_address, e.creator_id
    INTO NEW.lock_address, NEW.creator_address
    FROM public.events e
    WHERE e.id = NEW.event_id;

    -- Ensure creator_address is valid (42 chars) or NULL
    IF NEW.creator_address IS NOT NULL AND length(NEW.creator_address) != 42 THEN
      NEW.creator_address := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Fix update_reputation_score (reputation calculation function)
CREATE OR REPLACE FUNCTION public.update_reputation_score(
  user_addr TEXT,
  score_change INTEGER,
  attestation_type TEXT DEFAULT 'attestation'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert or update reputation record
  INSERT INTO public.user_reputation (user_address, reputation_score, total_attestations, honest_attestations)
  VALUES (user_addr, GREATEST(0, 100 + score_change), 1, CASE WHEN score_change > 0 THEN 1 ELSE 0 END)
  ON CONFLICT (user_address)
  DO UPDATE SET
    reputation_score = GREATEST(0, user_reputation.reputation_score + score_change),
    total_attestations = user_reputation.total_attestations + 1,
    honest_attestations = CASE
      WHEN score_change > 0 THEN user_reputation.honest_attestations + 1
      ELSE user_reputation.honest_attestations
    END,
    dishonest_attestations = CASE
      WHEN score_change < 0 THEN user_reputation.dishonest_attestations + 1
      ELSE user_reputation.dishonest_attestations
    END,
    updated_at = now();
END;
$$;

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON FUNCTION get_user_daily_attestation_count IS 'Fixed: Added explicit search_path for security';
COMMENT ON FUNCTION get_user_schema_daily_attestation_count IS 'Fixed: Added explicit search_path for security';
COMMENT ON FUNCTION check_gasless_rate_limit IS 'Fixed: Added explicit search_path for security';
COMMENT ON FUNCTION update_updated_at_column IS 'Fixed: Added explicit search_path for security';
COMMENT ON FUNCTION populate_attestation_addresses IS 'Fixed: Added explicit search_path for security';
COMMENT ON FUNCTION update_reputation_score IS 'Fixed: Added explicit search_path for security';
