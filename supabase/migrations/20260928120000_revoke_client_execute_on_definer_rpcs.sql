-- Server-only SECURITY DEFINER functions: executable by service_role (edge functions) only.
-- Resolves advisor WARNs anon/authenticated_security_definer_function_executable.
--
-- Not included: get_waitlist_count(uuid) is a public read used by src/hooks/useWaitlistCount.ts.
--
-- update_reputation_score is now called only from edge functions
-- (attest-by-delegation, create-attestation-challenge).
--
-- populate_attestation_addresses() is a trigger function; EXECUTE is only checked at
-- CREATE TRIGGER time, so revoking does not affect the attestations trigger.
-- check_gasless_rate_limit runs as its owner, so its internal calls to the
-- daily-count functions are unaffected.

do $$
declare fn text;
begin
  foreach fn in array array[
    'public.check_gasless_limit(text, text, integer)',
    'public.check_gasless_rate_limit(text, text)',
    'public.get_user_daily_attestation_count(text)',
    'public.get_user_schema_daily_attestation_count(text, text)',
    'public.populate_attestation_addresses()',
    'public.update_reputation_score(text, integer, text)'
  ] loop
    execute format('alter function %s set search_path = public', fn);
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;
