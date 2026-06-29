-- Lock ticket email prefill behind the authenticated Edge Function.
-- The function reads private ticket emails, so browser clients must not call it directly.

REVOKE ALL ON FUNCTION public.get_my_ticket_email(TEXT)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_my_ticket_email(TEXT)
  TO service_role;

COMMENT ON FUNCTION public.get_my_ticket_email(TEXT) IS
  'Service-role helper for get-purchase-form-prefill. Returns a prior ticket email only after the Edge Function validates the requested wallet against the authenticated Privy user.';
