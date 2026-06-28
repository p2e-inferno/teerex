-- Lock event_purchase_form_schemas to server-only access.
-- Field definitions are now served exclusively through edge functions running as
-- service_role: get-purchase-form-prefill (buyers) and manage-event-purchase-form
-- (creators). No browser client reads this table directly, so the public
-- anon/authenticated SELECT path is removed to shrink the attack surface.
-- Writes were already service-role-only via RLS; this also drops the now-dead
-- public read policy. RLS stays enabled with the service_role policy intact.

REVOKE ALL ON TABLE public.event_purchase_form_schemas FROM anon, authenticated;

DROP POLICY IF EXISTS "public_read_event_purchase_form_schemas"
  ON public.event_purchase_form_schemas;
