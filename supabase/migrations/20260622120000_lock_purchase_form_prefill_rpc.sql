-- Lock purchase-form answer prefill behind the authenticated Edge Function.
-- The function reads private ticket response snapshots, so browser clients must not call it directly.

REVOKE ALL ON FUNCTION public.get_my_purchase_form_prefill(TEXT)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_my_purchase_form_prefill(TEXT)
  TO service_role;

COMMENT ON FUNCTION public.get_my_purchase_form_prefill(TEXT) IS
  'Service-role helper for get-purchase-form-prefill. Returns prior purchase-form answers only after the Edge Function validates the requested wallet against the authenticated Privy user.';
