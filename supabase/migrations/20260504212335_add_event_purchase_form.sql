-- Custom required ticket purchase inputs (besides email).
-- Adds an optional creator-defined form schema per event. Mirrors the existing
-- purchase_confirmation_message pattern: draft column on event_drafts, a private
-- mutable table for the live schema, and a per-ticket response snapshot.
--
-- Field schema and response payload are JSONB. We bound size with
-- pg_column_size() to keep rows small and protect edge function payloads.

-- 1. Draft-side schema lives on event_drafts (mutable while drafting).
ALTER TABLE public.event_drafts
  ADD COLUMN IF NOT EXISTS purchase_form_schema JSONB;

ALTER TABLE public.event_drafts
  DROP CONSTRAINT IF EXISTS event_drafts_purchase_form_schema_size,
  ADD CONSTRAINT event_drafts_purchase_form_schema_size CHECK (
    purchase_form_schema IS NULL
    OR pg_column_size(purchase_form_schema) <= 8192
  );

COMMENT ON COLUMN public.event_drafts.purchase_form_schema IS
  'Optional ordered list of creator-defined required input fields collected at ticket purchase. Validated against a constrained whitelist of field types (short_text, long_text, select, phone, url, number, checkbox).';

-- 2. Private mutable table for the published event's live schema. Service role
-- only; the client must go through manage-event-purchase-form to read/update.
CREATE TABLE IF NOT EXISTS public.event_purchase_form_schemas (
  event_id UUID PRIMARY KEY REFERENCES public.events(id) ON DELETE CASCADE,
  schema_json JSONB NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT event_purchase_form_schemas_size CHECK (pg_column_size(schema_json) <= 8192)
);

ALTER TABLE public.event_purchase_form_schemas ENABLE ROW LEVEL SECURITY;

-- Public read: the schema (field definitions) is needed by the purchase dialog
-- to know what to render. Only the *responses* are private. Writes go through
-- the manage-event-purchase-form edge function (service role) which enforces
-- creator/manager authorization and the additive-only edit rule.
DROP POLICY IF EXISTS "public_read_event_purchase_form_schemas"
  ON public.event_purchase_form_schemas;
CREATE POLICY "public_read_event_purchase_form_schemas"
  ON public.event_purchase_form_schemas
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "service_role_write_event_purchase_form_schemas"
  ON public.event_purchase_form_schemas;
CREATE POLICY "service_role_write_event_purchase_form_schemas"
  ON public.event_purchase_form_schemas
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.event_purchase_form_schemas IS
  'Live, mutable purchase-form schema for each event. Field definitions are public read so the purchase dialog can render them, but writes are restricted to service-role edge functions (manage-event-purchase-form) which enforce creator/manager auth and additive-only edits after a ticket has been issued.';

-- 3. Per-ticket snapshot. Captures the schema version + the attendee's response
-- at the moment of issuance so future schema edits cannot rewrite history.
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS purchase_form_response_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS purchase_form_schema_version_at TIMESTAMP WITH TIME ZONE;

-- Worst-case payload (10 long_text fields × 1000 chars each, plus labels and
-- JSON overhead) sits around 14 KB. Cap at 16 KB to leave headroom while still
-- bounding row size.
ALTER TABLE public.tickets
  DROP CONSTRAINT IF EXISTS tickets_purchase_form_response_snapshot_size,
  ADD CONSTRAINT tickets_purchase_form_response_snapshot_size CHECK (
    purchase_form_response_snapshot IS NULL
    OR pg_column_size(purchase_form_response_snapshot) <= 16384
  );

COMMENT ON COLUMN public.tickets.purchase_form_response_snapshot IS
  'Snapshot of the attendees response to the events purchase form, captured at ticket issuance. Includes the field id, label, and value for each populated field plus the schema_updated_at it was validated against.';
COMMENT ON COLUMN public.tickets.purchase_form_schema_version_at IS
  'Value of event_purchase_form_schemas.updated_at at the moment the response snapshot was captured.';

-- 4. Carry the response across the fiat (Paystack) flow: client submits the
-- response to init-paystack-transaction, paystack-grant-keys / webhook copies
-- it onto the ticket.
ALTER TABLE public.paystack_transactions
  ADD COLUMN IF NOT EXISTS purchase_form_response JSONB;

ALTER TABLE public.paystack_transactions
  DROP CONSTRAINT IF EXISTS paystack_transactions_purchase_form_response_size,
  ADD CONSTRAINT paystack_transactions_purchase_form_response_size CHECK (
    purchase_form_response IS NULL
    OR pg_column_size(purchase_form_response) <= 16384
  );

COMMENT ON COLUMN public.paystack_transactions.purchase_form_response IS
  'Server-validated purchase-form response captured at init-paystack-transaction, copied to the ticket snapshot at grant time.';

-- 5. Refresh tickets_public to keep the response snapshot private. Must list
-- the same columns as the prior view so existing client queries keep working.
DROP VIEW IF EXISTS public.tickets_public;

CREATE VIEW public.tickets_public
WITH (security_invoker = on) AS
SELECT
  id,
  event_id,
  owner_wallet,
  payment_transaction_id,
  token_id,
  grant_tx_hash,
  status,
  granted_at,
  expires_at,
  created_at,
  updated_at
  -- Deliberately exclude user_email (privacy)
  -- Deliberately exclude purchase_confirmation_message_snapshot (private to attendee)
  -- Deliberately exclude purchase_form_response_snapshot + purchase_form_schema_version_at
  --   (contains attendee personal data — readable only to ticket owner / event creator
  --    / managers / service role through dedicated endpoints).
FROM public.tickets;

GRANT SELECT ON public.tickets_public TO anon, authenticated;

COMMENT ON VIEW public.tickets_public IS
  'Public projection of tickets that omits user_email, purchase_confirmation_message_snapshot, and purchase_form_response_snapshot. Uses security_invoker so RLS still applies to underlying rows.';

-- 6. Prefill helper. Mirrors `get_my_ticket_email` — returns the most recent
-- non-null answer per field id across the wallet's tickets. Used by the
-- purchase dialogs to prefill known-good answers (the user can always
-- overwrite). Same access shape as the email helper for consistency.
CREATE OR REPLACE FUNCTION public.get_my_purchase_form_prefill(p_owner_wallet TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB := '{}'::JSONB;
  v_row RECORD;
BEGIN
  IF p_owner_wallet IS NULL OR p_owner_wallet = '' THEN
    RETURN v_result;
  END IF;

  FOR v_row IN
    SELECT t.purchase_form_response_snapshot AS snap
    FROM public.tickets t
    WHERE lower(t.owner_wallet) = lower(p_owner_wallet)
      AND t.purchase_form_response_snapshot IS NOT NULL
    ORDER BY t.created_at DESC
    LIMIT 25
  LOOP
    -- Merge oldest-takes-precedence so newer answers override older ones,
    -- but missing keys fall through. We iterate newest-first; merge result
    -- with snap as the override only for keys we haven't seen yet.
    IF v_row.snap ? 'values' THEN
      v_result := (v_row.snap->'values') || v_result;
    END IF;
  END LOOP;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_purchase_form_prefill(TEXT) TO authenticated, anon;
COMMENT ON FUNCTION public.get_my_purchase_form_prefill(TEXT) IS
  'Returns a JSONB { field_id: value } map of the wallet''s most recent purchase-form answers (across any event). Used to prefill the purchase dialog. The user can always overwrite.';
