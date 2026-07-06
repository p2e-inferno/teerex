-- claim_social_link / release_social_link mutate identity bindings and must be service-role only.
-- The original migration revoked PUBLIC but not anon/authenticated, which keep EXECUTE via
-- Supabase default privileges, leaving both callable over PostgREST rpc.
REVOKE ALL ON FUNCTION public.claim_social_link(TEXT, TEXT, TEXT, TEXT) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.release_social_link(TEXT, TEXT, TEXT) FROM anon, authenticated;
